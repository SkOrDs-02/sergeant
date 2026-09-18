-- Per-connection rotation timestamp for the Monobank webhook secret.
--
-- Monobank's `/personal/webhook` registration is symmetric — the secret in
-- the URL we register has no expiry on their side, so a leaked path-secret
-- (e.g. surfaced through a proxy access-log) is forge-anyone's-statements
-- forever. Migration 017 closed the SQL-side timing-leak; this migration
-- adds the missing piece: bounded validity for the secret itself, so a
-- silent leak ages out automatically instead of staying valid until the
-- user manually disconnects.
--
-- The rotation worker (see `modules/mono/rotateSecret.ts`) selects rows
-- with `webhook_secret_rotated_at < NOW() - INTERVAL '90 days'`, generates
-- a new secret, re-registers it with Monobank, and updates the row in a
-- single transaction. We backfill from `webhook_registered_at` rather than
-- defaulting to NOW() so existing connections do not all reset their
-- rotation clock to deploy time — that would make the worker think nothing
-- needs rotating until 90 days after this migration ships, even though
-- some connections might already have been registered for years.

ALTER TABLE mono_connection
  ADD COLUMN IF NOT EXISTS webhook_secret_rotated_at TIMESTAMPTZ;

UPDATE mono_connection
   SET webhook_secret_rotated_at = COALESCE(webhook_registered_at, NOW())
 WHERE webhook_secret_rotated_at IS NULL;

ALTER TABLE mono_connection
  ALTER COLUMN webhook_secret_rotated_at SET NOT NULL,
  ALTER COLUMN webhook_secret_rotated_at SET DEFAULT NOW();

-- Partial index keyed only on active connections — disconnected/disabled
-- rows never need rotation, and the partial WHERE keeps the index small
-- on a pg installation where a churned user-base would otherwise dominate.
CREATE INDEX IF NOT EXISTS mono_connection_webhook_secret_rotated_at_idx
  ON mono_connection (webhook_secret_rotated_at)
  WHERE status = 'active';
