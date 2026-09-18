-- Down для 110_day_key_format_checks.sql.
--
-- Local-only rollback (Hard Rule #4) — прод ніколи не запускає
-- `.down.sql`. Знімає всі п'ять CHECK-констрейнтів.

ALTER TABLE push_reminder_log
  DROP CONSTRAINT IF EXISTS push_reminder_log_day_key_format_check;

ALTER TABLE routine_completion_events
  DROP CONSTRAINT IF EXISTS routine_completion_events_date_key_format_check;

ALTER TABLE fizruk_wellbeing
  DROP CONSTRAINT IF EXISTS fizruk_wellbeing_date_key_format_check;

ALTER TABLE nutrition_water_log
  DROP CONSTRAINT IF EXISTS nutrition_water_log_date_key_format_check;

ALTER TABLE routine_pushups
  DROP CONSTRAINT IF EXISTS routine_pushups_date_key_format_check;
