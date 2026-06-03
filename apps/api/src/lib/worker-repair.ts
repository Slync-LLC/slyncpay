import { eq } from "@slyncpay/db";
import { db, workers, tenants } from "@slyncpay/db";
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
 * Push the latest worker data into Wingspan so the embedded onboarding
 * form shows pre-filled values. Best-effort: errors are logged and swallowed
 * — we never want this to block returning the onboarding link.
 */
export async function syncWorkerToWingspan(
  worker: typeof workers.$inferSelect,
  environment: WingspanEnvironment,
  payeeId: string,
): Promise<void> {
  const [tenant] = await db
    .select({
      wingspanPayeeBucketUserId: tenants.wingspanPayeeBucketUserId,
      wingspanPayeeBucketUserIdSandbox: tenants.wingspanPayeeBucketUserIdSandbox,
    })
    .from(tenants)
    .where(eq(tenants.id, worker.tenantId))
    .limit(1);
  const payeeBucketUserId =
    environment === "test"
      ? tenant?.wingspanPayeeBucketUserIdSandbox
      : tenant?.wingspanPayeeBucketUserId;
  if (!payeeBucketUserId) return;

  const w9 = (worker.w9SeededData ?? {}) as W9Seed;
  // Fields Wingspan accepts inside payerOwnedData.payeeW9Data — confirmed via
  // probe: firstName, lastName, country, addressLine1, addressLine2, city,
  // state, postalCode, ssn. middleName / jobTitle / dateOfBirth / phone are
  // silently dropped (worker fills those in the form themselves).
  const payeeW9: Record<string, string> = {};
  if (worker.firstName) payeeW9["firstName"] = worker.firstName;
  if (worker.lastName) payeeW9["lastName"] = worker.lastName;
  if (w9.country) payeeW9["country"] = w9.country;
  if (w9.addressLine1) payeeW9["addressLine1"] = w9.addressLine1;
  if (w9.addressLine2) payeeW9["addressLine2"] = w9.addressLine2;
  if (w9.city) payeeW9["city"] = w9.city;
  if (w9.state) payeeW9["state"] = w9.state;
  if (w9.postalCode) payeeW9["postalCode"] = w9.postalCode;

  if (worker.ssnEncrypted) {
    try {
      payeeW9["ssn"] = decrypt(worker.ssnEncrypted);
    } catch (err) {
      console.error(`[worker-sync] failed to decrypt ssn for ${worker.id}:`, (err as Error).message);
    }
  }

  try {
    await getWingspanClient(environment).withChild(payeeBucketUserId).updatePayee(payeeId, {
      // Top-level firstName/lastName updates the user's display name too.
      ...(worker.firstName ? { firstName: worker.firstName } : {}),
      ...(worker.lastName ? { lastName: worker.lastName } : {}),
      payeeExternalId: worker.externalId,
      ...(Object.keys(payeeW9).length ? { payeeW9Data: payeeW9 } : {}),
    });
  } catch (err) {
    console.error(`[worker-sync] updatePayee failed for ${worker.id}:`, (err as Error).message);
  }
}

/**
 * Push the worker's prefill fields into the Wingspan User + User.Member
 * records so the onboarding wizard pre-fills. This complements
 * `syncWorkerToWingspan` (which writes payerOwnedData.payeeW9Data for TIN
 * verification) — both code paths are needed because the wizard reads from
 * User/Member, not from payerOwnedData. See the "NurseIO Onboarding
 * Prefill: API Recipe" doc from Wingspan.
 *
 * Auth: parent token + X-WINGSPAN-USER: {payeeId} (impersonation), set via
 * `.withChild(payeeId)`.
 *
 * Best-effort: errors are logged and swallowed so we never block worker
 * creation or onboarding-link generation. SSN and phone intentionally not
 * pushed — Wingspan does not pre-fill them.
 */
export async function syncWorkerProfileToWingspan(
  seed: {
    firstName?: string | null | undefined;
    lastName?: string | null | undefined;
    w9SeededData?: unknown;
  },
  environment: WingspanEnvironment,
  payeeId: string,
  workerIdForLog: string = payeeId,
): Promise<void> {
  const w9 = (seed.w9SeededData ?? {}) as W9Seed;
  const wingspan = getWingspanClient(environment).withChild(payeeId);

  // PATCH /users/user/{payeeId} — name + DOB + occupation
  const userProfile: Record<string, string> = {};
  if (seed.firstName) userProfile["firstName"] = seed.firstName;
  if (seed.lastName) userProfile["lastName"] = seed.lastName;
  if (w9.dateOfBirth) userProfile["dateOfBirth"] = w9.dateOfBirth;
  if (w9.jobTitle) userProfile["occupation"] = w9.jobTitle;
  if (Object.keys(userProfile).length) {
    try {
      await wingspan.updateUserProfile(payeeId, { profile: userProfile });
    } catch (err) {
      console.error(
        `[worker-sync] updateUserProfile ${workerIdForLog}:`,
        (err as Error).message,
      );
    }
  }

  // PATCH /users/user/member/{payeeId} — addresses
  const addr: Record<string, string> = {};
  if (w9.addressLine1) addr["addressLine1"] = w9.addressLine1;
  if (w9.addressLine2) addr["addressLine2"] = w9.addressLine2;
  if (w9.city) addr["city"] = w9.city;
  if (w9.state) addr["state"] = w9.state;
  if (w9.postalCode) addr["postalCode"] = w9.postalCode;
  if (w9.country) addr["country"] = w9.country;

  if (Object.keys(addr).length) {
    try {
      await wingspan.updateMemberProfile(payeeId, {
        profile: { address: addr, homeAddress: addr },
      });
    } catch (err) {
      console.error(
        `[worker-sync] updateMemberProfile ${workerIdForLog}:`,
        (err as Error).message,
      );
    }
  }
}

/**
 * Backfills a worker's wingspanUserId for legacy rows missing it.
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
export async function repairWorkerWingspanUserId(
  worker: typeof workers.$inferSelect,
  environment: WingspanEnvironment,
): Promise<string | null> {
  // In Wingspan a payee's user shares the same id as the payeeId — session
  // tokens against /users/organization/user/{payeeId}/session resolve to the
  // payee user. So if we have the payeeId we already have the userId.
  if (worker.wingspanPayeeBucketPayeeId) {
    await db
      .update(workers)
      .set({ wingspanUserId: worker.wingspanPayeeBucketPayeeId })
      .where(eq(workers.id, worker.id));
    return worker.wingspanPayeeBucketPayeeId;
  }

  // No payeeId at all → recreate from the tenant's payee bucket in the right env.
  const [tenant] = await db
    .select({
      wingspanPayeeBucketUserId: tenants.wingspanPayeeBucketUserId,
      wingspanPayeeBucketUserIdSandbox: tenants.wingspanPayeeBucketUserIdSandbox,
    })
    .from(tenants)
    .where(eq(tenants.id, worker.tenantId))
    .limit(1);

  const payeeBucketUserId =
    environment === "test"
      ? tenant?.wingspanPayeeBucketUserIdSandbox
      : tenant?.wingspanPayeeBucketUserId;
  if (!payeeBucketUserId) return null;

  try {
    const wingspan = getWingspanClient(environment);
    const created = await wingspan.withChild(payeeBucketUserId).createPayee({
      email: worker.email,
      ...(worker.firstName ? { firstName: worker.firstName } : {}),
      ...(worker.lastName ? { lastName: worker.lastName } : {}),
      payeeExternalId: worker.externalId,
      status: "Active",
    });
    const resolvedUserId = created.user?.userId ?? created.payeeId;
    if (!resolvedUserId) return null;
    await db
      .update(workers)
      .set({ wingspanUserId: resolvedUserId, wingspanPayeeBucketPayeeId: created.payeeId })
      .where(eq(workers.id, worker.id));
    return resolvedUserId;
  } catch (err) {
    console.error(`[worker-repair] createPayee failed for ${worker.id}:`, (err as Error).message);
    return null;
  }
}
