-- Entities are now env-scoped: each entity exists in exactly one environment.
-- Sandbox columns on tenant_entities are kept as nullable for now (dropped later
-- once we confirm nothing references them).

ALTER TABLE "tenant_entities"
  ADD COLUMN IF NOT EXISTS "environment" "api_key_environment" NOT NULL DEFAULT 'live';
--> statement-breakpoint
-- Replace old unique constraint with env-aware one
DROP INDEX IF EXISTS "idx_tenant_entities_tenant_name";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_tenant_entities_tenant_env_name"
  ON "tenant_entities" ("tenant_id","environment","name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tenant_entities_tenant_env"
  ON "tenant_entities" ("tenant_id","environment");
