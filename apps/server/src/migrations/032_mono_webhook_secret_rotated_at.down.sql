-- Reverse of 032. Idempotent (rollback-sanity test re-runs every down twice).
DROP INDEX IF EXISTS mono_connection_webhook_secret_rotated_at_idx;
ALTER TABLE mono_connection
  DROP COLUMN IF EXISTS webhook_secret_rotated_at;
