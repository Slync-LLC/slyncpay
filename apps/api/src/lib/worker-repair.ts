import { eq } from "@slyncpay/db";
import { db, workers, tenants } from "@slyncpay/db";
import { getWingspanClient, type WingspanEnvironment } from "./wingspan.js";
import { decrypt } from "./crypto.js";
import type { WingspanAddress, WingspanCompany, WingspanCompanyStructure } from "@slyncpay/wingspan";

interface AddressSeed {
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

/**
 * Shape of `workers.w9SeededData`. Holds the contractor's prefill data: the
 * personal fields (also used for the business rep's identity + home address)
 * plus, for business contractors, the company block and business address. The
 * EIN itself is NOT stored here — it lives encrypted in `workers.einEncrypted`.
 */
interface W9Seed extends AddressSeed {
  middleName?: string;
  jobTitle?: string;
  dateOfBirth?: string;
  phone?: string;
  // Business contractor fields
  contractorType?: "individual" | "business";
  legalBusinessName?: string;
  structure?: WingspanCompanyStructure;
  stateOfIncorporation?: string;
  yearOfIncorporation?: string;
  businessPhone?: string;
  businessAddress?: AddressSeed;
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
    /** Plaintext EIN (create path). Takes precedence over einEncrypted. */
    ein?: string | null | undefined;
    /** Encrypted EIN (worker row). Decrypted here when ein isn't supplied. */
    einEncrypted?: string | null | undefined;
  },
  environment: WingspanEnvironment,
  payeeId: string,
  workerIdForLog: string = payeeId,
): Promise<void> {
  const w9 = (seed.w9SeededData ?? {}) as W9Seed;
  const wingspan = getWingspanClient(environment).withChild(payeeId);

  let einPlaintext: string | undefined = seed.ein ?? undefined;
  if (!einPlaintext && seed.einEncrypted) {
    try {
      einPlaintext = decrypt(seed.einEncrypted);
    } catch (err) {
      console.error(`[worker-sync] failed to decrypt ein for ${workerIdForLog}:`, (err as Error).message);
    }
  }

  // PATCH /users/user/{payeeId} — name + DOB + occupation. Field is `dob` (NOT
  // `dateOfBirth`); `preferredName` + `middleName` also pre-fill. For business
  // contractors this is the Authorized Representative's identity.
  // Wingspan rejects digits in the legal name fields (firstName/middleName/
  // lastName) with a 400 ValidationError — verified against staging 2026-06-24
  // (preferredName + occupation tolerate them). Strip digits before seeding.
  const firstName = sanitizeName(seed.firstName);
  const middleName = sanitizeName(w9.middleName);
  const lastName = sanitizeName(seed.lastName);
  const preferredName = [firstName, lastName].filter(Boolean).join(" ");
  const userProfile: {
    firstName?: string;
    middleName?: string;
    lastName?: string;
    preferredName?: string;
    dob?: string;
    occupation?: string;
  } = {};
  if (firstName) userProfile.firstName = firstName;
  if (middleName) userProfile.middleName = middleName;
  if (lastName) userProfile.lastName = lastName;
  if (preferredName) userProfile.preferredName = preferredName;
  if (w9.dateOfBirth) userProfile.dob = w9.dateOfBirth;
  if (w9.jobTitle) userProfile.occupation = w9.jobTitle;
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

  // PATCH /users/user/member/{payeeId} — address (+ company block / home address
  // for businesses). memberId is injected by the client. For an individual the
  // personal address is `address`; for a business, `address` is the business
  // address and `homeAddress` is the rep's personal address.
  const personalAddr = buildAddress(w9);
  const isBusiness = w9.contractorType === "business";

  const memberProfile: {
    company?: WingspanCompany;
    address?: WingspanAddress;
    homeAddress?: WingspanAddress;
  } = {};

  if (isBusiness) {
    const company: WingspanCompany = {};
    if (w9.legalBusinessName) company.legalBusinessName = w9.legalBusinessName;
    if (einPlaintext) company.taxId = einPlaintext;
    if (w9.structure) company.structure = w9.structure;
    if (w9.businessPhone) company.phoneNumber = w9.businessPhone;
    if (w9.stateOfIncorporation) company.stateOfIncorporation = w9.stateOfIncorporation;
    if (w9.yearOfIncorporation) company.yearOfIncorporation = w9.yearOfIncorporation;
    if (Object.keys(company).length) memberProfile.company = company;

    const businessAddr = buildAddress(w9.businessAddress ?? {});
    if (Object.keys(businessAddr).length) memberProfile.address = businessAddr;
    if (Object.keys(personalAddr).length) memberProfile.homeAddress = personalAddr;
  } else if (Object.keys(personalAddr).length) {
    memberProfile.address = personalAddr;
  }

  if (Object.keys(memberProfile).length) {
    try {
      await wingspan.updateMemberProfile(payeeId, { profile: memberProfile });
    } catch (err) {
      console.error(
        `[worker-sync] updateMemberProfile ${workerIdForLog}:`,
        (err as Error).message,
      );
    }
  }
}

/**
 * Strip digits from a legal name field. Wingspan returns 400 ValidationError if
 * firstName/middleName/lastName contain numbers. Collapses whitespace and
 * returns undefined when nothing usable remains.
 */
export function sanitizeName(s: string | null | undefined): string | undefined {
  if (!s) return undefined;
  const cleaned = s.replace(/[0-9]/g, "").replace(/\s+/g, " ").trim();
  return cleaned || undefined;
}

/** Map our stored address fields onto Wingspan's address shape (drops empties). */
export function buildAddress(src: {
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}): WingspanAddress {
  const a: WingspanAddress = {};
  if (src.addressLine1) a.addressLine1 = src.addressLine1;
  if (src.addressLine2) a.addressLine2 = src.addressLine2;
  if (src.city) a.city = src.city;
  if (src.state) a.state = src.state;
  if (src.postalCode) a.postalCode = src.postalCode;
  if (src.country) a.country = src.country;
  return a;
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
