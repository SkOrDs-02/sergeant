-- 066: ai_memory_ingest_failed — dead-letter queue для AI memory ingest.
--
-- Контекст: PR-19 (#2605) активував `ai-memory-ingest` BullMQ-чергу. PR-38
-- (#2572) + Voyage daily cost alert (#2719) додали budget-side guard-и.
-- Зараз retries-exhausted або non-retryable job-и просто LOG-ляться у Sentry
-- + лишаються у BullMQ `failed`-state (зі стандартним 14d retention) — для
-- post-mortem-у це достатньо, але для **систематичного replay-у** після
-- fix-у downstream-bug-у потрібна окрема, queryable SQL-таблиця:
--   * BullMQ `failed` jobs зникають через 14 днів — Voyage incident,
--     діагностований за 15 діб після, вже без replay-tooling-у.
--   * Operator не може фільтрувати/сортувати `failed`-jobs за `source`,
--     `user_id`, `error` без custom Redis-scan-script-у — а тут SQL.
--   * Replay через `enqueueMemoryIngest()` дедуплікується через BullMQ jobId
--     `(user_id, source, source_ref)` — DLQ-replay не створює дублікатів.
--
-- Lifecycle:
--   * `INSERT` — з `apps/server/src/modules/ai-memory/dlq.ts::recordIngestDlq`,
--     викликається у `processMemoryIngestJob` коли (a) `isRetryableIngestError=false`,
--     або (b) BullMQ failed-event після `attemptsMade >= AI_MEMORY_INGEST_ATTEMPTS`.
--   * `UPDATE replayed_at, replay_count` — на replay-CLI / API виклику.
--   * `DELETE` — operator manual; програмний retention не плануємо
--     (Voyage cost incident-и треба тримати "вічно" для finance audit-у).
--
-- Дизайн:
--   * `id BIGSERIAL` (Hard Rule #1 coerce у TS до `number` у serializer).
--   * `user_id TEXT` — Better Auth opaque ID (не UUID; Hard Rule #20 domain
--     invariant).
--   * `source TEXT` — `MemorySource` enum-string (`finyk`, `chat`, `digest`,
--     `cofounder`, …). CHECK-constraint винесений у app-layer (BullMQ
--     payload-validation, `assertValidSource`).
--   * `source_ref TEXT NULL` — зовнішній id у домені (mono_tx_id для finyk,
--     week_key для digest, null для chat). NULL допустимий.
--   * `payload_json JSONB` — повний payload (content, metadata) для replay.
--     Не зберігаємо raw embedding (Voyage би перерахував все одно).
--   * `error_msg TEXT` — `err.message` (без stack). Stack лишається у Sentry.
--   * `attempts INT NOT NULL` — finální `attemptsMade` (1..5 за замовчуванням).
--   * `last_attempt_at TIMESTAMPTZ` — момент permanent-failure-у.
--   * `replayed_at TIMESTAMPTZ NULL` + `replay_count INT NOT NULL DEFAULT 0`
--     — replay-tracking (paritetно PR-29 `n8n_webhook_events.replay_count`).
--
-- Read patterns:
--   1. "Show me recent failures" — index `(last_attempt_at DESC)`.
--   2. "Replay everything for source=finyk since X" — composite
--      `(source, last_attempt_at)` ловить filter+sort.
--   3. "Has this exact (user, source, source_ref) failed?" — partial unique
--      Index `(user_id, source, source_ref) WHERE replayed_at IS NULL`
--      гарантує idempotent INSERT (повторне permanent-fail однієї job-и не
--      плодить дублі — UPDATE attempts+last_attempt_at).

CREATE TABLE IF NOT EXISTS ai_memory_ingest_failed (
  id                BIGSERIAL PRIMARY KEY,
  user_id           TEXT NOT NULL,
  source            TEXT NOT NULL,
  source_ref        TEXT,
  payload_json      JSONB NOT NULL,
  error_msg         TEXT NOT NULL,
  attempts          INTEGER NOT NULL,
  last_attempt_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  replayed_at       TIMESTAMPTZ,
  replay_count      INTEGER NOT NULL DEFAULT 0
);

-- Primary read pattern: "recent failures DESC for triage / dashboard".
CREATE INDEX IF NOT EXISTS ai_memory_ingest_failed_last_attempt_idx
  ON ai_memory_ingest_failed (last_attempt_at DESC);

-- Filter+sort: "all finyk-failures за останні 7д для replay після fix-у".
CREATE INDEX IF NOT EXISTS ai_memory_ingest_failed_source_idx
  ON ai_memory_ingest_failed (source, last_attempt_at DESC);

-- Idempotent INSERT-guard: одна (user, source, source_ref) пара може мати
-- лише один НЕ-replayed-row у DLQ. Якщо та сама job впала повторно (rare,
-- бо BullMQ jobId-dedup — але можливо при manual replay → знов fail) →
-- UPSERT bump-ить attempts/last_attempt_at без створення дубліката.
-- WHERE clauses: source_ref IS NOT NULL (бо NULL ≠ NULL у UNIQUE), і
-- replayed_at IS NULL (після replay стара row лишається як audit-trail,
-- нова — окремий active-failure-record).
CREATE UNIQUE INDEX IF NOT EXISTS ai_memory_ingest_failed_active_uniq
  ON ai_memory_ingest_failed (user_id, source, source_ref)
  WHERE source_ref IS NOT NULL AND replayed_at IS NULL;

COMMENT ON TABLE ai_memory_ingest_failed IS
  'Dead-letter queue для AI memory ingest jobs, що exhausted retries або non-retryable (Voyage 4xx, malformed payload). Consumed by scripts/replay-dlq.mjs + POST /api/internal/ai-memory-dlq/replay.';

COMMENT ON COLUMN ai_memory_ingest_failed.payload_json IS
  'Original MemoryIngestPayload (content + metadata). Used by replay tooling to re-enqueue without re-reading source-of-truth (mono webhook, etc).';

COMMENT ON COLUMN ai_memory_ingest_failed.replayed_at IS
  'NULL → active failure, awaiting operator action. NOT NULL → row archived; operator triggered replay. Multiple replays bump replay_count.';
