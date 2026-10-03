-- Відкат 148: прибрати стелю нагадувань.
--
-- Перед відкатом поверни код, що не читає `push_daily_cap`, інакше sweep
-- нагадувань і `/api/me/preferences` впадуть на відсутній колонці.
ALTER TABLE user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_push_daily_cap_range;

ALTER TABLE user_preferences
  DROP COLUMN IF EXISTS push_daily_cap;
