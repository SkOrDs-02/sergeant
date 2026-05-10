-- Rollback for migration 053_finyk_prefs_excluded_dismissed.sql
-- (Stage 13 / PR #075 у `docs/planning/storage-roadmap.md`).
--
-- Local-only rollback — production ніколи не запускає `down.sql`
-- (rule #4 в AGENTS.md). Кожен `DROP COLUMN` обгорнутий у `IF EXISTS`,
-- тож файл лишається ідемпотентним для `rollback-sanity` round-trip.

ALTER TABLE finyk_prefs DROP COLUMN IF EXISTS dismissed_recurring;
ALTER TABLE finyk_prefs DROP COLUMN IF EXISTS excluded_stat_tx_ids;
