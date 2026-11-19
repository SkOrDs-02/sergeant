-- Відкат 168: прибрати тихі години, пояс пристрою і тумблер push Monobank.
--
-- Перед відкатом поверни код, що не читає ці колонки, інакше прохід
-- нагадувань, вебхук Monobank і `/api/me/preferences` впадуть на
-- відсутніх колонках.
ALTER TABLE user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_quiet_hours_distinct,
  DROP CONSTRAINT IF EXISTS user_preferences_quiet_hours_range,
  DROP CONSTRAINT IF EXISTS user_preferences_time_zone_len;

ALTER TABLE user_preferences
  DROP COLUMN IF EXISTS push_mono_transactions,
  DROP COLUMN IF EXISTS quiet_hours_end_min,
  DROP COLUMN IF EXISTS quiet_hours_start_min,
  DROP COLUMN IF EXISTS quiet_hours_enabled,
  DROP COLUMN IF EXISTS time_zone;
