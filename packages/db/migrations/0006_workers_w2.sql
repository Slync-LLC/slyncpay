-- Rename "contractor" → "worker" so the noun covers both 1099 contractors and W-2 employees.
ALTER TYPE contractor_onboarding_status RENAME TO worker_onboarding_status;
ALTER TABLE contractors RENAME TO workers;

ALTER TABLE engagements RENAME COLUMN contractor_id TO worker_id;
ALTER TABLE payables    RENAME COLUMN contractor_id TO worker_id;

ALTER INDEX idx_contractors_tenant_env_external RENAME TO idx_workers_tenant_env_external;
ALTER INDEX idx_contractors_tenant_env          RENAME TO idx_workers_tenant_env;
ALTER INDEX idx_contractors_tenant_id           RENAME TO idx_workers_tenant_id;
ALTER INDEX idx_contractors_email               RENAME TO idx_workers_email;
ALTER INDEX idx_contractors_wingspan_user_id    RENAME TO idx_workers_wingspan_user_id;

-- Classification enums. engagement_type mirrors Wingspan V3's "Contractor" / "Employee".
CREATE TYPE entity_tax_type AS ENUM ('w2', '1099');
CREATE TYPE engagement_type AS ENUM ('contractor', 'employee');

ALTER TABLE tenant_entities
  ADD COLUMN tax_type entity_tax_type NOT NULL DEFAULT '1099';

ALTER TABLE engagements
  ADD COLUMN type engagement_type NOT NULL DEFAULT 'contractor';

-- V3 child-account IDs (acct_child_*), populated in Phase 2 when we wire the W-2 client.
ALTER TABLE tenant_entities
  ADD COLUMN wingspan_v3_account_id text,
  ADD COLUMN wingspan_v3_account_id_sandbox text;

-- Seed: the sandbox Nurseio II LLC entity is explicitly W-2 per the setup state.
UPDATE tenant_entities
   SET tax_type = 'w2'
 WHERE environment = 'test'
   AND name = 'Nurseio II LLC';
