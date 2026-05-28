import { eq } from "@slyncpay/db";
import { db, contractors, tenants } from "@slyncpay/db";
import { getWingspanClient, type WingspanEnvironment } from "./wingspan.js";
import { decrypt } from "./crypto.js";

interface W9Seed {
  middleName?: string;
  jobTitle?: string;
  dateOfBirth?: string;
  phone?: string;
  country?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
}

/**
 * Push the latest contractor data into Wingspan so the embedded onboarding
 * form shows pre-filled values. Best-effort: errors are logged and swallowed
 * — we never want this to block returning the onboarding link.
 */
export async function syncContractorToWingspan(
  contractor: typeof contractors.$inferSelect,
  environment: WingspanEnvironment,
  payeeId: string,
): Promise<void> {
  const [tenant] = await db
    .select({
      wingspanPayeeBucketUserId: tenants.wingspanPayeeBucketUserId,
      wingspanPayeeBucketUserIdSandbox: tenants.wingspanPayeeBucketUserIdSandbox,
    })
    .from(tenants)
    .where(eq(tenants.id, contractor.tenantId))
    .limit(1);
  const payeeBucketUserId =
    environment === "test"
      ? tenant?.wingspanPayeeBucketUserIdSandbox
      : tenant?.wingspanPayeeBucketUserId;
  if (!payeeBucketUserId) return;

  const w9 = (contractor.w9SeededData ?? {}) as W9Seed;
  // Wingspan only accepts country/address/ssn inside payeeW9Data; middleName /
  // jobTitle / dateOfBirth / phone are silently dropped, so we keep them in
  // SlyncPay only.
  const payeeW9: Record<string, string> = {};
  if (w9.country) payeeW9["country"] = w9.country;
  if (w9.addressLine1) payeeW9["addressLine1"] = w9.addressLine1;
  if (w9.addressLine2) payeeW9["addressLine2"] = w9.addressLine2;
  if (w9.city) payeeW9["city"] = w9.city;
  if (w9.state) payeeW9["state"] = w9.state;
  if (w9.postalCode) payeeW9["postalCode"] = w9.postalCode;

  if (contractor.ssnEncrypted) {
    try {
      payeeW9["ssn"] = decrypt(contractor.ssnEncrypted);
    } catch (err) {
      console.error(`[contractor-sync] failed to decrypt ssn for ${contractor.id}:`, (err as Error).message);
    }
  }

  try {
    await getWingspanClient(environment).withChild(payeeBucketUserId).updatePayee(payeeId, {
      ...(contractor.firstName ? { firstName: contractor.firstName } : {}),
      ...(contractor.lastName ? { lastName: contractor.lastName } : {}),
      payeeExternalId: contractor.externalId,
      ...(Object.keys(payeeW9).length ? { payeeW9Data: payeeW9 } : {}),
    });
  } catch (err) {
    console.error(`[contractor-sync] updatePayee failed for ${contractor.id}:`, (err as Error).message);
  }
}

/**
 * Backfills a contractor's wingspanUserId for legacy rows missing it.
 *
 * Order of attempts:
 *  1. If wingspanPayeeBucketPayeeId is set → GET /payments/payee/{id} and pull
 *     user.userId out.
 *  2. Otherwise (or if step 1 returns 404 — usually means the payeeId was
 *     created in the wrong env) → POST /payments/payee in the correct env to
 *     create / re-link the payee. Wingspan returns the existing record when
 *     called with an email already on file in that org.
 *
 * Returns the resolved Wingspan userId, or null if neither path succeeded.
 */
export async function repairContractorWingspanUserId(
  contractor: typeof contractors.$inferSelect,
  environment: WingspanEnvironment,
): Promise<string | null> {
  // In Wingspan a payee's user shares the same id as the payeeId — session
  // tokens against /users/organization/user/{payeeId}/session resolve to the
  // payee user. So if we have the payeeId we already have the userId.
  if (contractor.wingspanPayeeBucketPayeeId) {
    await db
      .update(contractors)
      .set({ wingspanUserId: contractor.wingspanPayeeBucketPayeeId })
      .where(eq(contractors.id, contractor.id));
    return contractor.wingspanPayeeBucketPayeeId;
  }

  // No payeeId at all → recreate from the tenant's payee bucket in the right env.
  const [tenant] = await db
    .select({
      wingspanPayeeBucketUserId: tenants.wingspanPayeeBucketUserId,
      wingspanPayeeBucketUserIdSandbox: tenants.wingspanPayeeBucketUserIdSandbox,
    })
    .from(tenants)
    .where(eq(tenants.id, contractor.tenantId))
    .limit(1);

  const payeeBucketUserId =
    environment === "test"
      ? tenant?.wingspanPayeeBucketUserIdSandbox
      : tenant?.wingspanPayeeBucketUserId;
  if (!payeeBucketUserId) return null;

  try {
    const wingspan = getWingspanClient(environment);
    const created = await wingspan.withChild(payeeBucketUserId).createPayee({
      email: contractor.email,
      ...(contractor.firstName ? { firstName: contractor.firstName } : {}),
      ...(contractor.lastName ? { lastName: contractor.lastName } : {}),
      payeeExternalId: contractor.externalId,
      status: "Active",
    });
    const resolvedUserId = created.user?.userId ?? created.payeeId;
    if (!resolvedUserId) return null;
    await db
      .update(contractors)
      .set({ wingspanUserId: resolvedUserId, wingspanPayeeBucketPayeeId: created.payeeId })
      .where(eq(contractors.id, contractor.id));
    return resolvedUserId;
  } catch (err) {
    console.error(`[contractor-repair] createPayee failed for ${contractor.id}:`, (err as Error).message);
    return null;
  }
}
