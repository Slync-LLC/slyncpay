/**
 * Wingspan V3 client — used for W-2 payroll resources.
 *
 * Differences from V1:
 *  - Path prefix `/v3/...` (vs no prefix on V1)
 *  - `X-Wingspan-Account` header (vs V1's `X-WINGSPAN-USER`) names the child
 *    EIN account the call acts on behalf of.
 *  - Resource shapes (Worksites, Engagements with type=Employee, WorkLogs,
 *    Payrolls, PayStatements, TaxElections) are net-new — V1's Payee/Payable
 *    resources do not have V3 equivalents.
 *
 * The V1 client (./client.ts) handles 1099 contractor flows and is untouched
 * by this file. A single tenant uses both — V1 for 1099 entities, V3 for W-2
 * entities.
 */

import { WingspanApiError, type WingspanCallLog } from "./client.js";

export interface WingspanV3ClientConfig {
  apiToken: string;
  baseUrl?: string;
  /** Optional sink invoked once per request (success or failure). Never throws. */
  onCall?: ((entry: WingspanCallLog) => void) | undefined;
}

export interface V3Address {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
}

export interface V3WorksiteResponse {
  worksiteId: string;
  name: string;
  address: V3Address;
  externalId?: string;
  [k: string]: unknown;
}

export interface V3PayeeResponse {
  payeeId: string;
  externalId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  [k: string]: unknown;
}

export interface V3EngagementResponse {
  engagementId: string;
  type: "Contractor" | "Employee";
  payeeId?: string;
  worksiteId?: string;
  jobTitle?: string;
  compensation?: unknown;
  paySchedule?: string;
  startDate?: string;
  status?: string;
  [k: string]: unknown;
}

export interface V3WorkLogResponse {
  workLogId: string;
  payeeEngagementId: string;
  workDefinitionId?: string;
  periodStart: string;
  periodEnd: string;
  quantity: number;
  unit: string;
  rate?: number;
  status: string;
  [k: string]: unknown;
}

export interface V3PayrollResponse {
  payrollId: string;
  type: "Regular" | "OffCycle";
  periodStart: string;
  periodEnd: string;
  payDate: string;
  status: string;
  totals?: {
    employeeGross?: number;
    employerTaxes?: number;
    net?: number;
  };
  [k: string]: unknown;
}

export class WingspanV3Client {
  private readonly baseUrl: string;
  private readonly apiToken: string;
  private readonly accountId: string | null;
  private readonly onCall?: ((entry: WingspanCallLog) => void) | undefined;

  constructor(config: WingspanV3ClientConfig, accountId: string | null = null) {
    this.apiToken = config.apiToken;
    this.baseUrl = config.baseUrl ?? "https://api.wingspan.app";
    this.accountId = accountId;
    this.onCall = config.onCall;
  }

  /** Scope subsequent calls to a specific child account (an EIN). */
  withAccount(accountId: string): WingspanV3Client {
    return new WingspanV3Client(
      { apiToken: this.apiToken, baseUrl: this.baseUrl, onCall: this.onCall },
      accountId,
    );
  }

  private headers(idempotencyKey?: string): Record<string, string> {
    const h: Record<string, string> = {
      Authorization: `Bearer ${this.apiToken}`,
      "Content-Type": "application/json",
    };
    if (this.accountId) h["X-Wingspan-Account"] = this.accountId;
    if (idempotencyKey) h["Idempotency-Key"] = idempotencyKey;
    return h;
  }

  private async request<T>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
    opts?: { idempotencyKey?: string },
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const requestHeaders = this.headers(opts?.idempotencyKey);
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
          apiVersion: "v3",
          method,
          url,
          path,
          requestHeaders,
          requestBody: body,
          responseBody: networkError ? undefined : json,
          responseStatus: res?.status ?? null,
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

  // ─── Worksites ─────────────────────────────────────────────────────────────

  createWorksite(params: {
    name: string;
    address: V3Address;
    externalId?: string;
  }): Promise<V3WorksiteResponse> {
    return this.request("POST", "/v3/payments/worksites", {
      name: params.name,
      address: { country: "US", ...params.address },
      ...(params.externalId ? { externalId: params.externalId } : {}),
    });
  }

  getWorksite(worksiteId: string): Promise<V3WorksiteResponse> {
    return this.request("GET", `/v3/payments/worksites/${worksiteId}`);
  }

  listWorksites(): Promise<V3WorksiteResponse[]> {
    return this.request("GET", "/v3/payments/worksites");
  }

  // ─── Payees + engagements ───────────────────────────────────────────────────

  createPayee(params: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    dateOfBirth?: string;
    address?: V3Address;
    externalId?: string;
  }): Promise<V3PayeeResponse> {
    return this.request("POST", "/v3/payments/payees", params);
  }

  /**
   * Create an Employee (W-2) engagement on an existing payee. The engagement
   * inherits requirements from its engagement template (license/background/
   * I-9/W-4 collection), which the caller defines once per role.
   */
  createEmployeeEngagement(
    payeeId: string,
    params: {
      engagementTemplateId: string;
      worksiteId: string;
      jobTitle: string;
      compensation: {
        type: "Hourly" | "Salary";
        amount: number;
        frequency: "Hour" | "Year";
      };
      paySchedule: "Weekly" | "Biweekly" | "SemiMonthly" | "Monthly";
      startDate: string;
      externalId?: string;
    },
  ): Promise<V3EngagementResponse> {
    return this.request("POST", `/v3/payments/payees/${payeeId}/engagements`, {
      type: "Employee",
      engagementId: params.engagementTemplateId,
      worksiteId: params.worksiteId,
      jobTitle: params.jobTitle,
      compensation: params.compensation,
      paySchedule: params.paySchedule,
      startDate: params.startDate,
      ...(params.externalId ? { externalId: params.externalId } : {}),
    });
  }

  /** PATCH tax elections (W-4 + state withholding) on an engagement. */
  patchTaxElections(
    payeeId: string,
    engagementId: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    return this.request(
      "PATCH",
      `/v3/payments/payees/${payeeId}/engagements/${engagementId}/tax-elections`,
      body,
    );
  }

  // ─── Work logs + payrolls + pay statements ────────────────────────────────

  createWorkLog(params: {
    payeeEngagementId: string;
    workDefinitionId?: string;
    periodStart: string;
    periodEnd: string;
    quantity: number;
    unit: string;
    rate: number;
    externalId?: string;
  }): Promise<V3WorkLogResponse> {
    return this.request("POST", "/v3/payments/work-logs", params);
  }

  approveWorkLog(workLogId: string): Promise<V3WorkLogResponse> {
    return this.request("POST", `/v3/payments/work-logs/${workLogId}/approve`);
  }

  createPayroll(params: {
    type: "Regular" | "OffCycle";
    periodStart: string;
    periodEnd: string;
    payDate: string;
    employeeItems: Array<{ payeeEngagementId: string; worksiteId: string }>;
  }): Promise<V3PayrollResponse> {
    return this.request("POST", "/v3/payments/payrolls", params);
  }

  previewPayroll(payrollId: string): Promise<V3PayrollResponse> {
    return this.request("POST", `/v3/payments/payrolls/${payrollId}/preview`);
  }

  approvePayroll(payrollId: string): Promise<V3PayrollResponse> {
    return this.request("POST", `/v3/payments/payrolls/${payrollId}/approve`);
  }

  // ─── v3 platform onboarding (PREVIEW) ────────────────────────────────────────
  // The server-side onboarding model: Account → Payee → platform-asserted
  // association → principal Stakeholder → Compliance Entity → verify. These
  // endpoints land in Wingspan staging ~next week; field shapes are still
  // directional, so payloads are typed loosely on purpose. Not used on any
  // production path — gated behind WINGSPAN_V3_ONBOARDING + test environment.

  /** Create the regulated payee Account the platform operates (no account header). */
  createAccount(
    params: {
      externalId: string;
      organizationId: string;
      parentAccountId: string;
      profile?: { displayName?: string };
    },
    idempotencyKey: string,
  ): Promise<{ id: string; [k: string]: unknown }> {
    return this.request("POST", "/v3/platform/accounts", params, { idempotencyKey });
  }

  /** Create the payer-side Payee record (scope to the payer account via withAccount). */
  createPayeeV3(
    params: { email: string; externalId: string; profile?: { displayName?: string } },
    idempotencyKey: string,
  ): Promise<{ id: string; payeeAccountId: string | null; [k: string]: unknown }> {
    return this.request("POST", "/v3/payments/payees", params, { idempotencyKey });
  }

  /** Bind a Payee to an Account with a platform-asserted authority (no payee accept). */
  associatePayeeAccount(
    payeeId: string,
    body: {
      payeeAccountId: string;
      authority: {
        type: "PlatformAsserted";
        basis: string;
        externalAgreementId: string;
        acceptedAt: string;
        consentVersion: string;
      };
    },
  ): Promise<{ id: string; status: string; linkMethod: string; [k: string]: unknown }> {
    return this.request("POST", `/v3/payments/payees/${payeeId}/associate-account`, body);
  }

  /** Add a (no-login) principal/owner Stakeholder to an Account. */
  addStakeholder(
    accountId: string,
    body: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<{ id: string; [k: string]: unknown }> {
    return this.request("POST", `/v3/platform/accounts/${accountId}/stakeholders`, body, { idempotencyKey });
  }

  /** Create an Individual or Business Compliance Entity (holds identity + tax data). */
  createComplianceEntity(
    body: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<{ id: string; [k: string]: unknown }> {
    return this.request("POST", "/v3/platform/compliance-entities", body, { idempotencyKey });
  }

  /** Run a verification lane (e.g. Tax) on a Compliance Entity. */
  verifyComplianceEntity(
    complianceEntityId: string,
    body: { level: "Tax" | "Identity"; reusePolicy?: "ResolveExisting" | "Force" },
  ): Promise<{ verifications?: Record<string, unknown>; [k: string]: unknown }> {
    return this.request("POST", `/v3/platform/compliance-entities/${complianceEntityId}/verify`, body);
  }
}
