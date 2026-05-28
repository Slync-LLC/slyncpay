-- V3 IDs for W-2 engagements live in their own columns alongside the V1
-- wingspan_payer_payee_engagement_id used by 1099 flows.
ALTER TABLE engagements
  ADD COLUMN wingspan_v3_payee_id text,
  ADD COLUMN wingspan_v3_engagement_id text;

-- The V1 wingspan_payer_payee_engagement_id is required for 1099 engagements
-- but doesn't apply to W-2. Drop the NOT NULL so W-2 engagements can be
-- inserted with that column left empty.
ALTER TABLE engagements
  ALTER COLUMN wingspan_payer_payee_engagement_id DROP NOT NULL;
