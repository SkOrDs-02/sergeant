-- 067: ai_memories soft-delete — `deleted_at TIMESTAMPTZ` + recall-hot-path index.
--
-- Контекст: PR-19 (#2605) активував AI memory ingest, PR-21 (#2625) активував
-- WF-30 daily digest, PR-22 (#2712) додав retroactive backfill з
-- `tg_topic_archive`. Тепер founder має повний read-write cycle через
-- `/recall` + ingest queue + digest. Цей PR додає **read-write-delete**
-- через `/forget` slash-команду (founder DM only).
--
-- Чому soft-delete (а не hard-DELETE):
--   1. Recovery window: founder може випадково видалити стратегічно
--      важливу row-у. 7-денний soft-delete buffer дає шанс recovery без
--      backup-restore (`UPDATE ai_memories SET deleted_at = NULL WHERE id = ...`).
--   2. Audit trail: `openclaw_invocations.metadata.deleted_count`
--      перехрещується з `WHERE deleted_at > created_at` для forensic
--      reconstruction "що founder фактично видалив".
--   3. Idempotency: повторний `/forget` тієї самої row-и без soft-delete
--      падав би на "no such row"; з soft-delete друга спроба — no-op.
--   4. GDPR-compliance: соft-delete + 7-day hard-delete cron виконує
--      "right to be forgotten" з reasonable retention. Hard-delete cron
--      реалізується окремим cleanup-runom (див.
--      `apps/server/src/modules/ai-memory/forgetCleanup.ts`).
--
-- ─── Семантика ─────────────────────────────────────────────────────────
--
-- `deleted_at TIMESTAMPTZ` (nullable, no default):
--   * NULL — row є активною, видима у `/recall`, digest, RAG.
--   * non-NULL — row у soft-delete buffer-і. Hidden від read-path-у.
--     Hard-delete cron видалить row коли `deleted_at < now() - 7 days`.
--
-- Read-path filter (`/recall`, `WF-30 digest`, RAG context-injection):
--   * Усі query, що тягнуть memory для founder-а, мають `AND deleted_at IS NULL`.
--   * vectorStore.query() (apps/server/src/modules/ai-memory/vectorStore.ts)
--     додає filter автоматично, тож callers (recall route, RAG) не дублюють.
--
-- Write-path:
--   * Soft-delete: `UPDATE ai_memories SET deleted_at = NOW() WHERE ...`
--   * Restore (admin-only, через ops): `UPDATE ai_memories SET deleted_at = NULL WHERE id = ...`
--   * Hard-delete (cron): `DELETE FROM ai_memories WHERE deleted_at < NOW() - INTERVAL '7 days'`
--
-- ─── Партиційний caveat ─────────────────────────────────────────────────
--
-- `ai_memories` — HASH-партиційована (025) на 32 партиції. ALTER TABLE на
-- parent каскадиться у партиції автоматично (Postgres ≥11). Тому ALTER
-- лише parent-у — усі 32 партиції підтягнуть нову колонку.
--
-- ─── Index ─────────────────────────────────────────────────────────────
--
-- Hot path `/recall` — vector ANN-пошук на HNSW (025) з pre-filter
-- `user_id = $1 AND deleted_at IS NULL`. Existing partial index на
-- `(user_id, persona, created_at DESC) WHERE source = 'cofounder'` (054)
-- НЕ враховує deleted_at, тож виконавець скануватиме soft-deleted rows
-- разом з активними і фільтруватиме у post-scan.
--
-- Додаємо partial composite index на `(user_id, deleted_at)` WHERE
-- `deleted_at IS NULL`. Він не дублює existing — це окремий B-tree, що
-- виключає soft-deleted rows із доступу. Postgres-планерник вибере
-- найвужчий для конкретного запиту.
--
-- Hard-delete cron-cleanup потім ходить по інакшому индексу — глобальний
-- B-tree на `deleted_at` (без user_id pre-filter). У 7-day window обсяг
-- soft-deleted rows низький (founder робить ~3 forget/hour-max), тож
-- seq-scan допустимий, але мінорний CREATE INDEX зробить cron-job
-- передбачуваним.

ALTER TABLE ai_memories
  ADD COLUMN deleted_at TIMESTAMPTZ;

COMMENT ON COLUMN ai_memories.deleted_at IS
  'Soft-delete timestamp. NULL = active; non-NULL = scheduled for hard-delete after 7 days. Set by /forget slash command (PR-23 / docs: forget-soft-delete.md). Read-path filters WHERE deleted_at IS NULL.';

-- Partial index for read-path: всі recall queries фільтрують deleted_at IS NULL.
-- Index covers active rows only (small footprint) і дозволяє planner-у
-- швидко відсікти deleted rows перш ніж робити HNSW lookup.
CREATE INDEX IF NOT EXISTS ai_memories_active_idx
  ON ai_memories (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

COMMENT ON INDEX ai_memories_active_idx IS
  'Hot-path pre-filter для recall/digest/RAG. WHERE deleted_at IS NULL — only active rows, soft-deleted buffer виключається до HNSW lookup. Працює разом з ai_memories_persona_topic_idx (054) і HNSW vector index (025).';

-- Cleanup-path index: hard-delete cron ходить ПО soft-deleted rows
-- (`WHERE deleted_at < NOW() - INTERVAL '7 days'`), не по active.
-- Окремий partial index на deleted_at WHERE deleted_at IS NOT NULL —
-- мінімізує scan-cost cron-job-у на високо-volume table-у.
CREATE INDEX IF NOT EXISTS ai_memories_pending_hard_delete_idx
  ON ai_memories (deleted_at)
  WHERE deleted_at IS NOT NULL;

COMMENT ON INDEX ai_memories_pending_hard_delete_idx IS
  'Cleanup cron pre-filter — індексує тільки soft-deleted rows. Hard-delete cron sweep-ить WHERE deleted_at < NOW() - INTERVAL ''7 days'' швидко без full-table scan-у.';
