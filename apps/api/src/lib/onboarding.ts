import { getWingspanClient, type WingspanEnvironment } from "./wingspan.js";
import { decrypt } from "./crypto.js";
import { sanitizeName } from "./worker-repair.js";
import {
  WINGSPAN_ACK_VERSIONS,
  type WingspanCustomerData,
  type WingspanBusinessData,
  type WingspanFederalTaxClassification,
} from "@slyncpay/wingspan";

interface AddrBlob {
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

/** Subset of workers.w9SeededData we read for the v2 customer payload. */
interface W9Blob extends AddrBlob {
  jobTitle?: string;
  dateOfBirth?: string;
  phone?: string;
  // Business contractor fields (present when contractorType === "business"). The
  // personal address fields above are the representative's home address.
  contractorType?: "individual" | "business";
  legalBusinessName?: string;
  federalTaxClassification?: WingspanFederalTaxClassification;
  regionOfFormation?: string;
  yearOfFormation?: string;
  businessPhone?: string;
  businessEmail?: string;
  businessWebsite?: string;
  businessIndustry?: string;
  ownershipPercent?: string;
  businessAddress?: AddrBlob;
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
    /** Plaintext EIN (business, create path). Takes precedence over einEncrypted. */
    ein?: string | null | undefined;
    /** Encrypted EIN (business, worker row). */
    einEncrypted?: string | null | undefined;
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
  const isBusiness = w9.contractorType === "business";

  const ssn = decryptOr(seed.ssn, seed.ssnEncrypted, `ssn ${log}`);

  // 1. Create the customer entity (idempotent — ignore "already exists").
  try {
    await wingspan.createOnboardingCustomer({
      type: isBusiness ? "Business" : "Individual",
      country: w9.country ?? "US",
    });
  } catch (err) {
    const msg = (err as Error).message ?? "";
    if (!/already|exist|conflict/i.test(msg)) {
      console.error(`[onboarding] createCustomer ${log}:`, msg);
    }
  }

  // 2. Submit the entity data. For an individual that's identity + tax; for a
  //    business it's the company block plus a separate Representative (the human
  //    whose SSN drives the identity check).
  const firstName = sanitizeName(seed.firstName);
  const lastName = sanitizeName(seed.lastName);

  if (isBusiness) {
    const ein = decryptOr(seed.ein, seed.einEncrypted, `ein ${log}`);
    const biz: WingspanBusinessData = { country: w9.country ?? "US" };
    if (w9.legalBusinessName) biz.legalBusinessName = w9.legalBusinessName;
    if (ein) biz.businessTaxId = ein;
    if (w9.federalTaxClassification) biz.federalTaxClassification = w9.federalTaxClassification;
    if (w9.regionOfFormation) biz.regionOfFormation = w9.regionOfFormation;
    if (w9.yearOfFormation) biz.yearOfFormation = w9.yearOfFormation;
    const bizPhone = toE164(w9.businessPhone);
    if (bizPhone) biz.phoneNumber = bizPhone;
    if (w9.businessEmail) biz.email = w9.businessEmail;
    if (w9.businessWebsite) biz.website = w9.businessWebsite;
    if (w9.businessIndustry) biz.industry = w9.businessIndustry;
    const ba = w9.businessAddress ?? {};
    if (ba.addressLine1) biz.addressLine1 = ba.addressLine1;
    if (ba.addressLine2) biz.addressLine2 = ba.addressLine2;
    if (ba.city) biz.city = ba.city;
    if (ba.state) biz.region = ba.state;
    if (ba.postalCode) biz.postalCode = ba.postalCode;
    try {
      await wingspan.updateOnboardingCustomer(biz);
    } catch (err) {
      console.error(`[onboarding] updateBusinessEntity ${log}:`, (err as Error).message);
    }

    // The authorized representative (their SSN drives the identity check).
    const rep: WingspanCustomerData = { country: w9.country ?? "US" };
    if (firstName) rep.firstName = firstName;
    if (lastName) rep.lastName = lastName;
    if (w9.dateOfBirth) rep.dateOfBirth = w9.dateOfBirth;
    if (ssn) rep.individualTaxId = ssn;
    if (w9.ownershipPercent) rep.ownershipPercent = w9.ownershipPercent;
    if (w9.jobTitle) rep.occupation = w9.jobTitle;
    const repPhone = toE164(w9.phone);
    if (repPhone) rep.phoneNumber = repPhone;
    if (seed.email) rep.email = seed.email;
    if (w9.addressLine1) rep.addressLine1 = w9.addressLine1;
    if (w9.addressLine2) rep.addressLine2 = w9.addressLine2;
    if (w9.city) rep.city = w9.city;
    if (w9.state) rep.region = w9.state;
    if (w9.postalCode) rep.postalCode = w9.postalCode;
    try {
      await wingspan.updateOnboardingRepresentative(rep);
    } catch (err) {
      console.error(`[onboarding] updateRepresentative ${log}:`, (err as Error).message);
    }
  } else {
    const customerData: WingspanCustomerData = { country: w9.country ?? "US" };
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
    const indPhone = toE164(w9.phone);
    if (indPhone) customerData.phoneNumber = indPhone;
    try {
      await wingspan.updateOnboardingCustomer(customerData);
    } catch (err) {
      console.error(`[onboarding] updateCustomer ${log}:`, (err as Error).message);
    }
  }

  // 3. The remaining steps are all independent of each other (verifications, the
  //    W-9 + 1099 + Wallet acknowledgements, and the share-W-9 consent), so fire
  //    them CONCURRENTLY — running them serially is what made this ~10s. Each is
  //    best-effort. W9Certification is the ACTUAL W-9 certification; the Wallet
  //    acks + Banking verification pre-activate the Wingspan Wallet so it's a
  //    selectable/defaultable payout option (the Wallet Visa CARD is separately
  //    pending on Wingspan).
  const ack = (name: keyof typeof WINGSPAN_ACK_VERSIONS) =>
    wingspan.postOnboardingAcknowledgement(name, WINGSPAN_ACK_VERSIONS[name]);
  const tasks: Array<[string, Promise<unknown>]> = [
    ["verifyTax", wingspan.runOnboardingVerification("Tax")],
    ["w9Certification", ack("W9Certification")],
    ["electronicTaxFormConsent", ack("ElectronicTaxFormConsent")],
    ["w9Consent", wingspan.recordW9Consent(payerId)],
    ["ack:WingspanTosAcceptance", ack("WingspanTosAcceptance")],
    ["ack:WingspanPrivacyPolicyAcceptance", ack("WingspanPrivacyPolicyAcceptance")],
    ["ack:DepositAccountHolderAgreement", ack("DepositAccountHolderAgreement")],
    ["ack:LeadBankTerms", ack("LeadBankTerms")],
    ["ack:ElectronicDisclosureAndConsent", ack("ElectronicDisclosureAndConsent")],
    // Wallet Visa card acks — post them so the embedded Wallet option isn't
    // gated on missing card consents. (Actual card issuance is still pending on
    // Wingspan's side; these acks are harmless if it's the issuance that blocks.)
    ["ack:DebitCardHolderAgreement", ack("DebitCardHolderAgreement")],
    ["ack:CashBackPromotionAgreement", ack("CashBackPromotionAgreement")],
    ["verifyBanking", wingspan.runOnboardingVerification("Banking")],
  ];
  await Promise.all(
    tasks.map(([label, p]) =>
      p.catch((err: unknown) => console.error(`[onboarding] ${label} ${log}:`, (err as Error).message)),
    ),
  );

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
 * Wingspan v2 requires E.164 phone numbers — and rejects the ENTIRE customerData
 * PATCH (every field reads "missing", tax can't verify) if the phone isn't E.164.
 * Our stored phone is bare digits, so normalize to +1XXXXXXXXXX for US.
 */
function toE164(phone: string | null | undefined): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return undefined;
  if (phone.trim().startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`; // best effort for other lengths
}

/** Return the plaintext if given, else decrypt the ciphertext (best-effort). */
function decryptOr(
  plaintext: string | null | undefined,
  ciphertext: string | null | undefined,
  label: string,
): string | undefined {
  if (plaintext) return plaintext;
  if (!ciphertext) return undefined;
  try {
    return decrypt(ciphertext);
  } catch (err) {
    console.error(`[onboarding] decrypt ${label}:`, (err as Error).message);
    return undefined;
  }
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
