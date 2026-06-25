import {
  getWingspanV3PlatformClient,
  wingspanV3OrgId,
  wingspanV3ParentAccountId,
  hasV3OnboardingConfig,
  type WingspanEnvironment,
} from "./wingspan.js";
import { decrypt } from "./crypto.js";
import { sanitizeName } from "./worker-repair.js";

/**
 * PREVIEW — Wingspan v3 server-side onboarding (Flow 2, individual). Lands in
 * Wingspan staging ~next week; field shapes are still directional. This adapter
 * is NOT wired into the worker create path — it runs only when
 * WINGSPAN_V3_ONBOARDING is on AND the environment is test, via a guarded admin
 * endpoint, so we can validate the call chain the moment v3 reaches staging.
 *
 * Model: Account → Payee → platform-asserted association → principal
 * Stakeholder → Individual Compliance Entity → verify(Tax).
 */
export async function runV3OnboardingPreviewIndividual(params: {
  environment: WingspanEnvironment;
  externalId: string;
  email: string;
  firstName?: string | null | undefined;
  lastName?: string | null | undefined;
  dateOfBirth?: string | undefined;
  address?: {
    line1?: string | undefined;
    city?: string | undefined;
    state?: string | undefined;
    postalCode?: string | undefined;
    country?: string | undefined;
  };
  ssnEncrypted?: string | null | undefined;
  acceptedAtIso: string; // pass new Date().toISOString() from the caller
}): Promise<{
  accountId: string;
  payeeId: string;
  complianceEntityId: string;
  verify: unknown;
}> {
  const { environment } = params;
  if (!hasV3OnboardingConfig(environment)) {
    throw new Error("v3 onboarding is not enabled/configured for this environment");
  }

  const platform = getWingspanV3PlatformClient(environment);
  const orgId = wingspanV3OrgId(environment);
  const payerAccountId = wingspanV3ParentAccountId(environment);
  const firstName = sanitizeName(params.firstName);
  const lastName = sanitizeName(params.lastName);
  const displayName = [firstName, lastName].filter(Boolean).join(" ") || params.email;

  // 1. Create the regulated payee Account (no login, no identity yet).
  const account = await platform.createAccount(
    {
      externalId: params.externalId,
      organizationId: orgId,
      parentAccountId: payerAccountId,
      profile: { displayName },
    },
    `acct-${params.externalId}`,
  );

  // 2. Create the payer-side Payee record.
  const payee = await platform
    .withAccount(payerAccountId)
    .createPayeeV3(
      { email: params.email, externalId: params.externalId, profile: { displayName } },
      `payee-${params.externalId}`,
    );

  // 3. Bind Payee → Account with a platform-asserted authority (no payee accept).
  await platform.withAccount(payerAccountId).associatePayeeAccount(payee.id, {
    payeeAccountId: account.id,
    authority: {
      type: "PlatformAsserted",
      basis: "ContractorAgreement",
      externalAgreementId: params.externalId,
      acceptedAt: params.acceptedAtIso,
      consentVersion: "nurseio-payments-v1",
    },
  });

  // 4. Add the no-login principal Stakeholder.
  const stakeholder = await platform.withAccount(account.id).addStakeholder(
    account.id,
    {
      memberType: "Person",
      email: params.email,
      externalId: params.externalId,
      isPrincipal: true,
      isController: true,
      ownershipPercentage: 100,
    },
    `principal-${account.id}`,
  );

  // 5. Create the Individual Compliance Entity (identity + tax; SSN write-only).
  let ssn: string | undefined;
  if (params.ssnEncrypted) {
    try {
      ssn = decrypt(params.ssnEncrypted);
    } catch {
      // best-effort; verification will report missing tax id
    }
  }
  const complianceEntity = await platform.withAccount(account.id).createComplianceEntity(
    {
      type: "Individual",
      jurisdictionCountry: "US",
      subject: { type: "Stakeholder", id: stakeholder.id },
      individualLegalName: { firstName, lastName },
      ...(params.dateOfBirth ? { dateOfBirth: params.dateOfBirth } : {}),
      ...(params.address
        ? {
            physicalAddress: {
              line1: params.address.line1,
              city: params.address.city,
              state: params.address.state,
              postalCode: params.address.postalCode,
              country: params.address.country ?? "US",
            },
          }
        : {}),
      ...(ssn ? { taxIdentifiers: [{ countryCode: "US", type: "SSN", value: ssn }] } : {}),
    },
    `ce-${stakeholder.id}`,
  );

  // 6. Verify the Tax lane (reuse a prior in-window verification when possible).
  const verify = await platform
    .withAccount(account.id)
    .verifyComplianceEntity(complianceEntity.id, { level: "Tax", reusePolicy: "ResolveExisting" });

  return {
    accountId: account.id,
    payeeId: payee.id,
    complianceEntityId: complianceEntity.id,
    verify,
  };
}

/**
 * PREVIEW / TODO — Flow 3 (v3 business). Same Account/Payee/association, plus a
 * Business Compliance Entity for the EIN and one Individual Compliance Entity per
 * controlling person (authorized rep + 25%+ owners). Field names and the
 * verification sequence are still being confirmed by Wingspan; not implemented.
 */
export async function runV3OnboardingPreviewBusiness(): Promise<never> {
  throw new Error("v3 business onboarding (Flow 3) is preview-only and not yet implemented");
}
