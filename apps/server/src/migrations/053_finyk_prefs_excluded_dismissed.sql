-- Stage 13 / PR #075 — extend `finyk_prefs` із двома cross-device масивами:
-- `excluded_stat_tx_ids` (id-шники транзакцій, виключені зі статистики)
-- та `dismissed_recurring` (recurring-banner-и, закриті користувачем).
--
-- До цього обидва ключі (`finyk_excluded_stat_txs`, `finyk_rec_dismissed`)
-- жили лише у localStorage без dual-write. Перетягуємо їх у SQLite-overlay
-- через ту саму singleton-таблицю, що несе `monthly_plan_json` /
-- `show_balance` — same LWW lane, no extra apply path.
--
-- Аплі-функція `applyFinykPrefs` (`apps/server/src/modules/sync/syncV2.ts`)
-- тепер ковбасить нові колонки разом із рештою prefs-полів. Параметр
-- роутиться через op-log як частина `finyk_prefs` upsert-у.
--
-- Міграція адитивна: нові колонки `JSONB NOT NULL DEFAULT '[]'::jsonb`,
-- тож існуючі рядки одразу отримують порожній масив без backfill-у.
-- Жодних DROP / RENAME — `04-sql-migrations-sequential-two-phase.md` не
-- застосовується.
--
-- Mirror у клієнтській SQLite-схемі: `003_finyk_prefs_excluded_dismissed.sql`
-- у `packages/db-schema/src/sqlite/migrations/index.ts` (`FINYK_003_SQL`).

ALTER TABLE finyk_prefs
  ADD COLUMN IF NOT EXISTS excluded_stat_tx_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE finyk_prefs
  ADD COLUMN IF NOT EXISTS dismissed_recurring JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN finyk_prefs.excluded_stat_tx_ids IS
  'Mono transaction ids hidden from statistics (cross-device sticky filter). Array of strings.';
COMMENT ON COLUMN finyk_prefs.dismissed_recurring IS
  'Recurring-payment banner ids the user dismissed (cross-device). Array of strings.';
