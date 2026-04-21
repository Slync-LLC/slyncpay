DO $$ BEGIN
 CREATE TYPE "public"."api_key_environment" AS ENUM('live', 'test');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."audit_actor_type" AS ENUM('api_key', 'system', 'admin');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."contractor_onboarding_status" AS ENUM('invited', 'w9_pending', 'payout_pending', 'active', 'inactive');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."disbursement_status" AS ENUM('processing', 'completed', 'failed', 'partial');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."engagement_status" AS ENUM('pending', 'active', 'inactive');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."entity_status" AS ENUM('pending', 'active', 'suspended');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."payable_status" AS ENUM('draft', 'pending', 'processing', 'paid', 'failed', 'cancelled');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."provisioning_job_status" AS ENUM('pending', 'running', 'completed', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."provisioning_job_type" AS ENUM('tenant_setup', 'entity_setup');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."tenant_plan" AS ENUM('starter', 'growth', 'enterprise');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."tenant_status" AS ENUM('provisioning', 'active', 'suspended', 'cancelled');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."webhook_delivery_status" AS ENUM('pending', 'delivered', 'failed', 'abandoned');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."webhook_endpoint_status" AS ENUM('active', 'disabled');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_hint" text NOT NULL,
	"environment" "api_key_environment" DEFAULT 'live' NOT NULL,
	"name" text,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"actor_type" "audit_actor_type" NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"resource_type" text,
	"resource_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contractors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"email" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"onboarding_status" "contractor_onboarding_status" DEFAULT 'invited' NOT NULL,
	"wingspan_payee_bucket_payee_id" text,
	"wingspan_user_id" text,
	"w9_seeded_data" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contractors_wingspan_payee_bucket_payee_id_unique" UNIQUE("wingspan_payee_bucket_payee_id"),
	CONSTRAINT "contractors_wingspan_user_id_unique" UNIQUE("wingspan_user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "disbursements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"status" "disbursement_status" DEFAULT 'processing' NOT NULL,
	"wingspan_bulk_batch_id" text,
	"total_payables_count" integer DEFAULT 0 NOT NULL,
	"total_amount_cents" bigint DEFAULT 0 NOT NULL,
	"total_fees_cents" bigint DEFAULT 0 NOT NULL,
	"initiated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"failure_reason" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "engagements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contractor_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"status" "engagement_status" DEFAULT 'active' NOT NULL,
	"wingspan_payer_payee_engagement_id" text NOT NULL,
	"wingspan_entity_payee_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "engagements_wingspan_payer_payee_engagement_id_unique" UNIQUE("wingspan_payer_payee_engagement_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_path" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"locked_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone DEFAULT NOW() + INTERVAL '24 hours' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"contractor_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"disbursement_id" uuid,
	"external_reference_id" text,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"due_date" date NOT NULL,
	"fee_bps" integer NOT NULL,
	"per_tx_fee_cents" integer NOT NULL,
	"fee_amount_cents" integer DEFAULT 0 NOT NULL,
	"status" "payable_status" DEFAULT 'draft' NOT NULL,
	"wingspan_payable_id" text,
	"line_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	CONSTRAINT "payables_wingspan_payable_id_unique" UNIQUE("wingspan_payable_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provisioning_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"entity_id" uuid,
	"job_type" "provisioning_job_type" NOT NULL,
	"status" "provisioning_job_status" DEFAULT 'pending' NOT NULL,
	"current_step" text,
	"steps_completed" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"ein" text,
	"state" text,
	"status" "entity_status" DEFAULT 'pending' NOT NULL,
	"wingspan_child_user_id" text,
	"wingspan_child_user_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_entities_wingspan_child_user_id_unique" UNIQUE("wingspan_child_user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"email" text NOT NULL,
	"status" "tenant_status" DEFAULT 'provisioning' NOT NULL,
	"wingspan_payee_bucket_user_id" text,
	"plan" "tenant_plan" DEFAULT 'starter' NOT NULL,
	"disbursement_fee_bps" integer DEFAULT 80 NOT NULL,
	"per_tx_fee_cents" integer DEFAULT 25 NOT NULL,
	"branding_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"password_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"provisioned_at" timestamp with time zone,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug"),
	CONSTRAINT "tenants_email_unique" UNIQUE("email"),
	CONSTRAINT "tenants_wingspan_payee_bucket_user_id_unique" UNIQUE("wingspan_payee_bucket_user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"event_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"payload" jsonb NOT NULL,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"response_status" integer,
	"response_body" text,
	"delivered_at" timestamp with time zone,
	"next_retry_at" timestamp with time zone,
	"status" "webhook_delivery_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhook_endpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"url" text NOT NULL,
	"description" text,
	"events" text[] DEFAULT  NOT NULL,
	"signing_secret" text NOT NULL,
	"status" "webhook_endpoint_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contractors" ADD CONSTRAINT "contractors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "disbursements" ADD CONSTRAINT "disbursements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "disbursements" ADD CONSTRAINT "disbursements_entity_id_tenant_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."tenant_entities"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "engagements" ADD CONSTRAINT "engagements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "engagements" ADD CONSTRAINT "engagements_contractor_id_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."contractors"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "engagements" ADD CONSTRAINT "engagements_entity_id_tenant_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."tenant_entities"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payables" ADD CONSTRAINT "payables_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payables" ADD CONSTRAINT "payables_entity_id_tenant_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."tenant_entities"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payables" ADD CONSTRAINT "payables_contractor_id_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."contractors"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payables" ADD CONSTRAINT "payables_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payables" ADD CONSTRAINT "payables_disbursement_id_disbursements_id_fk" FOREIGN KEY ("disbursement_id") REFERENCES "public"."disbursements"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "provisioning_jobs" ADD CONSTRAINT "provisioning_jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "provisioning_jobs" ADD CONSTRAINT "provisioning_jobs_entity_id_tenant_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."tenant_entities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant_entities" ADD CONSTRAINT "tenant_entities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_api_keys_prefix" ON "api_keys" ("key_prefix");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_api_keys_tenant_id" ON "api_keys" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_log_tenant_id" ON "audit_log" ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_log_resource" ON "audit_log" ("resource_type","resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_contractors_tenant_external" ON "contractors" ("tenant_id","external_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contractors_tenant_id" ON "contractors" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contractors_email" ON "contractors" ("tenant_id","email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contractors_wingspan_user_id" ON "contractors" ("wingspan_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_disbursements_tenant_id" ON "disbursements" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_disbursements_entity_id" ON "disbursements" ("entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_disbursements_status" ON "disbursements" ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_engagements_contractor_entity" ON "engagements" ("contractor_id","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_engagements_tenant_id" ON "engagements" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_engagements_contractor_id" ON "engagements" ("contractor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_engagements_entity_id" ON "engagements" ("entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_idempotency_keys_tenant_key" ON "idempotency_keys" ("tenant_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_payables_tenant_external_ref" ON "payables" ("tenant_id","external_reference_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payables_tenant_id" ON "payables" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payables_entity_id" ON "payables" ("entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payables_contractor_id" ON "payables" ("contractor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payables_status" ON "payables" ("tenant_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payables_wingspan_id" ON "payables" ("wingspan_payable_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tenant_entities_tenant_id" ON "tenant_entities" ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_tenant_entities_tenant_name" ON "tenant_entities" ("tenant_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tenants_status" ON "tenants" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_webhook_deliveries_tenant_id" ON "webhook_deliveries" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_webhook_deliveries_status" ON "webhook_deliveries" ("status","next_retry_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_webhook_endpoints_tenant_id" ON "webhook_endpoints" ("tenant_id");