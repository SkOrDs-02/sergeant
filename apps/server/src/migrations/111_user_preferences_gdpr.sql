-- 111: GDPR-схема для `user_preferences` — явна згода на health-дані
-- (Art. 9) + analytics переходить з opt-out на opt-in.
--
-- Pre-beta schema-debt аудит 2026-08-04.
--
-- 1. `health_data_consent` — нова колонка. Fizruk (тренування, вага,
--    самопочуття) і Nutrition (харчування) — категорії "health data"
--    у сенсі GDPR Art. 9 (спеціальні категорії персональних даних),
--    для яких потрібна ЯВНА, а не мовчазна згода. NOT NULL DEFAULT FALSE:
--    без explicit opt-in кожен новий рядок вважається "згоди немає".
--
-- 2. `analytics` DEFAULT TRUE → FALSE. Політика продукту обіцяє opt-in
--    аналітику; попередній DEFAULT TRUE суперечив цьому для кожного
--    нового рядка user_preferences. `ALTER COLUMN ... SET DEFAULT` міняє
--    лише DEFAULT для МАЙБУТНІХ INSERT-ів без явного значення — існуючі
--    рядки (якщо є) НЕ переписуються заднім числом (change-in-place на
--    persisted PII без явної згоди користувача сама по собі була б
--    сумнівною GDPR-практикою). Це узгоджується з pre-beta wipe-ом: прод
--    не містить користувачів, тож "існуючі рядки" тут не про кого.
--
-- Server-side hardcoded fallback попереджений у звіті Stage 2:
-- `apps/server/src/modules/me/dataRights.ts` тримає власний
-- `DEFAULT_PREFERENCES.analytics = true`, який застосовується, коли рядка
-- в `user_preferences` ще немає (перший читач до першого upsert-у). Сама
-- по собі ця міграція НЕ змінює той fallback — без відповідної правки коду
-- новий юзер, що жодного разу не викликав `/api/me/preferences`, і далі
-- бачитиме `analytics: true` з API, попри новий DB DEFAULT.

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS health_data_consent BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE user_preferences
  ALTER COLUMN analytics SET DEFAULT FALSE;

COMMENT ON COLUMN user_preferences.health_data_consent IS
  'Explicit consent for processing health-adjacent data (fizruk workouts/wellbeing, nutrition logs) per GDPR Art. 9. FALSE by default — must be an explicit opt-in, never inferred.';

COMMENT ON COLUMN user_preferences.analytics IS
  'User preference for product analytics processing. DEFAULT changed TRUE -> FALSE 2026-08-04 (migration 111): policy is opt-in, not opt-out. See dataRights.ts DEFAULT_PREFERENCES for the app-level fallback that must move in lockstep (Stage 2).';
