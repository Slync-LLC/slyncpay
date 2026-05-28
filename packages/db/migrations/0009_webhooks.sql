-- Inbound webhook events received from Wingspan. Idempotent on
-- wingspan_event_id so retries don't double-process.
--
-- webhook_endpoints + webhook_deliveries already exist (from 0000) and are
-- used by Phase 3b for outbound; this migration just adds the inbound table.
CREATE TYPE webhook_inbound_status AS ENUM ('received', 'processed', 'failed', 'ignored');

CREATE TABLE webhook_inbound_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'wingspan',
  event_type text NOT NULL,
  wingspan_event_id text UNIQUE,
  resource_type text,
  resource_id text,
  payload jsonb NOT NULL,
  status webhook_inbound_status NOT NULL DEFAULT 'received',
  error text,
  received_at timestamp with time zone NOT NULL DEFAULT now(),
  processed_at timestamp with time zone
);
CREATE INDEX idx_webhook_inbound_status ON webhook_inbound_events (status);
CREATE INDEX idx_webhook_inbound_resource ON webhook_inbound_events (resource_type, resource_id);
CREATE INDEX idx_webhook_inbound_event_type ON webhook_inbound_events (event_type);
