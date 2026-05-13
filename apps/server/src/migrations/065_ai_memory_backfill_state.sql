-- 065: ai_memory_backfill_state — resumable progress ledger for AI memory
-- backfill runs. Drives `scripts/ai-memory-backfill.mjs` (CLI) +
-- `apps/server/src/modules/ai-memory/backfill.ts` (server orchestrator).
--
-- Контекст: PR-19 (#2605) активував `MONO_AI_MEMORY_INGEST_ENABLED` —
-- з того моменту нові finyk/chat/etc писалися у `ai_memories` через
-- BullMQ `ai-memory-ingest` queue. Старі повідомлення з `tg_topic_archive`
-- (alerts, persona posts) залишилися без embedding-у — `/recall`
-- semantic-пошук їх не бачить. CLI-script `pnpm ai-memory:backfill`
-- проходить window архіву і enqueue-ить chunk-ом, цей table зберігає
-- progress, щоб довгий run-можна було pause-ити / resume-ити без
-- дублікатів і без втрати позиції.
--
-- Lifecycle:
--   * `INSERT` — на старті backfill-у (CLI dispatcher робить це через
--     `POST /api/internal/ai-memory/backfill` з server-side state writer).
--   * `UPDATE` — після кожного batch-у: bump `last_processed_id`,
--     `processed_count`, `enqueued_count`, `skipped_dedup_count`.
--   * `UPDATE completed_at` — на finishi (success або abort).
--   * Append-only history: rows ніколи не DELETE-яться програмно, лише
--     ALL-runs-purge через рутинний backup retention (10-річний DR
--     window).
--
-- Дизайн:
--   * `id BIGSERIAL` (Hard Rule #1 coerce у TS до `number` у serializer).
--   * `founder_user_id TEXT` — Better Auth opaque ID, дзеркалить
--     `OPENCLAW_FOUNDER_USER_ID`. Cofounder source per ADR-0031 §3 —
--     strict isolation, всі enqueue payloads ідуть як
--     `source='cofounder'` під цей userId. `'all'` source-mode у
--     майбутньому додасть merged-user backfill (поки що cofounder-only;
--     CLI приймає `--source cofounder|all` як forward-compat прапор).
--   * `last_processed_id BIGINT` — cursor у `tg_topic_archive.id` (також
--     BIGSERIAL). 0 коли run щойно стартував.
--   * `*_count INT` — лічильники у межах одного run; кумулятивні від
--     попередніх runs зберігаються через `metadata.resumed_from_id`.
--   * `estimated_cost_usd NUMERIC(10,4)` — Voyage cost-estimate
--     (chars/4 tokens × $0.02 / 1M tokens; ~$0.0001 per typical archive
--     row). Заповнюється на dry-run + перевіряється проти
--     `VOYAGE_DAILY_BUDGET_USD_SOFT` перед execute.
--   * `dry_run BOOLEAN` — distinguish-ить cost-estimation runs від
--     actual enqueue.
--   * `metadata JSONB` — за замовчуванням `{}`; зберігає
--     `topic_filter`, `resumed_from_id`, `voyage_quota_check`, `error`
--     details для post-mortem. JSONB замість окремих колонок щоб майбутні
--     поля додавалися без міграції.

CREATE TABLE IF NOT EXISTS ai_memory_backfill_state (
  id                     BIGSERIAL PRIMARY KEY,
  founder_user_id        TEXT NOT NULL,
  started_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at           TIMESTAMPTZ,

  -- Run configuration (immutable after INSERT).
  days_window            INTEGER NOT NULL,
  source_mode            TEXT NOT NULL CHECK (source_mode IN ('cofounder', 'all')),
  batch_size             INTEGER NOT NULL,
  dry_run                BOOLEAN NOT NULL DEFAULT FALSE,

  -- Progress (mutable; UPDATE-ляться кожний batch).
  last_processed_id      BIGINT NOT NULL DEFAULT 0,
  total_candidates       INTEGER NOT NULL DEFAULT 0,
  processed_count        INTEGER NOT NULL DEFAULT 0,
  enqueued_count         INTEGER NOT NULL DEFAULT 0,
  skipped_dedup_count    INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd     NUMERIC(10, 4) NOT NULL DEFAULT 0,

  -- Outcome (поки `completed_at IS NULL` — run у процесі).
  status                 TEXT NOT NULL DEFAULT 'running'
                         CHECK (status IN ('running', 'completed', 'aborted_budget',
                                           'aborted_error', 'dry_run_completed')),
  error                  TEXT,
  metadata               JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Primary read pattern: "find latest in-progress run for resume" або
-- "show history of last N runs". Index по started_at DESC ловить обидва.
CREATE INDEX IF NOT EXISTS ai_memory_backfill_state_started_idx
  ON ai_memory_backfill_state (started_at DESC);

-- Один-active-run-at-a-time guard: партіальний UNIQUE index, що дозволяє
-- лише один row зі status='running' per founder. Якщо CLI запустять
-- паралельно — другий INSERT впаде на UNIQUE-violation, що caller
-- зможе показати як "уже є active run id=X, дочекайся завершення або
-- abort". `dry_run=TRUE` runs не блокуються (cost-estimate безпечно
-- паралелити).
CREATE UNIQUE INDEX IF NOT EXISTS ai_memory_backfill_state_active_uniq
  ON ai_memory_backfill_state (founder_user_id)
  WHERE status = 'running' AND dry_run = FALSE;

COMMENT ON TABLE ai_memory_backfill_state IS
  'Resumable progress ledger for AI memory backfill runs from tg_topic_archive into ai_memories (PR-21 follow-up; consumed by scripts/ai-memory-backfill.mjs).';

COMMENT ON COLUMN ai_memory_backfill_state.last_processed_id IS
  'Cursor in tg_topic_archive.id — next batch starts WHERE id > last_processed_id. 0 when freshly inserted.';

COMMENT ON COLUMN ai_memory_backfill_state.estimated_cost_usd IS
  'Voyage embedding cost-estimate (chars/4 tokens × $0.02 / 1M). Computed on dry-run + checked vs VOYAGE_DAILY_BUDGET_USD_SOFT before execute.';

COMMENT ON COLUMN ai_memory_backfill_state.source_mode IS
  'cofounder = enqueue all rows as source=cofounder (ADR-0031 §3 strict isolation). all = future expansion to source-per-topic mapping (not yet implemented; CLI accepts the flag for forward-compat).';
