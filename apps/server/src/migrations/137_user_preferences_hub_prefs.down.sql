-- Down для 137_user_preferences_hub_prefs.sql.
--
-- Local-only rollback (Hard Rule #4) — прод ніколи не запускає `.down.sql`.
-- Колонка додана в цьому ж PR і до нього не існувала, тож знесення нічого
-- не втрачає з чужих даних.

ALTER TABLE user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_hub_prefs_object;

ALTER TABLE user_preferences
  DROP COLUMN IF EXISTS hub_prefs;
