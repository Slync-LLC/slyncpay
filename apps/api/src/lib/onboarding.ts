import { getWingspanClient, type WingspanEnvironment } from "./wingspan.js";
import { decrypt } from "./crypto.js";
import { sanitizeName } from "./worker-repair.js";
import type { WingspanCustomerData } from "@slyncpay/wingspan";

/** Subset of workers.w9SeededData we read for the v2 customer payload. */
interface W9Blob {
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

export interface LowFrictionResult {
  /** Raw Tax-lane status from Wingspan (e.g. "Verified"), or null if unknown. */
  taxStatus: string | null;
  /** Convenience: true when the contractor can deep-link to the payout chooser. */
  taxVerified: boolean;
}

/**
 * Wingspan v2 "low-friction" onboarding for an INDIVIDUAL contractor: create the
 * customer entity, submit identity + tax data (incl. SSN), run the Tax
 * verification, and record W-9 consent — so the contractor can be deep-linked
 * straight to the payout-method chooser instead of the onboarding wizard.
 *
 * Best-effort + idempotent: every step is wrapped so a single failure neither
 * throws nor aborts worker creation. Returns the Tax status so the caller picks
 * the right deep-link. Safe to call repeatedly (e.g. on each onboarding-link
 * fetch) — Wingspan tolerates re-submission and the customer-create "already
 * exists" case is ignored.
 *
 * Acts AS the contractor via `withChild(payeeId)`.
 */
export async function runLowFrictionOnboarding(params: {
  seed: {
    firstName?: string | null | undefined;
    lastName?: string | null | undefined;
    email: string;
    w9SeededData?: unknown;
    /** Plaintext SSN (create path). Takes precedence over ssnEncrypted. */
    ssn?: string | null | undefined;
    /** Encrypted SSN (worker row). Decrypted here when ssn isn't supplied. */
    ssnEncrypted?: string | null | undefined;
  };
  environment: WingspanEnvironment;
  payeeId: string;
  payerId: string;
  workerIdForLog?: string;
}): Promise<LowFrictionResult> {
  const { seed, environment, payeeId, payerId } = params;
  const log = params.workerIdForLog ?? payeeId;
  const wingspan = getWingspanClient(environment).withChild(payeeId);
  const w9 = (seed.w9SeededData ?? {}) as W9Blob;

  // 1. Create the customer entity (idempotent — ignore "already exists").
  try {
    await wingspan.createOnboardingCustomer({ type: "Individual", country: w9.country ?? "US" });
  } catch (err) {
    const msg = (err as Error).message ?? "";
    if (!/already|exist|conflict/i.test(msg)) {
      console.error(`[onboarding] createCustomer ${log}:`, msg);
    }
  }

  // 2. Submit identity + tax data.
  let ssn: string | undefined = seed.ssn ?? undefined;
  if (!ssn && seed.ssnEncrypted) {
    try {
      ssn = decrypt(seed.ssnEncrypted);
    } catch (err) {
      console.error(`[onboarding] ssn decrypt ${log}:`, (err as Error).message);
    }
  }
  const customerData: WingspanCustomerData = { country: w9.country ?? "US" };
  const firstName = sanitizeName(seed.firstName);
  const lastName = sanitizeName(seed.lastName);
  if (firstName) customerData.firstName = firstName;
  if (lastName) customerData.lastName = lastName;
  if (w9.jobTitle) customerData.occupation = w9.jobTitle;
  if (w9.dateOfBirth) customerData.dateOfBirth = w9.dateOfBirth;
  if (ssn) customerData.individualTaxId = ssn;
  if (w9.addressLine1) customerData.addressLine1 = w9.addressLine1;
  if (w9.addressLine2) customerData.addressLine2 = w9.addressLine2;
  if (w9.city) customerData.city = w9.city;
  if (w9.state) customerData.region = w9.state;
  if (w9.postalCode) customerData.postalCode = w9.postalCode;
  if (seed.email) customerData.email = seed.email;
  if (w9.phone) customerData.phoneNumber = w9.phone;
  try {
    await wingspan.updateOnboardingCustomer(customerData);
  } catch (err) {
    console.error(`[onboarding] updateCustomer ${log}:`, (err as Error).message);
  }

  // 3. Run the Tax verification (TIN/W-9). Banking is intentionally skipped —
  //    it only matters for the Wingspan Wallet, which the nurse can pick later.
  try {
    await wingspan.runOnboardingVerification("Tax");
  } catch (err) {
    console.error(`[onboarding] verifyTax ${log}:`, (err as Error).message);
  }

  // 4. Record W-9 consent against the payer that pays them.
  try {
    await wingspan.recordW9Consent(payerId);
  } catch (err) {
    console.error(`[onboarding] w9Consent ${log}:`, (err as Error).message);
  }

  // 5. Read back the Tax status.
  let taxStatus: string | null = null;
  try {
    taxStatus = parseTaxStatus(await wingspan.getOnboardingVerifications());
  } catch (err) {
    console.error(`[onboarding] getVerifications ${log}:`, (err as Error).message);
  }

  return { taxStatus, taxVerified: taxStatus?.toLowerCase() === "verified" };
}

/**
 * Pull the Tax lane status out of the verifications response. The envelope shape
 * isn't strictly specified, so search the common containers for a `tax` key and
 * its `status` (string lane value or `{ status }` object).
 */
function parseTaxStatus(v: unknown): string | null {
  if (!v || typeof v !== "object") return null;
  const root = v as Record<string, unknown>;
  const containers = [root, root["verifications"], root["data"]].filter(
    (x): x is Record<string, unknown> => !!x && typeof x === "object",
  );
  for (const c of containers) {
    for (const [k, val] of Object.entries(c)) {
      if (k.toLowerCase() !== "tax") continue;
      if (typeof val === "string") return val;
      if (val && typeof val === "object") {
        const s = (val as Record<string, unknown>)["status"];
        if (typeof s === "string") return s;
      }
    }
  }
  return null;
}
