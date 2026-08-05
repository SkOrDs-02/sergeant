-- Down для 116_user_preferences_active_modules.sql.
--
-- Local-only rollback (Hard Rule #4) — прод ніколи не запускає
-- `.down.sql`. Колонка додана в цьому ж PR і поза ним не читається,
-- тож DROP безпечний разом із відкатом коду `/api/me/preferences`.

ALTER TABLE user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_active_modules_valid;

ALTER TABLE user_preferences
  DROP COLUMN IF EXISTS active_modules;
