import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  date,
  jsonb,
  index,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const tenantStatusEnum = pgEnum("tenant_status", [
  "provisioning",
  "active",
  "suspended",
  "cancelled",
]);

export const tenantPlanEnum = pgEnum("tenant_plan", ["starter", "growth", "enterprise"]);

export const entityStatusEnum = pgEnum("entity_status", ["pending", "active", "suspended"]);

export const contractorOnboardingStatusEnum = pgEnum("contractor_onboarding_status", [
  "invited",
  "w9_pending",
  "payout_pending",
  "active",
  "inactive",
]);

export const payableStatusEnum = pgEnum("payable_status", [
  "draft",
  "pending",
  "processing",
  "paid",
  "failed",
  "cancelled",
]);

export const disbursementStatusEnum = pgEnum("disbursement_status", [
  "processing",
  "completed",
  "failed",
  "partial",
]);

export const apiKeyEnvironmentEnum = pgEnum("api_key_environment", ["live", "test"]);

export const provisioningJobTypeEnum = pgEnum("provisioning_job_type", [
  "tenant_setup",
  "entity_setup",
]);

export const provisioningJobStatusEnum = pgEnum("provisioning_job_status", [
  "pending",
  "running",
  "completed",
  "failed",
]);

export const engagementStatusEnum = pgEnum("engagement_status", ["pending", "active", "inactive"]);

export const webhookEndpointStatusEnum = pgEnum("webhook_endpoint_status", ["active", "disabled"]);

export const webhookDeliveryStatusEnum = pgEnum("webhook_delivery_status", [
  "pending",
  "delivered",
  "failed",
  "abandoned",
]);

export const auditActorTypeEnum = pgEnum("audit_actor_type", ["api_key", "system", "admin"]);

// ─── Tenants ──────────────────────────────────────────────────────────────────

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    email: text("email").notNull().unique(),
    status: tenantStatusEnum("status").notNull().default("provisioning"),

    // Wingspan IDs — set during async provisioning
    wingspanPayeeBucketUserId: text("wingspan_payee_bucket_user_id").unique(),

    // Pricing
    plan: tenantPlanEnum("plan").notNull().default("starter"),
    disbursementFeeBps: integer("disbursement_fee_bps").notNull().default(80),
    perTxFeeCents: integer("per_tx_fee_cents").notNull().default(25),

    brandingConfig: jsonb("branding_config").notNull().default({}),

    // Dashboard auth
    passwordHash: text("password_hash"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    provisionedAt: timestamp("provisioned_at", { withTimezone: true }),
  },
  (t) => ({
    statusIdx: index("idx_tenants_status").on(t.status),
  }),
);

// ─── Tenant Entities (EINs) ───────────────────────────────────────────────────

export const tenantEntities = pgTable(
  "tenant_entities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    ein: text("ein"), // AES-256-GCM encrypted at app layer
    state: text("state"),
    status: entityStatusEnum("status").notNull().default("pending"),

    wingspanChildUserId: text("wingspan_child_user_id").unique(),
    wingspanChildUserEmail: text("wingspan_child_user_email"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdIdx: index("idx_tenant_entities_tenant_id").on(t.tenantId),
    tenantNameUniq: uniqueIndex("idx_tenant_entities_tenant_name").on(t.tenantId, t.name),
  }),
);

// ─── API Keys ─────────────────────────────────────────────────────────────────

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    keyPrefix: text("key_prefix").notNull(),
    keyHash: text("key_hash").notNull(),
    keyHint: text("key_hint").notNull(),
    environment: apiKeyEnvironmentEnum("environment").notNull().default("live"),
    name: text("name"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    prefixIdx: index("idx_api_keys_prefix").on(t.keyPrefix),
    tenantIdIdx: index("idx_api_keys_tenant_id").on(t.tenantId),
  }),
);

// ─── Contractors ──────────────────────────────────────────────────────────────

export const contractors = pgTable(
  "contractors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    externalId: text("external_id").notNull(),
    email: text("email").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    onboardingStatus: contractorOnboardingStatusEnum("onboarding_status")
      .notNull()
      .default("invited"),

    wingspanPayeeBucketPayeeId: text("wingspan_payee_bucket_payee_id").unique(),
    wingspanUserId: text("wingspan_user_id").unique(),

    w9SeededData: jsonb("w9_seeded_data"),
    metadata: jsonb("metadata").notNull().default({}),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantExternalUniq: uniqueIndex("idx_contractors_tenant_external").on(t.tenantId, t.externalId),
    tenantIdIdx: index("idx_contractors_tenant_id").on(t.tenantId),
    emailIdx: index("idx_contractors_email").on(t.tenantId, t.email),
    wingspanUserIdIdx: index("idx_contractors_wingspan_user_id").on(t.wingspanUserId),
  }),
);

// ─── Engagements (payer-payee relationship per entity) ────────────────────────

export const engagements = pgTable(
  "engagements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    contractorId: uuid("contractor_id")
      .notNull()
      .references(() => contractors.id, { onDelete: "restrict" }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => tenantEntities.id, { onDelete: "restrict" }),
    status: engagementStatusEnum("status").notNull().default("active"),

    // THE critical ID — used as collaboratorId on every payable
    wingspanPayerPayeeEngagementId: text("wingspan_payer_payee_engagement_id").notNull().unique(),

    // Entity-scoped payeeId (different from Payee Bucket payeeId)
    wingspanEntityPayeeId: text("wingspan_entity_payee_id"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    contractorEntityUniq: uniqueIndex("idx_engagements_contractor_entity").on(t.contractorId, t.entityId),
    tenantIdIdx: index("idx_engagements_tenant_id").on(t.tenantId),
    contractorIdIdx: index("idx_engagements_contractor_id").on(t.contractorId),
    entityIdIdx: index("idx_engagements_entity_id").on(t.entityId),
  }),
);

// ─── Disbursements (declared before payables due to FK) ───────────────────────

export const disbursements = pgTable(
  "disbursements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => tenantEntities.id, { onDelete: "restrict" }),
    status: disbursementStatusEnum("status").notNull().default("processing"),
    wingspanBulkBatchId: text("wingspan_bulk_batch_id"),
    totalPayablesCount: integer("total_payables_count").notNull().default(0),
    totalAmountCents: bigint("total_amount_cents", { mode: "number" }).notNull().default(0),
    totalFeesCents: bigint("total_fees_cents", { mode: "number" }).notNull().default(0),
    initiatedAt: timestamp("initiated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    failureReason: text("failure_reason"),
  },
  (t) => ({
    tenantIdIdx: index("idx_disbursements_tenant_id").on(t.tenantId),
    entityIdIdx: index("idx_disbursements_entity_id").on(t.entityId),
    statusIdx: index("idx_disbursements_status").on(t.tenantId, t.status),
  }),
);

// ─── Payables ─────────────────────────────────────────────────────────────────

export const payables = pgTable(
  "payables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => tenantEntities.id, { onDelete: "restrict" }),
    contractorId: uuid("contractor_id")
      .notNull()
      .references(() => contractors.id, { onDelete: "restrict" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "restrict" }),
    disbursementId: uuid("disbursement_id").references(() => disbursements.id),

    externalReferenceId: text("external_reference_id"),

    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    dueDate: date("due_date").notNull(),

    feeBps: integer("fee_bps").notNull(),
    perTxFeeCents: integer("per_tx_fee_cents").notNull(),
    feeAmountCents: integer("fee_amount_cents").notNull().default(0),

    status: payableStatusEnum("status").notNull().default("draft"),
    wingspanPayableId: text("wingspan_payable_id").unique(),

    lineItems: jsonb("line_items").notNull().default([]),
    metadata: jsonb("metadata").notNull().default({}),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => ({
    tenantExternalRefUniq: uniqueIndex("idx_payables_tenant_external_ref")
      .on(t.tenantId, t.externalReferenceId)
      .where(sql`${t.externalReferenceId} IS NOT NULL`),
    tenantIdIdx: index("idx_payables_tenant_id").on(t.tenantId),
    entityIdIdx: index("idx_payables_entity_id").on(t.entityId),
    contractorIdIdx: index("idx_payables_contractor_id").on(t.contractorId),
    statusIdx: index("idx_payables_status").on(t.tenantId, t.status),
    wingspanIdIdx: index("idx_payables_wingspan_id").on(t.wingspanPayableId),
  }),
);

// ─── Idempotency Keys ─────────────────────────────────────────────────────────

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    requestPath: text("request_path").notNull(),
    requestHash: text("request_hash").notNull(),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true })
      .notNull()
      .default(sql`NOW() + INTERVAL '24 hours'`),
  },
  (t) => ({
    tenantKeyUniq: uniqueIndex("idx_idempotency_keys_tenant_key").on(t.tenantId, t.idempotencyKey),
  }),
);

// ─── Webhook Endpoints ────────────────────────────────────────────────────────

export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    description: text("description"),
    events: text("events").array().notNull().default(sql`'{}'::text[]`),
    signingSecret: text("signing_secret").notNull(),
    status: webhookEndpointStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdIdx: index("idx_webhook_endpoints_tenant_id").on(t.tenantId),
  }),
);

// ─── Webhook Deliveries ───────────────────────────────────────────────────────

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    endpointId: uuid("endpoint_id")
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    eventId: uuid("event_id").notNull().defaultRandom(),
    payload: jsonb("payload").notNull(),
    attemptNumber: integer("attempt_number").notNull().default(1),
    responseStatus: integer("response_status"),
    responseBody: text("response_body"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    status: webhookDeliveryStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdIdx: index("idx_webhook_deliveries_tenant_id").on(t.tenantId),
    statusRetryIdx: index("idx_webhook_deliveries_status").on(t.status, t.nextRetryAt),
  }),
);

// ─── Provisioning Jobs ────────────────────────────────────────────────────────

export const provisioningJobs = pgTable("provisioning_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  entityId: uuid("entity_id").references(() => tenantEntities.id, { onDelete: "cascade" }),
  jobType: provisioningJobTypeEnum("job_type").notNull(),
  status: provisioningJobStatusEnum("status").notNull().default("pending"),
  currentStep: text("current_step"),
  stepsCompleted: jsonb("steps_completed").notNull().default([]),
  lastError: text("last_error"),
  attempts: integer("attempts").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Admins ───────────────────────────────────────────────────────────────────

export const admins = pgTable("admins", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

// ─── Audit Log ────────────────────────────────────────────────────────────────

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    actorType: auditActorTypeEnum("actor_type").notNull(),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    metadata: jsonb("metadata").notNull().default({}),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantCreatedIdx: index("idx_audit_log_tenant_id").on(t.tenantId, t.createdAt),
    resourceIdx: index("idx_audit_log_resource").on(t.resourceType, t.resourceId),
  }),
);
