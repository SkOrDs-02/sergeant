-- Down для 111_user_preferences_gdpr.sql.
--
-- Local-only rollback (Hard Rule #4) — прод ніколи не запускає
-- `.down.sql`. Повертає `analytics` DEFAULT на TRUE і знімає
-- `health_data_consent`.

ALTER TABLE user_preferences
  ALTER COLUMN analytics SET DEFAULT TRUE;

COMMENT ON COLUMN user_preferences.analytics IS
  'User preference for product analytics processing.';

ALTER TABLE user_preferences
  DROP COLUMN IF EXISTS health_data_consent;
