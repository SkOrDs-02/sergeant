-- Down migration: n8n_failure_events alert dedup signature
-- PR-15 rollback. Removes generated column + index.

DROP INDEX IF EXISTS n8n_failure_events_signature_recent_idx;
ALTER TABLE n8n_failure_events DROP COLUMN IF EXISTS error_signature;
