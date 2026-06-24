-- Trace Wingspan API traffic and tie it back to activity-log events.
--
-- A per-incoming-request correlation id is stamped on both audit_log rows and
-- the wingspan_api_log rows produced while handling that request. The activity
-- UI joins them on correlation_id so a `worker.created` event can show every
-- Wingspan call (request + response) it triggered.
--
-- Sensitive values (SSN, tokens, bank info, Authorization header) are redacted
-- by the API before insert — payloads here are already masked.

ALTER TABLE audit_log ADD COLUMN correlation_id text;
CREATE INDEX idx_audit_log_correlation ON audit_log (correlation_id);

CREATE TABLE wingspan_api_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  correlation_id text,
  environment text,
  api_version text NOT NULL DEFAULT 'v1',
  method text NOT NULL,
  url text NOT NULL,
  request_headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_body jsonb,
  response_status integer,
  response_body jsonb,
  wingspan_request_id text,
  duration_ms integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_wingspan_api_log_correlation ON wingspan_api_log (correlation_id);
CREATE INDEX idx_wingspan_api_log_tenant ON wingspan_api_log (tenant_id, created_at);
