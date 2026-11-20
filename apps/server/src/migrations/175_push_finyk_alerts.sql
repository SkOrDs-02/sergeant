-- 175: тумблер push Фініка в `user_preferences`.
--
-- Спека: docs/work/specs/finyk-limit-and-recurring-push.md, § Міграція.
-- Рішення власника 2026-11-19 (Ф-4 (б)): один тумблер, увімкнений за
-- замовчуванням. Push Фініка: 80 % і 100 % ліміту та напередодні
-- запланованого списання; рахується в денну стелю `push_daily_cap`
-- (міграція 148), у тиху годину досилається після її кінця (168).
--
-- Форма як у сусіднього тумблера `push_mono_transactions` (міграція 168):
-- BOOLEAN NOT NULL DEFAULT TRUE. Лише ADD з DEFAULT (з PG 11 це метадані,
-- без переписування таблиці), тож наявні рядки отримують дефолт без
-- бекфілу, а людина без рядка налаштувань читається дефолтом у коді.
-- Індексу немає: читання за PK `user_id`. `user_preferences` не
-- sync-таблиця, `SYNC_PROTOCOL_VERSION` не зачеплено.
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS push_finyk_alerts BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN user_preferences.push_finyk_alerts IS
  'Push Фініка: 80 % і 100 % ліміту та напередодні запланованого списання. Входить у стелю push_daily_cap. DEFAULT TRUE = рішення власника 2026-11-19 (Ф-4 (б)).';
