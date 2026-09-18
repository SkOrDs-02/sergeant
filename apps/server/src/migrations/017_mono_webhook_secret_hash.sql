-- Hash-keyed lookup for the Monobank webhook delivery endpoint.
--
-- Before this migration `mono_connection.webhook_secret` was the literal
-- 32-byte hex shared between us and Monobank — the path component of
-- `/api/mono/webhook/:secret`. The webhook handler resolved a request by
-- `WHERE webhook_secret = $1`, then re-applied `timingSafeEqual` on the
-- already-loaded row. The compare-after-lookup was security theatre: the
-- B-tree probe inside Postgres short-circuits on the first mismatching
-- byte, so the SQL execution time itself leaks the prefix and turns the
-- secret into a one-byte-at-a-time recovery problem for an on-path
-- attacker. (App-side `timingSafeEqual` cannot recover what the index
-- already gave away.) We also stored the secret in plaintext, so a
-- read-only DB leak yields a forge-anyone's-transactions primitive.
--
-- The fix is to look up by SHA-256 of the secret. SHA-256 makes the
-- `WHERE` clause oblivious to the secret's content (any timing differs
-- by hash, not by prefix), and it lets a future migration drop the
-- plaintext column entirely once all clients are on the new code.
--
-- This forward migration is additive: keep `webhook_secret` for one
-- release cycle so a code rollback still works. A follow-up migration
-- (`018_*`) is expected to drop the plaintext column after the new code
-- has rolled out cleanly.

ALTER TABLE mono_connection
  ADD COLUMN IF NOT EXISTS webhook_secret_hash TEXT;

-- Backfill from the existing plaintext column. `convert_to(... , 'UTF8')`
-- forces a deterministic encoding so the result matches Node's
-- `crypto.createHash('sha256').update(secret, 'utf8')`. `encode(..., 'hex')`
-- produces lowercase hex matching `digest('hex')`.
UPDATE mono_connection
   SET webhook_secret_hash =
         encode(sha256(convert_to(webhook_secret, 'UTF8')), 'hex')
 WHERE webhook_secret_hash IS NULL;

ALTER TABLE mono_connection
  ALTER COLUMN webhook_secret_hash SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS mono_connection_webhook_secret_hash_idx
  ON mono_connection (webhook_secret_hash);
