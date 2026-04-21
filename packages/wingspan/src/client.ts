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

export interface WingspanClientConfig {
  apiToken: string;
  baseUrl?: string;
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

  constructor(config: WingspanClientConfig, childUserId: string | null = null) {
    this.apiToken = config.apiToken;
    this.baseUrl = config.baseUrl ?? "https://api.wingspan.app";
    this.childUserId = childUserId;
  }

  /** Return a new client scoped to the given child user. */
  withChild(childUserId: string): WingspanClient {
    return new WingspanClient({ apiToken: this.apiToken, baseUrl: this.baseUrl }, childUserId);
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
    const res = await fetch(url, {
      method,
      headers: this.headers(),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = { message: text };
    }

    if (!res.ok) {
      const msg =
        typeof json === "object" && json !== null && "message" in json
          ? String((json as Record<string, unknown>)["message"])
          : `HTTP ${res.status}`;
      throw new WingspanApiError(res.status, msg, res.headers.get("x-request-id") ?? undefined);
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
      country?: string;
      addressLine1?: string;
      city?: string;
      state?: string;
      postalCode?: string;
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
