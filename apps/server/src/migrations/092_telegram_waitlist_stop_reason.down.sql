-- Down migration: telegram_waitlist stop-reason columns
--
-- Ідемпотентний rollback для `092_telegram_waitlist_stop_reason.sql`.
-- DROP COLUMN тут безпечний саме тому, що обидві колонки зʼявились у 092 і
-- ніщо поза ботом вейтліста їх не читає.
--
-- ⚠️ Тексти причин втрачаються безповоротно.
--
-- Production НІКОЛИ не запускає `.down.sql` — local-rollback only
-- (див. `db.ts` -> runPendingSqlMigrations).

ALTER TABLE telegram_waitlist
  DROP COLUMN IF EXISTS stop_reason,
  DROP COLUMN IF EXISTS stop_reason_awaited_at;
