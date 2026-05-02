CREATE TABLE IF NOT EXISTS n8n_failure_events (
  id BIGSERIAL PRIMARY KEY,
  workflow_id TEXT,
  workflow_name TEXT,
  execution_id TEXT,
  last_node TEXT,
  error_message TEXT NOT NULL,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS n8n_failure_events_created_at_idx
  ON n8n_failure_events (created_at DESC);

COMMENT ON TABLE n8n_failure_events IS
  'Dead-letter log populated by the n8n global error workflow.';
