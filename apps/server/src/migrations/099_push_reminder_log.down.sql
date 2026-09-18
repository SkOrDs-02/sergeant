-- Down для 099_push_reminder_log.sql
--
-- Зміна адитивна, тож відкат безпечний: журнал читає й пише лише
-- reminder-sweep. Без таблиці sweep деградує у «нічого не шлю» (він
-- claim-before-send: не зміг застовпити — не шле), а не у спам.

DROP INDEX IF EXISTS push_reminder_log_day_idx;
DROP TABLE IF EXISTS push_reminder_log;
