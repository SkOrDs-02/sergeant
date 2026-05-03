-- Postgres-backed rate-limit buckets — Stage 1, PR #011 from
-- `docs/planning/storage-roadmap.md`.
--
-- Replaces the in-memory per-process fallback in
-- `apps/server/src/http/rateLimit.ts` with a horizontally-shareable
-- counter so a single user/IP cannot escape limits by routing through
-- different replicas. Redis is still preferred when available (atomic
-- INCR+EXPIRE Lua script in the same file) — Postgres only kicks in
-- when REDIS_URL is unset or `getRedis()` returned `null` after retries.
--
-- Bucket model is fixed-window (matches the Redis path's semantics):
-- a row is keyed by `(rl_key, subject)` and carries the window's
-- start instant + a hit counter. Within the window, increments are
-- one round-trip; once `now - started_at >= window_ms` the row is
-- atomically rotated to a fresh window with `count = 1`.
--
-- We deliberately do NOT carry a per-row `window_ms` in the table
-- itself: the caller already passes the window length, and storing it
-- would let one route's misconfiguration silently extend another route's
-- bucket. The application uses the request's window to decide whether
-- the stored row has expired; eviction is by NOW() comparison, not by
-- a stored TTL column, so concurrent windows of different lengths are
-- naturally isolated by the `(rl_key, subject)` composite key.

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  rl_key TEXT NOT NULL,
  subject TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (rl_key, subject)
);

-- Sweep index — the cleanup query runs `DELETE FROM rate_limit_buckets
-- WHERE started_at < NOW() - INTERVAL 'X seconds'` after each request
-- with low probability (1/N), so the index keeps that scan O(matched
-- rows) instead of O(table). Without it a hot endpoint would grow the
-- table indefinitely under churning IPs.
CREATE INDEX IF NOT EXISTS rate_limit_buckets_started_at_idx
  ON rate_limit_buckets (started_at);
