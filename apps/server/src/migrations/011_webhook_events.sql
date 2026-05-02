-- Idempotency table for external webhook events.
-- n8n workflows INSERT here before processing; ON CONFLICT means duplicate
-- deliveries (Stripe/Sentry/GitHub retries) are silently skipped.
--
-- source: 'stripe' | 'sentry' | 'github' | 'mono'
-- event_id: provider's unique event ID (Stripe evt_xxx, GitHub delivery ID, etc.)

CREATE TABLE IF NOT EXISTS webhook_events (
  id           BIGSERIAL PRIMARY KEY,
  source       TEXT        NOT NULL,
  event_id     TEXT        NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload_hash TEXT,

  CONSTRAINT webhook_events_source_event_id_key UNIQUE (source, event_id)
);

CREATE INDEX IF NOT EXISTS webhook_events_processed_at_idx
  ON webhook_events (processed_at DESC);

-- Retention: keep 90 days. Purge via pg_cron or a separate cleanup workflow.
COMMENT ON TABLE webhook_events IS
  'Idempotency log for external webhooks. Each (source, event_id) processed at most once.';
