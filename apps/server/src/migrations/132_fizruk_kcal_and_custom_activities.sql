-- 132: kcal_burned + fizruk_custom_activities.
--
-- WHY (kcal_burned). Короткий запис заняття («силове, 45 хвилин») рахує
-- витрати за формулою MET x вага x час і зберігає РЕЗУЛЬТАТ, а не формулу:
-- якщо людина потім змінить вагу, старі записи не мають переписуватись заднім
-- числом. Похідне число, вхід якого змінюється в часі, - це дані, і жити воно
-- мусить у рядку сесії. Без колонки число не переживало б перезавантаження, і
-- оцінка мовчки поповзла б за вагою.
--
-- ФОРМА. Ціле число ккал, nullable: запис без ваги в профілі зберігається без
-- оцінки, і це не помилка, а «оцінювати нічим». Нуль означав би «спалено
-- нічого», що неправда.
--
-- WHY (fizruk_custom_activities). Вбудований каталог занять фіксований, але
-- закритий список завжди комусь замалий: людина, яка не знайшла свого заняття,
-- або кидає запис, або пише його в «Інше» і втрачає різницю у витратах. Свої
-- заняття - той самий патерн, що й свої вправи (fizruk_custom_exercises):
-- один рядок на запис, увесь вміст у data_json, бо форма запису належить
-- домену, а не схемі.
--
-- ДВОФАЗНІСТЬ (Hard Rule #4). Обидві зміни additive: колонка nullable без
-- DEFAULT і без NOT NULL, таблиця нова. Нічого не дропається, старі клієнти
-- працюють як раніше.

ALTER TABLE fizruk_workouts
  ADD COLUMN IF NOT EXISTS kcal_burned INTEGER;

CREATE TABLE IF NOT EXISTS fizruk_custom_activities (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id     TEXT NOT NULL,
  data_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS fizruk_custom_activities_user_idx
  ON fizruk_custom_activities (user_id)
  WHERE deleted_at IS NULL;
