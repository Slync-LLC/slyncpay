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
  numeric,
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

export const workerOnboardingStatusEnum = pgEnum("worker_onboarding_status", [
  "invited",
  "w9_pending",
  "payout_pending",
  "active",
  "inactive",
]);

// Entity tax classification. Drives whether engagements are 1099 contractor
// or W-2 employee, and which Wingspan API surface (V1 vs V3) we use.
export const entityTaxTypeEnum = pgEnum("entity_tax_type", ["w2", "1099"]);

// Mirrors Wingspan V3's engagement.type. A worker can sequentially transition
// between contractor and employee but cannot hold both active simultaneously
// with the same payer.
export const engagementTypeEnum = pgEnum("engagement_type", ["contractor", "employee"]);

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
    wingspanPayeeBucketUserIdSandbox: text("wingspan_payee_bucket_user_id_sandbox").unique(),

    // Pricing
    plan: tenantPlanEnum("plan").notNull().default("starter"),
    disbursementFeeBps: integer("disbursement_fee_bps").notNull().default(80),
    perTxFeeCents: integer("per_tx_fee_cents").notNull().default(25),

    brandingConfig: jsonb("branding_config").notNull().default({}),

    // Dashboard auth
    passwordHash: text("password_hash"),
    twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),

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

    // Each entity now exists in ONE environment. (Sandbox columns kept as nullable
    // in the DB until the next migration; not referenced by code anymore.)
    wingspanChildUserIdSandbox: text("wingspan_child_user_id_sandbox").unique(),
    wingspanChildUserEmailSandbox: text("wingspan_child_user_email_sandbox"),

    // V3 (W-2) account ID — populated when the entity is provisioned against
    // Wingspan's V3 API. Distinct from the V1 child user IDs above.
    wingspanV3AccountId: text("wingspan_v3_account_id"),
    wingspanV3AccountIdSandbox: text("wingspan_v3_account_id_sandbox"),

    // 1099 (default) or W-2. Locked once the entity is created.
    taxType: entityTaxTypeEnum("tax_type").notNull().default("1099"),

    environment: apiKeyEnvironmentEnum("environment").notNull().default("live"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdIdx: index("idx_tenant_entities_tenant_id").on(t.tenantId),
    tenantEnvNameUniq: uniqueIndex("idx_tenant_entities_tenant_env_name").on(t.tenantId, t.environment, t.name),
    tenantEnvIdx: index("idx_tenant_entities_tenant_env").on(t.tenantId, t.environment),
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

// ─── Workers ──────────────────────────────────────────────────────────────────

// A worker is a person we pay — 1099 contractor or W-2 employee. The Wingspan
// Payee they map to is classification-agnostic; tax classification lives on
// the engagement (see `engagements.type`).
export const workers = pgTable(
  "workers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    externalId: text("external_id").notNull(),
    email: text("email").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    onboardingStatus: workerOnboardingStatusEnum("onboarding_status")
      .notNull()
      .default("invited"),

    wingspanPayeeBucketPayeeId: text("wingspan_payee_bucket_payee_id").unique(),
    wingspanUserId: text("wingspan_user_id").unique(),

    environment: apiKeyEnvironmentEnum("environment").notNull().default("live"),

    w9SeededData: jsonb("w9_seeded_data"),
    // AES-256-GCM encrypted SSN/ITIN. Pushed to Wingspan as part of payeeW9Data
    // to pre-fill the W-9 form. Tenant DTO exposes ssnLast4 only.
    ssnEncrypted: text("ssn_encrypted"),
    metadata: jsonb("metadata").notNull().default({}),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantEnvExternalUniq: uniqueIndex("idx_workers_tenant_env_external").on(t.tenantId, t.environment, t.externalId),
    tenantEnvIdx: index("idx_workers_tenant_env").on(t.tenantId, t.environment),
    tenantIdIdx: index("idx_workers_tenant_id").on(t.tenantId),
    emailIdx: index("idx_workers_email").on(t.tenantId, t.email),
    wingspanUserIdIdx: index("idx_workers_wingspan_user_id").on(t.wingspanUserId),
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
    workerId: uuid("worker_id")
      .notNull()
      .references(() => workers.id, { onDelete: "restrict" }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => tenantEntities.id, { onDelete: "restrict" }),
    status: engagementStatusEnum("status").notNull().default("active"),

    // Mirrors Wingspan V3 engagement.type. Must match the parent entity's taxType.
    type: engagementTypeEnum("type").notNull().default("contractor"),

    // V1 collaboratorId — used on every 1099 payable. NULL for W-2 engagements.
    wingspanPayerPayeeEngagementId: text("wingspan_payer_payee_engagement_id").unique(),

    // V1 entity-scoped payeeId (different from Payee Bucket payeeId). 1099 only.
    wingspanEntityPayeeId: text("wingspan_entity_payee_id"),

    // V3 IDs — populated for W-2 engagements.
    wingspanV3PayeeId: text("wingspan_v3_payee_id"),
    wingspanV3EngagementId: text("wingspan_v3_engagement_id"),

    // W-2-only fields (set by the V3 engagement create flow). Null for 1099s.
    engagementTemplateId: uuid("engagement_template_id"),
    worksiteId: uuid("worksite_id"),
    compensation: jsonb("compensation"),
    paySchedule: text("pay_schedule"),
    jobTitle: text("job_title"),

    environment: apiKeyEnvironmentEnum("environment").notNull().default("live"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    workerEntityEnvUniq: uniqueIndex("idx_engagements_contractor_entity_env").on(t.workerId, t.entityId, t.environment),
    tenantEnvIdx: index("idx_engagements_tenant_env").on(t.tenantId, t.environment),
    tenantIdIdx: index("idx_engagements_tenant_id").on(t.tenantId),
    workerIdIdx: index("idx_engagements_contractor_id").on(t.workerId),
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
    environment: apiKeyEnvironmentEnum("environment").notNull().default("live"),
  },
  (t) => ({
    tenantEnvIdx: index("idx_disbursements_tenant_env").on(t.tenantId, t.environment),
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
    workerId: uuid("worker_id")
      .notNull()
      .references(() => workers.id, { onDelete: "restrict" }),
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

    environment: apiKeyEnvironmentEnum("environment").notNull().default("live"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => ({
    tenantEnvExternalRefUniq: uniqueIndex("idx_payables_tenant_env_external_ref")
      .on(t.tenantId, t.environment, t.externalReferenceId)
      .where(sql`${t.externalReferenceId} IS NOT NULL`),
    tenantEnvIdx: index("idx_payables_tenant_env").on(t.tenantId, t.environment),
    tenantIdIdx: index("idx_payables_tenant_id").on(t.tenantId),
    entityIdIdx: index("idx_payables_entity_id").on(t.entityId),
    workerIdIdx: index("idx_payables_contractor_id").on(t.workerId),
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
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

// ─── Sessions (JWT jti tracking for revocation) ───────────────────────────────

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey(),
    subjectId: uuid("subject_id").notNull(),
    subjectType: text("subject_type").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    impersonatorId: uuid("impersonator_id"),
  },
  (t) => ({
    subjectIdx: index("idx_sessions_subject").on(t.subjectId, t.subjectType, t.revokedAt),
    expiresIdx: index("idx_sessions_expires").on(t.expiresAt),
  }),
);

// ─── Email OTP codes (2FA) ────────────────────────────────────────────────────

export const emailOtpCodes = pgTable(
  "email_otp_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier").notNull(),
    identifierType: text("identifier_type").notNull(),
    purpose: text("purpose").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    lookupIdx: index("idx_email_otp_lookup").on(t.identifier, t.identifierType, t.purpose, t.usedAt),
    expiresIdx: index("idx_email_otp_expires").on(t.expiresAt),
  }),
);

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
    // Shared with wingspan_api_log: ties an event to the Wingspan calls it triggered.
    correlationId: text("correlation_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantCreatedIdx: index("idx_audit_log_tenant_id").on(t.tenantId, t.createdAt),
    resourceIdx: index("idx_audit_log_resource").on(t.resourceType, t.resourceId),
    correlationIdx: index("idx_audit_log_correlation").on(t.correlationId),
  }),
);

// ─── Wingspan API call log ─────────────────────────────────────────────────────
//
// One row per outbound Wingspan request (V1 or V3). Bodies/headers are redacted
// by the API before insert. Joined to audit_log on correlation_id so the
// activity UI can render the curl + payload + response behind each event.

export const wingspanApiLog = pgTable(
  "wingspan_api_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    correlationId: text("correlation_id"),
    environment: text("environment"),
    apiVersion: text("api_version").notNull().default("v1"),
    method: text("method").notNull(),
    url: text("url").notNull(),
    requestHeaders: jsonb("request_headers").notNull().default({}),
    requestBody: jsonb("request_body"),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body"),
    wingspanRequestId: text("wingspan_request_id"),
    durationMs: integer("duration_ms").notNull().default(0),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    correlationIdx: index("idx_wingspan_api_log_correlation").on(t.correlationId),
    tenantCreatedIdx: index("idx_wingspan_api_log_tenant").on(t.tenantId, t.createdAt),
  }),
);

// ─── Phase 2: W-2 payroll resources ───────────────────────────────────────────

export const jurisdictionConfigStatusEnum = pgEnum("jurisdiction_config_status", [
  "pending",
  "in_progress",
  "complete",
]);

export const i9ModeEnum = pgEnum("i9_mode", ["self_managed", "wingspan_managed", "hybrid"]);

export const workLogStatusEnum = pgEnum("work_log_status", [
  "draft",
  "approved",
  "processed",
  "cancelled",
]);

export const payrollTypeEnum = pgEnum("payroll_type", ["regular", "off_cycle"]);

export const payrollStatusEnum = pgEnum("payroll_status", [
  "draft",
  "previewed",
  "approved",
  "processing",
  "paid",
  "failed",
]);

export const payStatementStatusEnum = pgEnum("pay_statement_status", [
  "pending",
  "issued",
  "failed",
  "corrected",
]);

// Worksites — one per physical location on a W-2 entity.
export const worksites = pgTable(
  "worksites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => tenantEntities.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    addressLine1: text("address_line1").notNull(),
    addressLine2: text("address_line2"),
    city: text("city").notNull(),
    state: text("state").notNull(),
    postalCode: text("postal_code").notNull(),
    country: text("country").notNull().default("US"),
    externalId: text("external_id"),
    wingspanWorksiteId: text("wingspan_worksite_id").unique(),
    environment: apiKeyEnvironmentEnum("environment").notNull().default("live"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    entityIdx: index("idx_worksites_entity").on(t.entityId),
    tenantEnvIdx: index("idx_worksites_tenant_env").on(t.tenantId, t.environment),
  }),
);

// State jurisdiction config — gates worksite creation per state. The actual
// registrations (withholding/SUTA/PFML/SDI) happen out-of-band; this table
// just tracks completion so the operator can unlock worksite creation.
export const stateJurisdictionConfigs = pgTable(
  "state_jurisdiction_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => tenantEntities.id, { onDelete: "restrict" }),
    state: text("state").notNull(),
    status: jurisdictionConfigStatusEnum("status").notNull().default("pending"),
    notes: text("notes"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    environment: apiKeyEnvironmentEnum("environment").notNull().default("live"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    entityStateEnvUniq: uniqueIndex("idx_state_jur_entity_state_env").on(
      t.entityId,
      t.state,
      t.environment,
    ),
    tenantEnvIdx: index("idx_state_jur_tenant_env").on(t.tenantId, t.environment),
  }),
);

// Engagement templates — per-role bundles of W-4 / I-9 / license / background
// requirements that a worker inherits when attached to a W-2 entity via this
// template.
export const engagementTemplates = pgTable(
  "engagement_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => tenantEntities.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    i9Mode: i9ModeEnum("i9_mode").notNull().default("self_managed"),
    requirements: jsonb("requirements").notNull().default([]),
    wingspanTemplateId: text("wingspan_template_id").unique(),
    environment: apiKeyEnvironmentEnum("environment").notNull().default("live"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantEnvIdx: index("idx_eng_templates_tenant_env").on(t.tenantId, t.environment),
    entityIdx: index("idx_eng_templates_entity").on(t.entityId),
  }),
);

// Work logs — captured hours that feed gross-to-net at payroll time.
export const workLogs = pgTable(
  "work_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    workerId: uuid("worker_id")
      .notNull()
      .references(() => workers.id, { onDelete: "restrict" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "restrict" }),
    worksiteId: uuid("worksite_id")
      .notNull()
      .references(() => worksites.id, { onDelete: "restrict" }),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    quantity: numeric("quantity").notNull(),
    unit: text("unit").notNull().default("Hours"),
    rateCents: integer("rate_cents").notNull(),
    status: workLogStatusEnum("status").notNull().default("draft"),
    wingspanWorkLogId: text("wingspan_work_log_id").unique(),
    externalId: text("external_id"),
    environment: apiKeyEnvironmentEnum("environment").notNull().default("live"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
  },
  (t) => ({
    engagementIdx: index("idx_work_logs_engagement").on(t.engagementId),
    tenantEnvIdx: index("idx_work_logs_tenant_env").on(t.tenantId, t.environment),
    statusIdx: index("idx_work_logs_status").on(t.status),
  }),
);

// Payrolls — W-2 payment runs (parallel to disbursements for 1099).
export const payrolls = pgTable(
  "payrolls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => tenantEntities.id, { onDelete: "restrict" }),
    type: payrollTypeEnum("type").notNull().default("regular"),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    payDate: date("pay_date").notNull(),
    status: payrollStatusEnum("status").notNull().default("draft"),
    wingspanPayrollId: text("wingspan_payroll_id").unique(),
    totalEmployeeGrossCents: bigint("total_employee_gross_cents", { mode: "number" }).notNull().default(0),
    totalEmployerTaxCents: bigint("total_employer_tax_cents", { mode: "number" }).notNull().default(0),
    totalNetCents: bigint("total_net_cents", { mode: "number" }).notNull().default(0),
    environment: apiKeyEnvironmentEnum("environment").notNull().default("live"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => ({
    entityIdx: index("idx_payrolls_entity").on(t.entityId),
    tenantEnvIdx: index("idx_payrolls_tenant_env").on(t.tenantId, t.environment),
  }),
);

// Pay statements — immutable. Corrections create a new row that points back at
// the original via correctsPayStatementId.
export const payStatements: ReturnType<typeof pgTable> = pgTable(
  "pay_statements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    payrollId: uuid("payroll_id")
      .notNull()
      .references(() => payrolls.id, { onDelete: "restrict" }),
    workerId: uuid("worker_id")
      .notNull()
      .references(() => workers.id, { onDelete: "restrict" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "restrict" }),
    grossCents: bigint("gross_cents", { mode: "number" }).notNull(),
    netCents: bigint("net_cents", { mode: "number" }).notNull(),
    lineItems: jsonb("line_items").notNull().default([]),
    status: payStatementStatusEnum("status").notNull().default("pending"),
    wingspanPayStatementId: text("wingspan_pay_statement_id").unique(),
    correctsPayStatementId: uuid("corrects_pay_statement_id"),
    environment: apiKeyEnvironmentEnum("environment").notNull().default("live"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
  },
  (t) => ({
    payrollIdx: index("idx_pay_statements_payroll").on(t.payrollId),
    workerIdx: index("idx_pay_statements_worker").on(t.workerId),
    tenantEnvIdx: index("idx_pay_statements_tenant_env").on(t.tenantId, t.environment),
  }),
);

// ─── Webhooks ────────────────────────────────────────────────────────────────

export const webhookInboundStatusEnum = pgEnum("webhook_inbound_status", [
  "received",
  "processed",
  "failed",
  "ignored",
]);

// Inbound webhook events received from Wingspan. Idempotent on
// wingspan_event_id so retries are safe.
export const webhookInboundEvents = pgTable(
  "webhook_inbound_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").notNull().default("wingspan"),
    eventType: text("event_type").notNull(),
    wingspanEventId: text("wingspan_event_id").unique(),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    payload: jsonb("payload").notNull(),
    status: webhookInboundStatusEnum("status").notNull().default("received"),
    error: text("error"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => ({
    statusIdx: index("idx_webhook_inbound_status").on(t.status),
    resourceIdx: index("idx_webhook_inbound_resource").on(t.resourceType, t.resourceId),
    eventTypeIdx: index("idx_webhook_inbound_event_type").on(t.eventType),
  }),
);

// (webhookEndpoints + webhookDeliveries are defined earlier in this file —
// originally from migration 0000. Phase 3 only adds webhook_inbound_events.)
