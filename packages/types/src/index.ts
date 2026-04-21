// ─── Shared enums ────────────────────────────────────────────────────────────

export type TenantStatus = "provisioning" | "active" | "suspended" | "cancelled";
export type TenantPlan = "starter" | "growth" | "enterprise";

export type EntityStatus = "pending" | "active" | "suspended";

export type ContractorOnboardingStatus =
  | "invited"
  | "w9_pending"
  | "payout_pending"
  | "active"
  | "inactive";

export type PayableStatus = "draft" | "pending" | "processing" | "paid" | "failed" | "cancelled";

export type DisbursementStatus = "processing" | "completed" | "failed" | "partial";

export type ApiKeyEnvironment = "live" | "test";

export type ProvisioningJobStatus = "pending" | "running" | "completed" | "failed";

// ─── Plan configuration ───────────────────────────────────────────────────────

export const PLAN_CONFIG: Record<
  TenantPlan,
  {
    monthlyFeeCents: number;
    disbursementFeeBps: number;
    perTxFeeCents: number;
    maxContractors: number | null;
    maxEntities: number | null;
    customBranding: boolean;
    maxApiKeys: number | null;
    maxWebhookEndpoints: number | null;
    maxTeamMembers: number | null;
  }
> = {
  starter: {
    monthlyFeeCents: 14900,
    disbursementFeeBps: 80,
    perTxFeeCents: 25,
    maxContractors: 50,
    maxEntities: 1,
    customBranding: false,
    maxApiKeys: 2,
    maxWebhookEndpoints: 1,
    maxTeamMembers: 1,
  },
  growth: {
    monthlyFeeCents: 49900,
    disbursementFeeBps: 50,
    perTxFeeCents: 15,
    maxContractors: 500,
    maxEntities: 10,
    customBranding: true,
    maxApiKeys: 10,
    maxWebhookEndpoints: 5,
    maxTeamMembers: 5,
  },
  enterprise: {
    monthlyFeeCents: 0,
    disbursementFeeBps: 30,
    perTxFeeCents: 0,
    maxContractors: null,
    maxEntities: null,
    customBranding: true,
    maxApiKeys: null,
    maxWebhookEndpoints: null,
    maxTeamMembers: null,
  },
};

// ─── Tenant ───────────────────────────────────────────────────────────────────

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  email: string;
  status: TenantStatus;
  plan: TenantPlan;
  disbursementFeeBps: number;
  perTxFeeCents: number;
  brandingConfig: Record<string, unknown>;
  wingspanPayeeBucketUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  provisionedAt: Date | null;
}

// ─── Entity ───────────────────────────────────────────────────────────────────

export interface TenantEntity {
  id: string;
  tenantId: string;
  name: string;
  einLast4: string | null;
  state: string | null;
  status: EntityStatus;
  wingspanChildUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Contractor ───────────────────────────────────────────────────────────────

export interface Contractor {
  id: string;
  tenantId: string;
  externalId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  onboardingStatus: ContractorOnboardingStatus;
  wingspanUserId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Engagement ───────────────────────────────────────────────────────────────

export interface Engagement {
  id: string;
  tenantId: string;
  contractorId: string;
  entityId: string;
  wingspanPayerPayeeEngagementId: string;
  status: "pending" | "active" | "inactive";
  createdAt: Date;
  updatedAt: Date;
}

// ─── Payable ──────────────────────────────────────────────────────────────────

export interface LineItem {
  description?: string;
  amountCents: number;
  quantity?: number;
  unit?: string;
  metadata?: Record<string, string>;
}

export interface Payable {
  id: string;
  tenantId: string;
  entityId: string;
  contractorId: string;
  engagementId: string;
  externalReferenceId: string | null;
  amountCents: number;
  feeBps: number;
  perTxFeeCents: number;
  feeAmountCents: number;
  status: PayableStatus;
  wingspanPayableId: string | null;
  lineItems: LineItem[];
  disbursementId: string | null;
  dueDate: string;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Disbursement ─────────────────────────────────────────────────────────────

export interface Disbursement {
  id: string;
  tenantId: string;
  entityId: string;
  status: DisbursementStatus;
  wingspanBulkBatchId: string | null;
  totalPayablesCount: number;
  totalAmountCents: number;
  totalFeesCents: number;
  initiatedAt: Date;
  completedAt: Date | null;
}

// ─── API request/response shapes ──────────────────────────────────────────────

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

// ─── Webhook events ───────────────────────────────────────────────────────────

export type WebhookEventType =
  | "contractor.created"
  | "contractor.status_changed"
  | "payable.created"
  | "payable.paid"
  | "payable.failed"
  | "disbursement.completed"
  | "disbursement.failed"
  | "entity.provisioned"
  | "tenant.provisioned"
  | "tax.1099_available";

export interface WebhookEvent<T = unknown> {
  id: string;
  type: WebhookEventType;
  tenantId: string;
  data: T;
  createdAt: string;
}
