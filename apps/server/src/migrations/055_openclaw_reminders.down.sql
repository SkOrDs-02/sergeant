-- Idempotent rollback for `055_openclaw_reminders.sql`.
--
-- Drop indexes першими (вони залежать від таблиці), потім таблицю. IF
-- EXISTS усюди — повторний прогін безпечний.
--
-- УВАГА: всі заплановані reminders зникнуть. Для production-rollback —
-- pg_dump перед застосуванням.

DROP INDEX IF EXISTS openclaw_reminders_persona_idx;
DROP INDEX IF EXISTS openclaw_reminders_founder_idx;
DROP INDEX IF EXISTS openclaw_reminders_due_pending_idx;

DROP TABLE IF EXISTS openclaw_reminders CASCADE;
