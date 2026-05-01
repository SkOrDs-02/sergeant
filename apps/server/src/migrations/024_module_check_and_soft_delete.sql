-- 024: CHECK constraint на `module_data.module` + soft-delete колонки на
-- high-volume таблицях (`mono_transaction`, `push_subscriptions`,
-- `ai_usage_daily`, `sync_audit_log`).
--
-- Stage 1 / PR #012 з `docs/planning/storage-roadmap.md`.
--
-- ─── 1. CHECK constraint на `module_data.module` ─────────────────────────
--
-- До цього `module` був голим `TEXT`, тому будь-який string потрапляв у
-- таблицю (typo `'finky'` замість `'finyk'`, legacy назви, експерименти).
-- На pull-стороні `apps/server/src/modules/sync/sync.ts` фільтрує по
-- `VALID_MODULES = {'finyk','fizruk','routine','nutrition','profile'}`,
-- тож такі рядки клієнт ніколи не побачив би — вони мовчки накопичувалися
-- у БД. CHECK constraint піднімає валідацію на DB-рівень: defense-in-depth.
--
-- Source-of-truth для списку модулів:
--   * `apps/server/src/modules/sync/sync.ts:VALID_MODULES` — Set, який
--     використовується у `syncPullAll` / `syncPushAll` для filter-а.
--   * `packages/shared/src/schemas/api.ts:SyncModuleEnum` — zod-enum,
--     валідація HTTP-payload-а (400 з details, якщо клієнт шле невідомий
--     модуль).
--   * `apps/web/src/core/cloudSync/config.ts:SYNC_MODULES` — keys → 5.
--   * `apps/mobile/src/sync/config.ts:SYNC_MODULES` — keys → 4 (без
--     `profile`); це навмисно, не bug, mobile поки не синхронізує
--     профіль (див. comment у тому файлі).
--
-- 'coach' включений у CHECK, бо `apps/server/src/modules/chat/coach.ts`
-- зберігає coach-memory у тій же таблиці з `module = 'coach'` (це окремий
-- write-path, що не їде через sync, але ділить storage). Без 'coach' у
-- CHECK constraint coach-memory upsert провалився б з 23514.
--
-- Pre-cleanup `DELETE FROM module_data WHERE module NOT IN (...)`:
-- запобіжник на випадок legacy-typo-рядків ('finky', 'rutine', тощо),
-- які могли пролізти раніше. Безпечно, бо такі рядки клієнт все одно
-- ніколи не отримує (фільтр VALID_MODULES виключає їх з pull-all). Якщо
-- такого сміття у БД нема — DELETE просто не зачепить нічого.

DELETE FROM module_data
 WHERE module NOT IN ('finyk', 'fizruk', 'routine', 'nutrition', 'profile', 'coach');

ALTER TABLE module_data
  ADD CONSTRAINT module_data_module_check
  CHECK (module IN ('finyk', 'fizruk', 'routine', 'nutrition', 'profile', 'coach'));

COMMENT ON CONSTRAINT module_data_module_check ON module_data IS
  'Allowed `module` values. SSOT — VALID_MODULES у sync.ts + ''coach'' (coach.ts).';

-- ─── 2. Soft-delete колонки ──────────────────────────────────────────────
--
-- Hard DELETE на high-volume таблицях ламає аудит/recovery: коли support
-- розбирає incident "у юзера зник запис X від N днів тому", без soft-delete
-- ми бачимо лише "ряду нема", без причини й часу. `deleted_at TIMESTAMPTZ`
-- (NULL за замовчуванням) дозволяє відкласти physical purge на cron-job
-- з retention-window (напр. 90 днів) і дає аналітиці окремий стан "було,
-- але видалено такого-то числа".
--
-- IF NOT EXISTS навмисно: `push_subscriptions.deleted_at` уже додано у
-- міграції 005 (`backend_hardening`), `push_devices.deleted_at` — у 006.
-- Решта поки без soft-delete і вмикається тут.
ALTER TABLE mono_transaction
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE ai_usage_daily
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE sync_audit_log
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

COMMENT ON COLUMN mono_transaction.deleted_at IS
  'Soft-delete timestamp. NULL = active row. App readers MUST filter `WHERE deleted_at IS NULL`.';
COMMENT ON COLUMN push_subscriptions.deleted_at IS
  'Soft-delete timestamp. NULL = active subscription. Set on unsubscribe / 410 cleanup.';
COMMENT ON COLUMN ai_usage_daily.deleted_at IS
  'Soft-delete timestamp. NULL = active counter. Used by admin tools / per-user purge audit.';
COMMENT ON COLUMN sync_audit_log.deleted_at IS
  'Soft-delete timestamp. NULL = active audit row. Set by retention purge job.';

-- ─── 3. Partial index для активних рядків `mono_transaction` ─────────────
--
-- Найгарячіший read-path — список транзакцій юзера з пагінацією за часом
-- (`apps/server/src/modules/mono/read.ts:transactionsHandler`). Після
-- додавання soft-delete-фільтра планнер міг би скочуватись на існуючий
-- `mono_tx_user_time_idx` + Filter на deleted_at, але partial-index лишає
-- soft-deleted-рядки поза індексом одразу — і не рознесе heap-сторінки
-- між активним хвостом і "архівом".
--
-- EXPLAIN ANALYZE (типовий план після цієї міграції):
--   Index Scan using mono_transaction_active_idx on mono_transaction
--     Index Cond: (user_id = $1)
--     Order: time DESC
--     (filter deleted_at IS NULL вже зашитий у partial index, тому
--      Rows Removed by Filter = 0)
CREATE INDEX IF NOT EXISTS mono_transaction_active_idx
  ON mono_transaction (user_id, time DESC)
  WHERE deleted_at IS NULL;
