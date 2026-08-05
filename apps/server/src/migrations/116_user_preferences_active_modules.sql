-- 116: `user_preferences.active_modules` — серверне сховище вибору
-- модулів, щоб хаб не показував дефолт на новому пристрої.
--
-- Браузерний профільний аудит 2026-08-05, знахідка B2 (частина 2). Вибір
-- модулів («Що тобі важливо?» у візарді) досі живе ЛИШЕ в локальному KV
-- (`hub_onboarding_vibes_v1` на web, MMKV на mobile) і не входить у
-- cloud-sync. Наслідок: той самий акаунт на новому пристрої підтягує всі
-- доменні дані, але не вибір модулів — і хаб рендериться з фолбеком
-- «усі чотири» людині, яка місяць тому лишила два.
--
-- Це НЕ oplog-sync сутність: вибір — крихітний LWW-масив без потреби в
-- крос-модульних запитах, тож він їде через уже наявний write-through
-- `/api/me/preferences`, а не через `sync_op_log` + нормалізовану
-- таблицю. Рівно та сама логіка, що вже обрана для `analytics` /
-- `ai_memory` / `push_notifications` у 076.
--
-- Тип `TEXT[]`, а не `JSONB`. Драйвер `pg` round-trip-ить `text[]`
-- нативно і зберігає різницю NULL vs `{}`, на якій тримається весь
-- дизайн нижче; `JSONB` повернув би `unknown`-форму (число чи об'єкт —
-- теж валідний JSONB), яку довелось би валідувати на кожному читанні,
-- і зробив би CHECK нечитабельним. Порядок теж важливий —
-- `sanitizePicks` у `packages/shared/src/lib/vibePicks.ts` свідомо
-- зберігає порядок вибору, і `TEXT[]` його не втрачає.
--
-- Nullable і БЕЗ `DEFAULT`. `DEFAULT '{}'` зробив би «сервер ще не знає
-- вибору» та «людина свідомо не обрала нічого» нерозрізненними на
-- кожному новому рядку — а це рівно та плутанина, з якої й виросла
-- знахідка B2. `NULL` означає «немає серверного вибору, не чіпай
-- локальний»; `{}` означає «вибір є, і він порожній».
--
-- Additive-only: жодного DROP, тож фази 2 (Hard Rule #4) не буде.

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS active_modules TEXT[];

-- CHECK допускає лише відомі id і забороняє NULL-елементи всередині
-- масиву. Дублікати CHECK НЕ ловить (вираз CHECK не може містити
-- підзапит) — дедуплікація гарантується `sanitizePicks` на клієнті й
-- має бути повторно застосована в Zod-схемі `/api/me/preferences`.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'user_preferences_active_modules_valid'
  ) THEN
    ALTER TABLE user_preferences
      ADD CONSTRAINT user_preferences_active_modules_valid
        CHECK (
          active_modules IS NULL
          OR (
            active_modules
              <@ ARRAY['finyk', 'fizruk', 'routine', 'nutrition']::TEXT[]
            AND array_position(active_modules, NULL::TEXT) IS NULL
            AND cardinality(active_modules) <= 4
          )
        );
  END IF;
END $$;

COMMENT ON COLUMN user_preferences.active_modules IS
  'Модулі, які користувач лишив активними на хабі. NULL = серверного вибору ще немає (клієнт лишає локальний як є); порожній масив = вибір є і він порожній. Дублікати не ловляться CHECK-ом — дедуп на рівні API.';
