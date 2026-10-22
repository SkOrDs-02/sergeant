-- 162_sync_pk_per_user.sql
--
-- Status: Active
--
-- Аудит 2026-10-01, `data-01` (крок 2): 26 per-user sync-таблиць мають
-- ГЛОБАЛЬНИЙ `PRIMARY KEY (id)`, а клієнт будує передбачувані id
-- (`custom_<slug>`, `pe::initial::home::<продукт>`, `rcp_ai_<хеш>`,
-- `gp::…`, `Date.now()`). Перший користувач, чий рядок доїхав до сервера,
-- займає id назавжди; apply-шлях усіх наступних бачить чужий рядок і віддає
-- термінальний `fk_violation` (клієнт позначає операцію `rejected`, дані
-- лишаються тільки на пристрої). Той самий механізм, що вбив комору
-- (SERGEANT-WEB-T, міграція 129), тільки для решти таблиць.
--
-- Лікуємо на боці схеми, за зразком 129: `id` семантично унікальний У МЕЖАХ
-- КОРИСТУВАЧА, тож PK стає складеним `(user_id, id)`. Серверний apply-шар
-- (`apps/server/src/modules/sync`) звужує всі SELECT і `ON CONFLICT` по
-- `user_id` у тому ж PR, тож чужий рядок із тим самим id більше не блокує
-- вставку і не перезаписується.
--
-- Таблиці (26):
--   finyk_assets, finyk_budgets, finyk_custom_categories, finyk_debts,
--   finyk_manual_expenses, finyk_receivables, finyk_subscriptions,
--   finyk_tx_filters;
--   fizruk_custom_activities, fizruk_custom_exercises, fizruk_daily_log,
--   fizruk_injuries, fizruk_measurements, fizruk_workout_items,
--   fizruk_workout_sets, fizruk_workout_templates, fizruk_workouts;
--   nutrition_goal_periods, nutrition_meals, nutrition_pantry_events,
--   nutrition_recipes;
--   routine_categories, routine_completion_events, routine_entries,
--   routine_habits, routine_tags.
-- `nutrition_pantries` і `nutrition_pantry_items` уже на `(user_id, id)` (129);
-- таблиці з природним ключем (`transaction_id`, `date_key`, …) не зачеплено.
--
-- FK. У всій схемі лише два одноколонкові FK ведуть на ці таблиці:
-- `fizruk_workout_items.workout_id -> fizruk_workouts(id)` і
-- `fizruk_workout_sets.workout_item_id -> fizruk_workout_items(id)` (обидва
-- ON DELETE CASCADE). Вони не переживуть зміну PK (потрібна унікальність саме
-- на `(id)`), і лишати їх глобальними означало б лишити дірку «дитина під
-- чужим батьком» (#1345 закрив її лише в apply-шарі). Тому їх перероблено на
-- складені `(user_id, <parent>_id) -> parent(user_id, id)` з тим самим
-- каскадом. На відміну від 129 (`nutrition_pantry_items`), цей FK ЗБЕРЕЖЕНО:
-- у fizruk він існував і працював, а apply-шар (`applyFizrukItems/Sets`)
-- уже відхиляє дитину без власного батька через `guardParentOwned`, тож
-- порядок рядків усередині push-а ніяк не змінюється.
--
-- Двофазність (Hard Rule #4) не потрібна: тут немає `DROP COLUMN` /
-- `DROP TABLE`, лише перевизначення constraint-ів. Новий PK СЛАБШИЙ за той,
-- що знімаємо (унікальність пари слабша за унікальність `id`), тож наявні
-- рядки задовольняють його за побудовою — ні backfill, ні переливання не
-- потрібні. `user_id` у всіх 26 таблицях уже NOT NULL.
--
-- Сумісність зі старим кодом на час викочування (міграція їде в ENTRYPOINT
-- нового образу, старий контейнер ще коротко обслуговує трафік): старі
-- `ON CONFLICT (id)` (`routine_completion_events`, `nutrition_pantry_events`,
-- `nutrition_goal_periods`, `finyk/import/commit`) після цієї міграції дадуть
-- 42P10 (немає унікальності на `(id)`) і стануть `apply_failed`/500, доки
-- не підніметься новий образ. Власник підтвердив 2026-10-22: живих
-- користувачів нема, вікно обслуговування не потрібне.
--
-- Легасі-дані. Перед створенням складених FK прибираємо рядки, які сама діра
-- `data-01` і могла породити: item/set, чий `user_id` відрізняється від
-- `user_id` батька (власний рядок користувача B, прив'язаний до чужого
-- тренування A). Під новим інваріантом такий рядок неможливий, а залишений він
-- провалив би `ADD FOREIGN KEY` і зупинив деплой. Нормальні дані цим не
-- зачіпаються: обидва DELETE у чистій БД не видаляють нічого.

BEGIN;

-- 0. Чужі діти: спершу items (їхні sets зникнуть каскадом через ще чинний FK),
--    потім sets, що лишились із чужим батьком-item.
DELETE FROM fizruk_workout_items AS i
  USING fizruk_workouts AS w
 WHERE i.workout_id = w.id
   AND i.user_id <> w.user_id;

DELETE FROM fizruk_workout_sets AS s
  USING fizruk_workout_items AS i
 WHERE s.workout_item_id = i.id
   AND s.user_id <> i.user_id;

-- 1. Старі одноколонкові FK — першими: вони тримають унікальність `(id)`.
ALTER TABLE fizruk_workout_sets
  DROP CONSTRAINT fizruk_workout_sets_workout_item_id_fkey;
ALTER TABLE fizruk_workout_items
  DROP CONSTRAINT fizruk_workout_items_workout_id_fkey;

-- 2. PK -> (user_id, id). Один ALTER на таблицю: DROP + ADD атомарні.
ALTER TABLE finyk_assets
  DROP CONSTRAINT finyk_assets_pkey,
  ADD CONSTRAINT finyk_assets_pkey PRIMARY KEY (user_id, id);
ALTER TABLE finyk_budgets
  DROP CONSTRAINT finyk_budgets_pkey,
  ADD CONSTRAINT finyk_budgets_pkey PRIMARY KEY (user_id, id);
ALTER TABLE finyk_custom_categories
  DROP CONSTRAINT finyk_custom_categories_pkey,
  ADD CONSTRAINT finyk_custom_categories_pkey PRIMARY KEY (user_id, id);
ALTER TABLE finyk_debts
  DROP CONSTRAINT finyk_debts_pkey,
  ADD CONSTRAINT finyk_debts_pkey PRIMARY KEY (user_id, id);
ALTER TABLE finyk_manual_expenses
  DROP CONSTRAINT finyk_manual_expenses_pkey,
  ADD CONSTRAINT finyk_manual_expenses_pkey PRIMARY KEY (user_id, id);
ALTER TABLE finyk_receivables
  DROP CONSTRAINT finyk_receivables_pkey,
  ADD CONSTRAINT finyk_receivables_pkey PRIMARY KEY (user_id, id);
ALTER TABLE finyk_subscriptions
  DROP CONSTRAINT finyk_subscriptions_pkey,
  ADD CONSTRAINT finyk_subscriptions_pkey PRIMARY KEY (user_id, id);
ALTER TABLE finyk_tx_filters
  DROP CONSTRAINT finyk_tx_filters_pkey,
  ADD CONSTRAINT finyk_tx_filters_pkey PRIMARY KEY (user_id, id);

ALTER TABLE fizruk_custom_activities
  DROP CONSTRAINT fizruk_custom_activities_pkey,
  ADD CONSTRAINT fizruk_custom_activities_pkey PRIMARY KEY (user_id, id);
ALTER TABLE fizruk_custom_exercises
  DROP CONSTRAINT fizruk_custom_exercises_pkey,
  ADD CONSTRAINT fizruk_custom_exercises_pkey PRIMARY KEY (user_id, id);
ALTER TABLE fizruk_daily_log
  DROP CONSTRAINT fizruk_daily_log_pkey,
  ADD CONSTRAINT fizruk_daily_log_pkey PRIMARY KEY (user_id, id);
ALTER TABLE fizruk_injuries
  DROP CONSTRAINT fizruk_injuries_pkey,
  ADD CONSTRAINT fizruk_injuries_pkey PRIMARY KEY (user_id, id);
ALTER TABLE fizruk_measurements
  DROP CONSTRAINT fizruk_measurements_pkey,
  ADD CONSTRAINT fizruk_measurements_pkey PRIMARY KEY (user_id, id);
ALTER TABLE fizruk_workout_items
  DROP CONSTRAINT fizruk_workout_items_pkey,
  ADD CONSTRAINT fizruk_workout_items_pkey PRIMARY KEY (user_id, id);
ALTER TABLE fizruk_workout_sets
  DROP CONSTRAINT fizruk_workout_sets_pkey,
  ADD CONSTRAINT fizruk_workout_sets_pkey PRIMARY KEY (user_id, id);
ALTER TABLE fizruk_workout_templates
  DROP CONSTRAINT fizruk_workout_templates_pkey,
  ADD CONSTRAINT fizruk_workout_templates_pkey PRIMARY KEY (user_id, id);
ALTER TABLE fizruk_workouts
  DROP CONSTRAINT fizruk_workouts_pkey,
  ADD CONSTRAINT fizruk_workouts_pkey PRIMARY KEY (user_id, id);

ALTER TABLE nutrition_goal_periods
  DROP CONSTRAINT nutrition_goal_periods_pkey,
  ADD CONSTRAINT nutrition_goal_periods_pkey PRIMARY KEY (user_id, id);
ALTER TABLE nutrition_meals
  DROP CONSTRAINT nutrition_meals_pkey,
  ADD CONSTRAINT nutrition_meals_pkey PRIMARY KEY (user_id, id);
ALTER TABLE nutrition_pantry_events
  DROP CONSTRAINT nutrition_pantry_events_pkey,
  ADD CONSTRAINT nutrition_pantry_events_pkey PRIMARY KEY (user_id, id);
ALTER TABLE nutrition_recipes
  DROP CONSTRAINT nutrition_recipes_pkey,
  ADD CONSTRAINT nutrition_recipes_pkey PRIMARY KEY (user_id, id);

ALTER TABLE routine_categories
  DROP CONSTRAINT routine_categories_pkey,
  ADD CONSTRAINT routine_categories_pkey PRIMARY KEY (user_id, id);
ALTER TABLE routine_completion_events
  DROP CONSTRAINT routine_completion_events_pkey,
  ADD CONSTRAINT routine_completion_events_pkey PRIMARY KEY (user_id, id);
ALTER TABLE routine_entries
  DROP CONSTRAINT routine_entries_pkey,
  ADD CONSTRAINT routine_entries_pkey PRIMARY KEY (user_id, id);
ALTER TABLE routine_habits
  DROP CONSTRAINT routine_habits_pkey,
  ADD CONSTRAINT routine_habits_pkey PRIMARY KEY (user_id, id);
ALTER TABLE routine_tags
  DROP CONSTRAINT routine_tags_pkey,
  ADD CONSTRAINT routine_tags_pkey PRIMARY KEY (user_id, id);

-- 3. Складені FK items -> workouts і sets -> items з тим самим каскадом.
--    Дочірні індекси по `workout_id` / `workout_item_id` уже є (029), а
--    пошук каскаду йде ще й по `user_id`, тож додаткові індекси не потрібні.
ALTER TABLE fizruk_workout_items
  ADD CONSTRAINT fizruk_workout_items_workout_id_fkey
  FOREIGN KEY (user_id, workout_id)
  REFERENCES fizruk_workouts (user_id, id) ON DELETE CASCADE;
ALTER TABLE fizruk_workout_sets
  ADD CONSTRAINT fizruk_workout_sets_workout_item_id_fkey
  FOREIGN KEY (user_id, workout_item_id)
  REFERENCES fizruk_workout_items (user_id, id) ON DELETE CASCADE;

COMMIT;
