-- Phase 2 of W-2 buildout: structural tables driven by Wingspan V3 W-2 spec.
-- All net-new — no renames or destructive ops on existing tables.

-- ─── Worksites (W-2 only): physical work locations under each entity ──────────
CREATE TABLE worksites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  entity_id uuid NOT NULL REFERENCES tenant_entities(id) ON DELETE RESTRICT,
  name text NOT NULL,
  address_line1 text NOT NULL,
  address_line2 text,
  city text NOT NULL,
  state text NOT NULL,
  postal_code text NOT NULL,
  country text NOT NULL DEFAULT 'US',
  external_id text,
  wingspan_worksite_id text UNIQUE,
  environment api_key_environment NOT NULL DEFAULT 'live',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX idx_worksites_entity ON worksites (entity_id);
CREATE INDEX idx_worksites_tenant_env ON worksites (tenant_id, environment);

-- ─── State jurisdiction config: one-time per-state per-payer setup ────────────
-- Tracks whether a state's withholding, SUTA, PFML/SDI registrations are in
-- place. Worksite creation in a state is blocked until status='complete'.
CREATE TYPE jurisdiction_config_status AS ENUM ('pending', 'in_progress', 'complete');

CREATE TABLE state_jurisdiction_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  entity_id uuid NOT NULL REFERENCES tenant_entities(id) ON DELETE RESTRICT,
  state text NOT NULL,
  status jurisdiction_config_status NOT NULL DEFAULT 'pending',
  notes text,
  completed_at timestamp with time zone,
  environment api_key_environment NOT NULL DEFAULT 'live',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_state_jur_entity_state_env
  ON state_jurisdiction_configs (entity_id, state, environment);
CREATE INDEX idx_state_jur_tenant_env
  ON state_jurisdiction_configs (tenant_id, environment);

-- ─── Engagement templates: per-role onboarding requirement bundles ────────────
CREATE TYPE i9_mode AS ENUM ('self_managed', 'wingspan_managed', 'hybrid');

CREATE TABLE engagement_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  entity_id uuid NOT NULL REFERENCES tenant_entities(id) ON DELETE RESTRICT,
  name text NOT NULL,
  i9_mode i9_mode NOT NULL DEFAULT 'self_managed',
  requirements jsonb NOT NULL DEFAULT '[]',
  wingspan_template_id text UNIQUE,
  environment api_key_environment NOT NULL DEFAULT 'live',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX idx_eng_templates_tenant_env ON engagement_templates (tenant_id, environment);
CREATE INDEX idx_eng_templates_entity ON engagement_templates (entity_id);

-- Link engagements to a template so we know which requirements the worker needs.
ALTER TABLE engagements
  ADD COLUMN engagement_template_id uuid REFERENCES engagement_templates(id),
  ADD COLUMN worksite_id uuid REFERENCES worksites(id),
  -- W-2 compensation fields. JSON keeps shape flexible (Hourly/Salary/etc.).
  ADD COLUMN compensation jsonb,
  ADD COLUMN pay_schedule text,
  ADD COLUMN job_title text;

-- ─── Work logs: hours capture for W-2 workers ─────────────────────────────────
CREATE TYPE work_log_status AS ENUM ('draft', 'approved', 'processed', 'cancelled');

CREATE TABLE work_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
  engagement_id uuid NOT NULL REFERENCES engagements(id) ON DELETE RESTRICT,
  worksite_id uuid NOT NULL REFERENCES worksites(id) ON DELETE RESTRICT,
  period_start timestamp with time zone NOT NULL,
  period_end timestamp with time zone NOT NULL,
  quantity numeric NOT NULL,
  unit text NOT NULL DEFAULT 'Hours',
  rate_cents integer NOT NULL,
  status work_log_status NOT NULL DEFAULT 'draft',
  wingspan_work_log_id text UNIQUE,
  external_id text,
  environment api_key_environment NOT NULL DEFAULT 'live',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  approved_at timestamp with time zone
);
CREATE INDEX idx_work_logs_engagement ON work_logs (engagement_id);
CREATE INDEX idx_work_logs_tenant_env ON work_logs (tenant_id, environment);
CREATE INDEX idx_work_logs_status ON work_logs (status);

-- ─── Payrolls: W-2 payment runs (separate from disbursements) ─────────────────
CREATE TYPE payroll_type AS ENUM ('regular', 'off_cycle');
CREATE TYPE payroll_status AS ENUM ('draft', 'previewed', 'approved', 'processing', 'paid', 'failed');

CREATE TABLE payrolls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  entity_id uuid NOT NULL REFERENCES tenant_entities(id) ON DELETE RESTRICT,
  type payroll_type NOT NULL DEFAULT 'regular',
  period_start date NOT NULL,
  period_end date NOT NULL,
  pay_date date NOT NULL,
  status payroll_status NOT NULL DEFAULT 'draft',
  wingspan_payroll_id text UNIQUE,
  total_employee_gross_cents bigint NOT NULL DEFAULT 0,
  total_employer_tax_cents bigint NOT NULL DEFAULT 0,
  total_net_cents bigint NOT NULL DEFAULT 0,
  environment api_key_environment NOT NULL DEFAULT 'live',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  approved_at timestamp with time zone,
  paid_at timestamp with time zone
);
CREATE INDEX idx_payrolls_entity ON payrolls (entity_id);
CREATE INDEX idx_payrolls_tenant_env ON payrolls (tenant_id, environment);

-- ─── Pay statements: immutable per-worker per-payroll ─────────────────────────
CREATE TYPE pay_statement_status AS ENUM ('pending', 'issued', 'failed', 'corrected');

CREATE TABLE pay_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  payroll_id uuid NOT NULL REFERENCES payrolls(id) ON DELETE RESTRICT,
  worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
  engagement_id uuid NOT NULL REFERENCES engagements(id) ON DELETE RESTRICT,
  gross_cents bigint NOT NULL,
  net_cents bigint NOT NULL,
  line_items jsonb NOT NULL DEFAULT '[]',
  status pay_statement_status NOT NULL DEFAULT 'pending',
  wingspan_pay_statement_id text UNIQUE,
  -- Corrections issue a new row that points back at the original.
  corrects_pay_statement_id uuid REFERENCES pay_statements(id),
  environment api_key_environment NOT NULL DEFAULT 'live',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  issued_at timestamp with time zone
);
CREATE INDEX idx_pay_statements_payroll ON pay_statements (payroll_id);
CREATE INDEX idx_pay_statements_worker ON pay_statements (worker_id);
CREATE INDEX idx_pay_statements_tenant_env ON pay_statements (tenant_id, environment);
