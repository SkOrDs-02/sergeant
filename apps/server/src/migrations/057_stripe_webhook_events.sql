-- 0010 Phase 2.1: Billing data layer — Stripe webhook idempotency store
-- Stripe delivers events at-least-once; this prevents duplicate processing.
-- Dedicated table (vs generic webhook_events from 011) for Stripe-specific
-- payload storage needed by billing reconciliation queries.

CREATE TABLE stripe_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL
);

CREATE INDEX stripe_webhook_events_type_idx ON stripe_webhook_events(event_type);
CREATE INDEX stripe_webhook_events_processed_at_idx ON stripe_webhook_events(processed_at);

COMMENT ON TABLE stripe_webhook_events IS 'Idempotency store for Stripe webhook events. Insert before processing; skip if event_id already exists.';
