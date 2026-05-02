-- 027: sync_op_log — per-row operation log for v2 sync (Stage 2 / PR #021).
--
-- See `docs/planning/storage-roadmap.md` PR #021 for the full design.
-- TL;DR: instead of the v1 whole-blob LWW model in `module_data`, v2
-- accepts a stream of per-row ops (`insert` | `update` | `delete`) for
-- normalised per-module tables. Each op is durably recorded here with
-- an idempotency key so:
--
--   * Replays from offline clients are no-ops on the second push;
--   * `pull?since=<op_id>` can stream subsequent ops to other devices
--     of the same user (cursor-based, append-only);
--   * `client_ts` lets the apply path do per-row last-write-wins.
--
-- This table is the foundation for Stage 3 (PR #022 — routine SPIKE)
-- and Stage 4–5 (per-module migrations + client-side op log). v1 sync
-- (`module_data`) keeps running in parallel until Stage 7 (PR #052).
--
-- Op-log table grows append-only; partition + archival is tracked as
-- PR #050 in the roadmap.

CREATE TABLE IF NOT EXISTS sync_op_log (
  id BIGSERIAL PRIMARY KEY,

  -- Owner of the op. We FK to "user"(id) for cascade-delete semantics
  -- (account close → audit trail removed in same migration window). The
  -- column is TEXT because Better Auth's `user.id` is a TEXT ULID, not
  -- a UUID — the design doc uses "UUID" loosely.
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,

  -- Client-supplied opaque key; UNIQUE per (user_id, idempotency_key).
  -- ULID/UUID-shaped, ≤64 chars enforced at the API layer.
  idempotency_key TEXT NOT NULL,

  -- Target table the op applies to. Whitelisted in the API layer
  -- (initially `routine_entries`, `routine_streaks`). Stored as TEXT
  -- so that adding a new module in Stage 4 only requires a server-side
  -- whitelist update, no migration.
  table_name TEXT NOT NULL,

  -- One of `insert` | `update` | `delete`. CHECK enforces the enum at
  -- the DB layer so a buggy client cannot smuggle a typo through.
  op TEXT NOT NULL CHECK (op IN ('insert', 'update', 'delete')),

  -- Full row payload (PK + fields). JSONB for indexability and so we
  -- can do server-side filtering when Stage 4 introduces per-table
  -- streams. Size is capped at the API layer (256 KB per op).
  row JSONB NOT NULL,

  -- Client-supplied timestamp at which the change was made on the
  -- originating device. Used for per-row LWW vs. the row's existing
  -- `updated_at`. Clients with broken clocks are rejected when
  -- client_ts > server_ts + 1h (see syncV2.ts).
  client_ts TIMESTAMPTZ NOT NULL,

  -- Server-side ingest time. Stable across clients, used for
  -- audit-trail ordering and as the source for the `pull?since` cursor
  -- secondary index.
  server_ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Optional device identifier (X-Origin-Device-Id header). When set,
  -- `/v2/sync/pull` excludes ops from the same device so a client
  -- never re-applies its own writes. NULL is legal (older clients,
  -- server-side replays).
  origin_device_id TEXT,

  -- Final status of the apply attempt:
  --   * applied   — row mutation succeeded; this is an authoritative op
  --   * duplicate — same (user_id, idempotency_key) was seen before;
  --                 this row is a sentinel pointing back to the original
  --                 (we always write a row even on duplicate to keep
  --                 the log dense; cached results live in this row's
  --                 status/reject_reason fields).
  --   * rejected  — apply path refused the op (LWW conflict, FK violation,
  --                 not-allowed table, schema mismatch, …).
  status TEXT NOT NULL CHECK (status IN ('applied', 'duplicate', 'rejected')),

  -- Free-form, ≤120-char machine-readable reason for `rejected` /
  -- `duplicate`. Examples: `lww_conflict`, `table_not_allowed`,
  -- `clock_skew`, `fk_violation`, `schema_mismatch`. NULL for `applied`.
  reject_reason TEXT,

  -- Idempotency key uniqueness — see the comment at the top of the
  -- table. This is the load-bearing constraint of v2 sync; without it
  -- offline replays would double-apply.
  CONSTRAINT sync_op_log_user_idem_key UNIQUE (user_id, idempotency_key)
);

-- Per-user cursor scan for `pull?since=<op_id>` (the hottest query):
--   Index Scan using sync_op_log_user_id_idx
--     Index Cond: (user_id = $1) AND (id > $2)
--   LIMIT N
CREATE INDEX IF NOT EXISTS sync_op_log_user_id_idx
  ON sync_op_log (user_id, id);

-- Per-table per-user pulls (Stage 4: "send me only routine_entries since X").
-- ORDER BY server_ts so module-filtered pulls are still time-ordered.
CREATE INDEX IF NOT EXISTS sync_op_log_user_table_server_ts_idx
  ON sync_op_log (user_id, table_name, server_ts);

COMMENT ON TABLE sync_op_log IS
  'Per-row op-log for v2 sync (Stage 2 / PR #021). Append-only, partition+archival tracked as PR #050.';
COMMENT ON COLUMN sync_op_log.idempotency_key IS
  'Client-supplied idempotency key; UNIQUE per (user_id, idempotency_key).';
COMMENT ON COLUMN sync_op_log.status IS
  'applied | duplicate | rejected.';
COMMENT ON COLUMN sync_op_log.origin_device_id IS
  'Optional client device id; X-Origin-Device-Id excludes same-device ops on pull.';
