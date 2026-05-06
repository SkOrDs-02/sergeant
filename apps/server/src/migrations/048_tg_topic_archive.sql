-- 047: tg_topic_archive — message-level archive for the Sergeant_ops
-- supergroup forum topics. Backs `read_telegram_topic_history` (ADR-0031
-- §5; openclaw-roadmap Phase 3 / Pain P8).
--
-- Why a separate table from `tg_alert_acks`:
--   * `tg_alert_acks` is a row-per-alert accountability ledger (one row
--     per `alert_id`, mutable on ack/escalation, summary often NULL).
--   * `tg_topic_archive` is append-only message history (text always
--     present; covers both alert posts AND OpenClaw `post_to_topic`
--     write-tool messages; multiple rows for the same alert allowed when
--     follow-ups happen).
--
-- Lifecycle:
--   * Server INSERTS one row whenever a message is posted to a topic in
--     the Sergeant_ops supergroup. Today the writers are
--     `recordAlertPost` (n8n alerts) and `postToTopic` (OpenClaw write-
--     tool). Future writers (e.g. MTProto archiver, manual digest
--     workflow) plug into the same store.
--   * `read_telegram_topic_history` (`apps/server/src/modules/openclaw/
--     tools.ts`) SELECTs the most recent N rows per topic, optionally
--     bounded by `since` ISO timestamp, and returns them to the LLM.
--
-- Idempotency:
--   * `(topic, dedupe_key)` UNIQUE — same alert_id retried by n8n becomes
--     a no-op (matches `tg_alert_acks` semantics). For non-alert rows
--     callers pass `dedupe_key = NULL` and we fall back to plain INSERT
--     (rare path: manual `post_to_topic` from a persona; the probability
--     of identical text within the same second is negligible).
--   * Partial unique index because PostgreSQL treats NULL as distinct in
--     a regular UNIQUE constraint, which is exactly what we want here:
--     "two alerts with the same id collide; two NULL-keyed manual posts
--     do not".

CREATE TABLE IF NOT EXISTS tg_topic_archive (
  id           BIGSERIAL PRIMARY KEY,
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Topic key from REPORTING-MATRIX.md (`incidents`, `revenue`, `growth`,
  -- `digests`, `meta`, `engineering`, `control_plane`, `ops`). Free-form
  -- TEXT so a new topic can ship without a schema migration; the read
  -- path filters on exact match.
  topic        TEXT NOT NULL,

  -- Telegram `message_id` (returned by `sendMessage`). 0 when the writer
  -- did not record one (e.g. retried post that surfaced an error).
  message_id   INTEGER NOT NULL DEFAULT 0,

  -- The actual message text. NOT NULL — empty rows are useless to the
  -- LLM. For alert posts we use `summary`; for `post_to_topic` we use
  -- the persona-emitted body verbatim.
  text         TEXT NOT NULL,

  -- One of the known writer kinds. Free-form TEXT (no enum) so future
  -- writers can ship without a migration. Today: `alert`, `post_to_topic`.
  source       TEXT NOT NULL,

  -- Stable id-for-dedup. For `alert` writes we pass `tg_alert_acks.alert_id`
  -- so n8n retries no-op. For `post_to_topic` we pass NULL.
  dedupe_key   TEXT,

  -- Free-form (workflow_id, persona, approval_id, ack_status, etc).
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Primary read pattern: "last N rows for topic X (optionally since Y)".
CREATE INDEX IF NOT EXISTS tg_topic_archive_topic_sent_idx
  ON tg_topic_archive (topic, sent_at DESC);

-- Idempotency for retry storms — see header comment.
CREATE UNIQUE INDEX IF NOT EXISTS tg_topic_archive_topic_dedupe_uniq
  ON tg_topic_archive (topic, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

COMMENT ON TABLE tg_topic_archive IS
  'Append-only message archive for Sergeant_ops supergroup forum topics. Backs read_telegram_topic_history (ADR-0031 §5, OpenClaw roadmap Phase 3 / Pain P8).';

COMMENT ON COLUMN tg_topic_archive.dedupe_key IS
  'Stable retry-safe key (e.g. tg_alert_acks.alert_id). NULL for sources that do not provide one — partial UNIQUE index treats NULLs as distinct so manual posts never collide.';

COMMENT ON COLUMN tg_topic_archive.source IS
  'Writer kind: alert | post_to_topic | (future) mtproto_archiver. Free-form TEXT — new writers ship without a migration.';
