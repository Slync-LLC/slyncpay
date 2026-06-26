import type {
  WingspanAssociateResponse,
  WingspanCreateChildUserResponse,
  WingspanCreatePayableResponse,
  WingspanCreatePayeeResponse,
  WingspanCustomFieldBody,
  WingspanCustomFieldResponse,
  WingspanCustomizationBody,
  WingspanPayApprovedResponse,
  WingspanSessionTokenResponse,
} from "./types.js";

export class WingspanApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly wingspanMessage: string,
    public readonly requestId?: string,
  ) {
    super(`Wingspan API error ${statusCode}: ${wingspanMessage}`);
    this.name = "WingspanApiError";
  }
}

/**
 * One outbound Wingspan call, handed to a `onCall` sink for logging. The sink
 * is responsible for redacting secrets (Authorization header, SSN, tokens) —
 * the client passes raw values. Invoked for every call, success or failure.
 */
export interface WingspanCallLog {
  apiVersion: "v1" | "v3";
  method: string;
  url: string;
  path: string;
  requestHeaders: Record<string, string>;
  requestBody?: unknown;
  responseStatus: number | null;
  responseBody?: unknown;
  requestId?: string | null;
  durationMs: number;
  error?: string | undefined;
}

export interface WingspanClientConfig {
  apiToken: string;
  baseUrl?: string;
  /** Optional sink invoked once per request (success or failure). Never throws. */
  onCall?: ((entry: WingspanCallLog) => void) | undefined;
}

/** Federal tax classification accepted by `member.profile.company.structure`. */
export type WingspanCompanyStructure =
  | "SoleProprietorship"
  | "LlcSingleMember"
  | "CorporationS"
  | "CorporationC"
  | "Partnership"
  | "LLCCorporationS"
  | "LLCCorporationC"
  | "LLCPartnership";

export interface WingspanAddress {
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

/** Business block on the Member record (drives the Business Information step). */
export interface WingspanCompany {
  legalBusinessName?: string;
  taxId?: string;
  structure?: WingspanCompanyStructure;
  phoneNumber?: string;
  stateOfIncorporation?: string;
  yearOfIncorporation?: string;
}

/**
 * Identity + tax payload for the v2 low-friction onboarding flow
 * (`PATCH /v2/onboarding/customer/Entity`). NOTE the v2 field names differ from
 * the User/Member records: `region` (not state), `individualTaxId` (the SSN),
 * `dateOfBirth` (not dob).
 */
export interface WingspanCustomerData {
  firstName?: string;
  lastName?: string;
  occupation?: string;
  dateOfBirth?: string;
  country?: string;
  individualTaxId?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  email?: string;
  phoneNumber?: string;
  /** Authorized representative only (business flow): their ownership share. */
  ownershipPercent?: string;
}

/** Federal tax classification for a business customer entity (v2). */
export type WingspanFederalTaxClassification =
  | "SoleProprietorship"
  | "LlcSingleMember"
  | "CorporationS"
  | "CorporationC"
  | "Partnership"
  | "LlcCorporationS"
  | "LlcCorporationC"
  | "NotForProfitOrganization";

/**
 * Business identity payload for `PATCH /v2/onboarding/customer/Entity` when the
 * customer entity was created with `type:"Business"`. `businessTaxId` is the EIN.
 */
export interface WingspanBusinessData {
  legalBusinessName?: string;
  businessTaxId?: string;
  federalTaxClassification?: WingspanFederalTaxClassification;
  regionOfFormation?: string;
  yearOfFormation?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
  phoneNumber?: string;
  email?: string;
  website?: string;
  industry?: string;
}

/** v2 onboarding acknowledgement versions (no API to fetch the current value). */
export const WINGSPAN_ACK_VERSIONS = {
  W9Certification: "2024-03-01",
  W8BenCertification: "2021-10-01",
  ElectronicTaxFormConsent: "2024-08-01",
} as const;

/** v2 verification lanes. */
export type WingspanVerificationLane = "Tax" | "Banking";

/**
 * Response of `GET /v2/onboarding/verifications`. Shape is read defensively —
 * we only care that the Tax lane reports a status (e.g. "Verified"). Indexed
 * access is permissive because the exact envelope may vary by environment.
 */
export interface WingspanVerifications {
  [k: string]: unknown;
}

/**
 * Typed wrapper around the Wingspan API.
 *
 * Authentication pattern (Option A from the integration guide):
 *   Authorization: Bearer {rootToken}
 *   X-WINGSPAN-USER: {childUserId}   ← switches acting child context
 *
 * Call withChild(childUserId) to return a scoped client for that child.
 * The root client (no childUserId) is used for org-level operations.
 */
export class WingspanClient {
  private readonly baseUrl: string;
  private readonly apiToken: string;
  private readonly childUserId: string | null;
  private readonly onCall?: ((entry: WingspanCallLog) => void) | undefined;

  constructor(config: WingspanClientConfig, childUserId: string | null = null) {
    this.apiToken = config.apiToken;
    this.baseUrl = config.baseUrl ?? "https://api.wingspan.app";
    this.childUserId = childUserId;
    this.onCall = config.onCall;
  }

  /** Return a new client scoped to the given child user. */
  withChild(childUserId: string): WingspanClient {
    return new WingspanClient(
      { apiToken: this.apiToken, baseUrl: this.baseUrl, onCall: this.onCall },
      childUserId,
    );
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      Authorization: `Bearer ${this.apiToken}`,
      "Content-Type": "application/json",
    };
    if (this.childUserId) {
      h["X-WINGSPAN-USER"] = this.childUserId;
    }
    return h;
  }

  private async request<T>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const requestHeaders = this.headers();
    const startedAt = Date.now();

    let res: Response | undefined;
    let text = "";
    let json: unknown;
    let networkError: Error | undefined;
    try {
      res = await fetch(url, {
        method,
        headers: requestHeaders,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      text = await res.text();
      try {
        json = JSON.parse(text);
      } catch {
        json = { message: text };
      }
    } catch (err) {
      networkError = err as Error;
    }

    const requestId = res?.headers.get("x-request-id") ?? null;

    if (this.onCall) {
      try {
        this.onCall({
          apiVersion: "v1",
          method,
          url,
          path,
          requestHeaders,
          requestBody: body,
          responseStatus: res?.status ?? null,
          responseBody: networkError ? undefined : json,
          requestId,
          durationMs: Date.now() - startedAt,
          error: networkError
            ? networkError.message
            : res && !res.ok
              ? `HTTP ${res.status}`
              : undefined,
        });
      } catch {
        // Logging must never break the call.
      }
    }

    if (networkError || !res) throw networkError ?? new Error("Wingspan request failed");

    if (!res.ok) {
      let msg: string;
      if (typeof json === "object" && json !== null) {
        const obj = json as Record<string, unknown>;
        if ("message" in obj) msg = String(obj["message"]);
        else if ("error" in obj) msg = String(obj["error"]);
        else msg = `HTTP ${res.status} ${text.slice(0, 200)}`;
      } else {
        msg = `HTTP ${res.status} ${text.slice(0, 200)}`;
      }
      throw new WingspanApiError(res.status, msg, requestId ?? undefined);
    }

    return json as T;
  }

  // ─── Org / Users ────────────────────────────────────────────────────────────

  /** Create a child user owned by this root parent. */
  createChildUser(email: string, preferredName: string): Promise<WingspanCreateChildUserResponse> {
    return this.request("POST", "/users/organization/user", {
      email,
      profile: { preferredName },
    });
  }

  /** Associate a child user with the root parent. */
  associateChildUser(
    childUserId: string,
    parentUserId: string,
  ): Promise<WingspanAssociateResponse> {
    return this.request("POST", `/users/organization/user/${childUserId}/associate`, {
      parentUserId,
      inheritanceStrategy: {
        organizationAccountConfig: "Parent",
        wingspanAccount: "None",
        externalFinancialAccounts: "None",
        wingspanFinancialSettings: "None",
        fundingSource: "None",
        payoutSettings: "None",
      },
    });
  }

  /** Generate a short-lived session token for a contractor (for embedded onboarding). */
  getSessionToken(providerUserId: string): Promise<WingspanSessionTokenResponse> {
    return this.request("GET", `/users/organization/user/${providerUserId}/session`);
  }

  /**
   * Fetch a user record. Used to detect the "already a Wingspan user with
   * another org" gotcha: when POST /payments/payee returns an existing user,
   * organizationAssociation is null instead of pointing at our parent.
   */
  getUser(userId: string): Promise<{
    userId: string;
    organizationAssociation: { parentUserId: string } | null;
    [k: string]: unknown;
  }> {
    return this.request("GET", `/users/user/${userId}`);
  }

  /**
   * Patch the User record (name, DOB, occupation). The wizard reads from
   * this record, not from payerOwnedData.payeeW9Data — both are needed for
   * full pre-fill (W9 data → TIN verification; user/member → wizard UI).
   *
   * Must be called with X-WINGSPAN-USER: {payeeId} (impersonation) — use
   * `.withChild(payeeId)`. The field is `dob`, NOT `dateOfBirth` (verified
   * against Wingspan staging 2026-06-24).
   */
  updateUserProfile(
    userId: string,
    body: {
      profile?: {
        firstName?: string;
        middleName?: string;
        lastName?: string;
        preferredName?: string;
        dob?: string;
        occupation?: string;
      };
    },
  ): Promise<unknown> {
    return this.request("PATCH", `/users/user/${userId}`, body);
  }

  /**
   * Patch the User.Member record (business info, mailing + home address).
   * Counterpart to updateUserProfile — must be called with the same
   * impersonation header. `memberId` is REQUIRED in the body and equals the
   * path id (omitting it returns 400; verified 2026-06-24).
   */
  updateMemberProfile(
    userId: string,
    body: {
      profile?: {
        company?: WingspanCompany;
        address?: WingspanAddress;
        homeAddress?: WingspanAddress;
      };
    },
  ): Promise<unknown> {
    return this.request("PATCH", `/users/user/member/${userId}`, {
      memberId: userId,
      ...body,
    });
  }

  // ─── v2 low-friction onboarding ──────────────────────────────────────────────
  // All of these act AS the contractor — call via `.withChild(payeeId)`. They
  // let us pre-provide identity + tax data, verify it server-side, and record
  // W-9 consent so the contractor deep-links straight to the payout chooser
  // instead of the onboarding wizard.

  /** Create the customer entity the verification system reads. Do this first. */
  createOnboardingCustomer(body: { type: "Individual" | "Business"; country: string }): Promise<unknown> {
    return this.request("POST", "/v2/onboarding/customer", body);
  }

  /**
   * Submit the customer entity's data — individual identity+tax (SSN as
   * `individualTaxId`) or, for a Business customer, the company block (EIN as
   * `businessTaxId`).
   */
  updateOnboardingCustomer(customerData: WingspanCustomerData | WingspanBusinessData): Promise<unknown> {
    return this.request("PATCH", "/v2/onboarding/customer/Entity", { customerData });
  }

  /**
   * Submit the authorized representative for a Business customer — the human
   * whose SSN (`individualTaxId`) drives the identity check.
   */
  updateOnboardingRepresentative(customerData: WingspanCustomerData): Promise<unknown> {
    return this.request("PATCH", "/v2/onboarding/customer/Representative", { customerData });
  }

  /**
   * Post an onboarding acknowledgement on the contractor's behalf — e.g.
   * `W9Certification` (the actual W-9 cert) or `ElectronicTaxFormConsent`.
   * Use the version from WINGSPAN_ACK_VERSIONS.
   */
  postOnboardingAcknowledgement(name: string, version: string): Promise<unknown> {
    return this.request("POST", `/v2/onboarding/acknowledgements/${name}`, {
      acknowledgementName: name,
      acknowledgementStatus: "Given",
      version,
    });
  }

  /** Kick off a verification lane (Tax for TIN/W-9; Banking only for Wallet). */
  runOnboardingVerification(lane: WingspanVerificationLane): Promise<unknown> {
    return this.request("POST", `/v2/onboarding/verifications/${lane}`);
  }

  /** Read current verification statuses (Tax must be Verified for the payout deep-link). */
  getOnboardingVerifications(): Promise<WingspanVerifications> {
    return this.request("GET", "/v2/onboarding/verifications");
  }

  /** Confirm nothing is missing for a lane (empty requiredFields == ready). */
  getOnboardingMissingData(lane: WingspanVerificationLane): Promise<unknown> {
    return this.request("GET", `/v2/onboarding/missing-data/${lane}`);
  }

  /**
   * Record the contractor's consent to share their W-9 with the paying entity,
   * so it isn't an outstanding to-do. Acts as the contractor (impersonation),
   * targets the payer that pays them. `payerId` comes from the createPayee
   * response (the bucket payer, or an EIN entity payer).
   */
  recordW9Consent(payerId: string): Promise<unknown> {
    return this.request("PATCH", `/payments/payer/${payerId}`, {
      payeeOwnedData: { shareTaxDocument: "Allow" },
    });
  }

  // ─── Customization / Branding ────────────────────────────────────────────────

  /** Set branding, support, terminology, appearance, org settings on a user. */
  updateCustomization(userId: string, body: WingspanCustomizationBody): Promise<unknown> {
    return this.request("PATCH", `/users/customization/${userId}`, body);
  }

  // ─── Payees ──────────────────────────────────────────────────────────────────

  /**
   * Create a payee.
   * - From Payee Bucket context → initial contractor onboarding
   * - From Entity context (same email) → creates payer-payee relationship; returns payerPayeeEngagementId
   */
  createPayee(params: {
    email: string;
    firstName?: string;
    lastName?: string;
    payeeExternalId?: string;
    status?: "Active" | "Inactive";
    labels?: Record<string, string>;
    payeeW9Data?: {
      firstName?: string;
      lastName?: string;
      country?: string;
      addressLine1?: string;
      addressLine2?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      ssn?: string;
    };
  }): Promise<WingspanCreatePayeeResponse> {
    return this.request("POST", "/payments/payee", {
      email: params.email,
      ...(params.firstName && { firstName: params.firstName }),
      ...(params.lastName && { lastName: params.lastName }),
      payerOwnedData: {
        ...(params.payeeExternalId && { payeeExternalId: params.payeeExternalId }),
        status: params.status ?? "Active",
        ...(params.labels && { labels: params.labels }),
        ...(params.payeeW9Data && { payeeW9Data: params.payeeW9Data }),
      },
    });
  }

  // ─── Payables ────────────────────────────────────────────────────────────────

  /** Create a payable. Must be called from entity child context. */
  createPayable(params: {
    collaboratorId: string;
    dueDate: string;
    amountCents?: number;
    referenceId?: string;
    lineItems: Array<{
      description?: string;
      totalCost: number;
      quantity?: number;
      unit?: string;
      costPerUnit?: number;
      labels?: Record<string, string>;
    }>;
  }): Promise<WingspanCreatePayableResponse> {
    return this.request("POST", "/payments/payable", {
      collaboratorId: params.collaboratorId,
      dueDate: params.dueDate,
      currency: "USD",
      // Wingspan only accepts Draft or Pending on create. Caller must transition
      // to Open via approvePayable() to make it sweepable by pay-approved.
      status: "Pending",
      creditFeeHandling: { payerAbsorbPercentage: 1.0 },
      ...(params.referenceId && { referenceId: params.referenceId }),
      lineItems: params.lineItems.map((li) => ({
        ...(li.description && { description: li.description }),
        totalCost: li.totalCost,
        ...(li.quantity !== undefined && { quantity: li.quantity }),
        ...(li.unit && { unit: li.unit }),
        ...(li.costPerUnit !== undefined && { costPerUnit: li.costPerUnit }),
        ...(li.labels && { labels: li.labels }),
      })),
    });
  }

  /**
   * Fetch a single payable's current state. Returns the raw response — most
   * useful fields are `status` and `payableId`.
   */
  getPayable(payableId: string): Promise<{ payableId: string; status: string; [k: string]: unknown }> {
    return this.request("GET", `/payments/payable/${payableId}`);
  }

  /**
   * Fetch a payee by its Wingspan payeeId. Returns the full payee record,
   * including the underlying `user` object that holds `userId` (the value
   * needed for session-token generation).
   */
  getPayee(payeeId: string): Promise<WingspanCreatePayeeResponse> {
    return this.request("GET", `/payments/payee/${payeeId}`);
  }

  /**
   * Transition a payable from Pending → Open. pay-approved only sweeps Open
   * payables, so this must be called after createPayable before the disbursement
   * batch sweep is triggered.
   */
  approvePayable(payableId: string): Promise<{ payableId: string; status: string; [k: string]: unknown }> {
    return this.request("PATCH", `/payments/payable/${payableId}`, { status: "Open" });
  }

  /**
   * Update a payee — used to push the tenant's latest contractor data into
   * Wingspan so the onboarding form is pre-filled. Wingspan accepts firstName/
   * lastName at the top level and address fields under payerOwnedData.payeeW9Data.
   */
  updatePayee(
    payeeId: string,
    body: {
      firstName?: string;
      lastName?: string;
      payeeExternalId?: string;
      payeeW9Data?: {
        firstName?: string;
        lastName?: string;
        country?: string;
        addressLine1?: string;
        addressLine2?: string;
        city?: string;
        state?: string;
        postalCode?: string;
        ssn?: string;
      };
    },
  ): Promise<WingspanCreatePayeeResponse> {
    const { firstName, lastName, payeeExternalId, payeeW9Data } = body;
    const payload: Record<string, unknown> = {};
    if (firstName) payload["firstName"] = firstName;
    if (lastName) payload["lastName"] = lastName;
    const payerOwned: Record<string, unknown> = {};
    if (payeeExternalId) payerOwned["payeeExternalId"] = payeeExternalId;
    if (payeeW9Data) payerOwned["payeeW9Data"] = payeeW9Data;
    if (Object.keys(payerOwned).length) payload["payerOwnedData"] = payerOwned;
    return this.request("PATCH", `/payments/payee/${payeeId}`, payload);
  }

  // ─── Disbursements ───────────────────────────────────────────────────────────

  /**
   * Sweep all Pending payables for the current entity context into a payroll batch.
   * Must be called with an entity child user context (withChild(entityChildUserId)).
   */
  payApproved(): Promise<WingspanPayApprovedResponse> {
    return this.request("POST", "/payments/pay-approved");
  }

  // ─── Custom Fields ───────────────────────────────────────────────────────────

  createCustomField(body: WingspanCustomFieldBody): Promise<WingspanCustomFieldResponse> {
    return this.request("POST", "/payments/custom-fields", body);
  }

  listCustomFields(): Promise<WingspanCustomFieldResponse[]> {
    return this.request("GET", "/payments/custom-fields");
  }
}

/** Create a Wingspan client for staging. */
export function createStagingClient(apiToken: string): WingspanClient {
  return new WingspanClient({ apiToken, baseUrl: "https://stagingapi.wingspan.app" });
}

/** Create a Wingspan client for production. */
export function createProductionClient(apiToken: string): WingspanClient {
  return new WingspanClient({ apiToken, baseUrl: "https://api.wingspan.app" });
}
