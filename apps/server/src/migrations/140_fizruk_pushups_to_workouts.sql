-- 140: історія лічильника віджимань → звичайні тренування, і DROP
-- `fizruk_pushups` (фаза 2 з 2, рішення власника 2026-09-15).
--
-- ЩО СТАЛОСЬ У ФАЗІ 1 (той самий день). Картку «Легка активність» на
-- Прогресі знято; віджимання пишуться «Швидким записом» як звичайний
-- `Workout` (`buildQuickLogWorkout`). У `fizruk_pushups` клієнт більше не
-- пише, читав її лише клієнтський перенос історії в журнал
-- (`pushupsToWorkouts.ts`), який біг на буті КОЖНОГО пристрою окремо.
--
-- ЧОМУ КОНВЕРСІЯ ТУТ, А НЕ ЛИШЕ НА КЛІЄНТІ. Пристрій, що не бутнувся між
-- фазами, історії не переніс би — а після DROP не мав би звідки. Тож той
-- самий перенос повторено в SQL на обох сховищах: ця міграція на сервері,
-- `007_fizruk_pushups_to_workouts` у клієнтському SQLite. Форма запису
-- дослівно та, що в `buildQuickLogWorkout`: один item «Віджимання від
-- підлоги» (`pushup`, chest, мʼязи з каталогу), один підхід без ваги на
-- `reps` повторень, тривалість `clamp(reps*2, 30 с, 10 хв)`, нотатка про
-- перенос. Id детерміновані на ОБОХ сторонах, тож сервер і клієнт зійдуться
-- на одному рядку, а не на двох:
--
--   workout  pushups:<user_id>:<date_key>
--   item     …_i1
--   set      …_i1:s0        (схема id сетів адаптера: `<item>:s<n>`)
--
-- Клієнтський перенос фази 1 давав id БЕЗ user_id (`pushups:<date_key>`) —
-- для однокористувацької бети це працювало, але в спільній серверній
-- таблиці два користувачі з віджиманнями одного дня зіткнулись би на PK.
-- Тому predicate «уже перенесено» дивиться на ОБІ форми id, а нові рядки
-- беруть user-scoped форму.
--
-- Мить запису — полудень дня за UTC. Лічильник знав лише день-ключ
-- (device-local, ADR-0078); UTC-полудень лишається в тому ж календарному
-- дні для будь-якого зсуву від -11 до +11 годин і — головне — дає ту саму
-- мить на сервері і на клієнті, де про часовий пояс пристрою SQL не знає.
--
-- Порядок вставок у CTE не має значення: усі гілки бачать один знімок
-- `src`, а FK перевіряються в кінці statement-у.
--
-- ALLOW_DROP: рішення власника 2026-09-15 закрити перенос одним днем; 14-денного вікна між фазами немає, але дані НЕ втрачаються — цей самий statement конвертує кожен рядок у fizruk_workouts, а op-и старих клієнтів у цю таблицю після DROP чесно відхиляються як unsupported_table замість тихого дропу

WITH src AS (
  SELECT
    p.user_id,
    p.date_key,
    p.reps,
    p.updated_at,
    'pushups:' || p.user_id || ':' || p.date_key           AS workout_id,
    'pushups:' || p.user_id || ':' || p.date_key || '_i1'  AS item_id,
    (p.date_key || 'T12:00:00Z')::timestamptz              AS ended_at,
    LEAST(600, GREATEST(30, p.reps * 2))                   AS duration_sec
  FROM fizruk_pushups p
  WHERE p.reps > 0
    -- AI-DANGER: обидва фільтри нижче — захист деплою, не оптимізація.
    --
    -- Джерело (fizruk_pushups, міграція 131) створене БЕЗ FK на "user" —
    -- на відміну і від попередниці (routine_pushups, 050), і від цілі
    -- (fizruk_workouts, 029). Тому DELETE FROM "user" каскадом це джерело
    -- НЕ чистить, і рядок-сирота там переживає власника. Ціль FK має, отже
    -- сирота б'ється об fizruk_workout_sets_user_id_fkey, весь statement
    -- відкочується, migrate.mjs виходить кодом 1, Coolify зупиняє деплой.
    -- Ретрай дає той самий результат: міграція детермінована, сирота
    -- нікуди не дівається — деплой заклинює намертво, поки хтось не зайде
    -- у Postgres руками. Відтворено на чистій базі (схема на 139 + один
    -- осиротілий рядок + прогін цього файлу): SQLSTATE 23503.
    --
    -- Саму дірку з FK закриває міграція 141, але вона виконується ПІСЛЯ
    -- цієї — тож без фільтра тут черга до неї просто не дійде.
    AND EXISTS (SELECT 1 FROM "user" u WHERE u.id = p.user_id)
    -- Та сама ціна, інший тип помилки. date_key тут без CHECK формату:
    -- міграція 110 накрила сусідні day-key таблиці, але 131 створила цю
    -- ПІСЛЯ неї. Кривий ключ у (p.date_key || 'T12:00:00Z') дає 22007 і
    -- той самий незворотний затик деплою.
    AND p.date_key ~ '^\d{4}-\d{2}-\d{2}$'
    AND NOT EXISTS (
      SELECT 1
        FROM fizruk_workouts w
       WHERE w.user_id = p.user_id
         AND w.id IN (
           'pushups:' || p.date_key,
           'pushups:' || p.user_id || ':' || p.date_key
         )
    )
),
ins_workouts AS (
  INSERT INTO fizruk_workouts
    (id, user_id, started_at, ended_at, note, groups_json,
     warmup_json, cooldown_json, wellbeing_json, kcal_burned,
     created_at, updated_at, deleted_at)
  SELECT
    workout_id,
    user_id,
    ended_at - make_interval(secs => duration_sec),
    ended_at,
    'Перенесено з лічильника відтискань',
    '[]'::jsonb,
    NULL, NULL, NULL, NULL,
    updated_at, updated_at, NULL
  FROM src
  ON CONFLICT (id) DO NOTHING
  RETURNING id
),
ins_items AS (
  INSERT INTO fizruk_workout_items
    (id, workout_id, user_id, exercise_id, name_uk, primary_group,
     muscles_primary, muscles_secondary, type, duration_sec, distance_m,
     chosen_variant, sort_order, created_at, updated_at, deleted_at)
  SELECT
    item_id,
    workout_id,
    user_id,
    'pushup',
    'Віджимання від підлоги',
    'chest',
    '["pectoralis_major","triceps"]'::jsonb,
    '["serratus_anterior","front_deltoid"]'::jsonb,
    'strength',
    NULL, NULL, NULL,
    0,
    updated_at, updated_at, NULL
  FROM src
  ON CONFLICT (id) DO NOTHING
  RETURNING id
)
INSERT INTO fizruk_workout_sets
  (id, workout_item_id, user_id, weight_kg, reps, rpe, sort_order,
   created_at, updated_at, deleted_at)
SELECT
  item_id || ':s0',
  item_id,
  user_id,
  0,
  reps,
  NULL,
  0,
  updated_at, updated_at, NULL
FROM src
ON CONFLICT (id) DO NOTHING;

DROP TABLE IF EXISTS fizruk_pushups;
