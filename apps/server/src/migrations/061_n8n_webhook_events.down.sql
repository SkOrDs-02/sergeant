-- Down migration: n8n_webhook_events
-- PR-28 rollback. Drop append-only webhook replay table + its indexes.

DROP INDEX IF EXISTS n8n_webhook_events_pending_idx;
DROP INDEX IF EXISTS n8n_webhook_events_workflow_received_at_idx;
DROP TABLE IF EXISTS n8n_webhook_events;
