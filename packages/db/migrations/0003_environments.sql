-- Sandbox/production split: per-environment Wingspan IDs + environment-scoped data.

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "wingspan_payee_bucket_user_id_sandbox" text;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tenants" ADD CONSTRAINT "tenants_wingspan_payee_bucket_user_id_sandbox_unique"
    UNIQUE ("wingspan_payee_bucket_user_id_sandbox");
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "tenant_entities"
  ADD COLUMN IF NOT EXISTS "wingspan_child_user_id_sandbox" text,
  ADD COLUMN IF NOT EXISTS "wingspan_child_user_email_sandbox" text;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tenant_entities" ADD CONSTRAINT "tenant_entities_wingspan_child_user_id_sandbox_unique"
    UNIQUE ("wingspan_child_user_id_sandbox");
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "contractors"
  ADD COLUMN IF NOT EXISTS "environment" "api_key_environment" NOT NULL DEFAULT 'live';
--> statement-breakpoint
ALTER TABLE "engagements"
  ADD COLUMN IF NOT EXISTS "environment" "api_key_environment" NOT NULL DEFAULT 'live';
--> statement-breakpoint
ALTER TABLE "payables"
  ADD COLUMN IF NOT EXISTS "environment" "api_key_environment" NOT NULL DEFAULT 'live';
--> statement-breakpoint
ALTER TABLE "disbursements"
  ADD COLUMN IF NOT EXISTS "environment" "api_key_environment" NOT NULL DEFAULT 'live';
--> statement-breakpoint
-- Replace single-env unique indexes with env-aware ones
DROP INDEX IF EXISTS "idx_contractors_tenant_external";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_contractors_tenant_env_external"
  ON "contractors" ("tenant_id","environment","external_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contractors_tenant_env"
  ON "contractors" ("tenant_id","environment");
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_engagements_contractor_entity";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_engagements_contractor_entity_env"
  ON "engagements" ("contractor_id","entity_id","environment");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_engagements_tenant_env"
  ON "engagements" ("tenant_id","environment");
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_payables_tenant_external_ref";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_payables_tenant_env_external_ref"
  ON "payables" ("tenant_id","environment","external_reference_id")
  WHERE "external_reference_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payables_tenant_env"
  ON "payables" ("tenant_id","environment");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_disbursements_tenant_env"
  ON "disbursements" ("tenant_id","environment");
