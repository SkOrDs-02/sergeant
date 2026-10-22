-- Down migration: sync_pk_per_user
--
-- Повертає глобальні PK на `id` у 26 sync-таблицях і одноколонкові FK
-- items -> workouts, sets -> items, тобто стан до 162.
--
-- ПОРЯДОК НЕ ДОВІЛЬНИЙ (`rollback-sanity.test.ts` проганяє кожен down.sql
-- ДВІЧІ): складені FK знімаємо ПЕРШИМИ, бо вони тримають унікальність
-- `(user_id, id)`; на всіх DROP — `IF EXISTS`, бо другий прогін заходить у
-- вже відкочену схему; FK повертаємо останніми.
--
-- ПЕРЕДУМОВА, яку не можна обійти: відкат можливий, лише поки в жодній із
-- 26 таблиць немає двох рядків з однаковим `id` у РІЗНИХ користувачів. Саме
-- такі рядки 162 і дозволяє. Тоді `ADD PRIMARY KEY (id)` впаде на
-- `duplicate key value` — це навмисно: мовчазне видалення «зайвих» рядків
-- знищило б дані користувачів заради відкоту схеми. Перевірка (на кожну
-- таблицю; приклад для двох):
--
--   SELECT id, count(*) FROM fizruk_custom_exercises GROUP BY id HAVING count(*) > 1;
--   SELECT id, count(*) FROM nutrition_pantry_events  GROUP BY id HAVING count(*) > 1;
--
-- Видалені міграцією 162 чужі діти (item/set під чужим тренуванням) не
-- повертаються: це були артефакти діри `data-01`, а не дані користувачів.

BEGIN;

-- 1. Складені FK — першими.
ALTER TABLE fizruk_workout_sets
  DROP CONSTRAINT IF EXISTS fizruk_workout_sets_workout_item_id_fkey;
ALTER TABLE fizruk_workout_items
  DROP CONSTRAINT IF EXISTS fizruk_workout_items_workout_id_fkey;

-- 2. PK -> (id).
ALTER TABLE finyk_assets
  DROP CONSTRAINT IF EXISTS finyk_assets_pkey,
  ADD CONSTRAINT finyk_assets_pkey PRIMARY KEY (id);
ALTER TABLE finyk_budgets
  DROP CONSTRAINT IF EXISTS finyk_budgets_pkey,
  ADD CONSTRAINT finyk_budgets_pkey PRIMARY KEY (id);
ALTER TABLE finyk_custom_categories
  DROP CONSTRAINT IF EXISTS finyk_custom_categories_pkey,
  ADD CONSTRAINT finyk_custom_categories_pkey PRIMARY KEY (id);
ALTER TABLE finyk_debts
  DROP CONSTRAINT IF EXISTS finyk_debts_pkey,
  ADD CONSTRAINT finyk_debts_pkey PRIMARY KEY (id);
ALTER TABLE finyk_manual_expenses
  DROP CONSTRAINT IF EXISTS finyk_manual_expenses_pkey,
  ADD CONSTRAINT finyk_manual_expenses_pkey PRIMARY KEY (id);
ALTER TABLE finyk_receivables
  DROP CONSTRAINT IF EXISTS finyk_receivables_pkey,
  ADD CONSTRAINT finyk_receivables_pkey PRIMARY KEY (id);
ALTER TABLE finyk_subscriptions
  DROP CONSTRAINT IF EXISTS finyk_subscriptions_pkey,
  ADD CONSTRAINT finyk_subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE finyk_tx_filters
  DROP CONSTRAINT IF EXISTS finyk_tx_filters_pkey,
  ADD CONSTRAINT finyk_tx_filters_pkey PRIMARY KEY (id);

ALTER TABLE fizruk_custom_activities
  DROP CONSTRAINT IF EXISTS fizruk_custom_activities_pkey,
  ADD CONSTRAINT fizruk_custom_activities_pkey PRIMARY KEY (id);
ALTER TABLE fizruk_custom_exercises
  DROP CONSTRAINT IF EXISTS fizruk_custom_exercises_pkey,
  ADD CONSTRAINT fizruk_custom_exercises_pkey PRIMARY KEY (id);
ALTER TABLE fizruk_daily_log
  DROP CONSTRAINT IF EXISTS fizruk_daily_log_pkey,
  ADD CONSTRAINT fizruk_daily_log_pkey PRIMARY KEY (id);
ALTER TABLE fizruk_injuries
  DROP CONSTRAINT IF EXISTS fizruk_injuries_pkey,
  ADD CONSTRAINT fizruk_injuries_pkey PRIMARY KEY (id);
ALTER TABLE fizruk_measurements
  DROP CONSTRAINT IF EXISTS fizruk_measurements_pkey,
  ADD CONSTRAINT fizruk_measurements_pkey PRIMARY KEY (id);
ALTER TABLE fizruk_workout_items
  DROP CONSTRAINT IF EXISTS fizruk_workout_items_pkey,
  ADD CONSTRAINT fizruk_workout_items_pkey PRIMARY KEY (id);
ALTER TABLE fizruk_workout_sets
  DROP CONSTRAINT IF EXISTS fizruk_workout_sets_pkey,
  ADD CONSTRAINT fizruk_workout_sets_pkey PRIMARY KEY (id);
ALTER TABLE fizruk_workout_templates
  DROP CONSTRAINT IF EXISTS fizruk_workout_templates_pkey,
  ADD CONSTRAINT fizruk_workout_templates_pkey PRIMARY KEY (id);
ALTER TABLE fizruk_workouts
  DROP CONSTRAINT IF EXISTS fizruk_workouts_pkey,
  ADD CONSTRAINT fizruk_workouts_pkey PRIMARY KEY (id);

ALTER TABLE nutrition_goal_periods
  DROP CONSTRAINT IF EXISTS nutrition_goal_periods_pkey,
  ADD CONSTRAINT nutrition_goal_periods_pkey PRIMARY KEY (id);
ALTER TABLE nutrition_meals
  DROP CONSTRAINT IF EXISTS nutrition_meals_pkey,
  ADD CONSTRAINT nutrition_meals_pkey PRIMARY KEY (id);
ALTER TABLE nutrition_pantry_events
  DROP CONSTRAINT IF EXISTS nutrition_pantry_events_pkey,
  ADD CONSTRAINT nutrition_pantry_events_pkey PRIMARY KEY (id);
ALTER TABLE nutrition_recipes
  DROP CONSTRAINT IF EXISTS nutrition_recipes_pkey,
  ADD CONSTRAINT nutrition_recipes_pkey PRIMARY KEY (id);

ALTER TABLE routine_categories
  DROP CONSTRAINT IF EXISTS routine_categories_pkey,
  ADD CONSTRAINT routine_categories_pkey PRIMARY KEY (id);
ALTER TABLE routine_completion_events
  DROP CONSTRAINT IF EXISTS routine_completion_events_pkey,
  ADD CONSTRAINT routine_completion_events_pkey PRIMARY KEY (id);
ALTER TABLE routine_entries
  DROP CONSTRAINT IF EXISTS routine_entries_pkey,
  ADD CONSTRAINT routine_entries_pkey PRIMARY KEY (id);
ALTER TABLE routine_habits
  DROP CONSTRAINT IF EXISTS routine_habits_pkey,
  ADD CONSTRAINT routine_habits_pkey PRIMARY KEY (id);
ALTER TABLE routine_tags
  DROP CONSTRAINT IF EXISTS routine_tags_pkey,
  ADD CONSTRAINT routine_tags_pkey PRIMARY KEY (id);

-- 3. Одноколонкові FK — останніми, коли унікальність `(id)` уже є.
ALTER TABLE fizruk_workout_items
  ADD CONSTRAINT fizruk_workout_items_workout_id_fkey
  FOREIGN KEY (workout_id) REFERENCES fizruk_workouts (id) ON DELETE CASCADE;
ALTER TABLE fizruk_workout_sets
  ADD CONSTRAINT fizruk_workout_sets_workout_item_id_fkey
  FOREIGN KEY (workout_item_id) REFERENCES fizruk_workout_items (id) ON DELETE CASCADE;

COMMIT;
