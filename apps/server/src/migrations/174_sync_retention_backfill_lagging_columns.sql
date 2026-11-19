-- 174: дотягнути з журналу поля, які старий контейнер не записав у таблиці
-- у вікні деплою міграцій 170 і 171. Передумова чистки журналу (ADR-0105 §2,
-- `SYNC_OP_LOG_APPLIED_RETENTION_DAYS`).
--
-- Навіщо. Фронт їде раніше за бекенд: у вікні деплою новий клієнт уже слав
-- `routine_habits.count_target` / `count_unit` / `auto_mark_source` (170) і
-- `fizruk_workouts.program_id` / `program_slot` (171), а старий сервер ці
-- ключі ігнорував і писав рядок без них. Повний рядок лежить у
-- `sync_op_log.row` applied-опа, тож пристрої, що читають журнал, значення
-- мають, а серверна таблиця — ні, доки рядок не змінять ще раз (журнал
-- рішень `sergeant-module-sync`, 2026-11-18). Після чистки журналу нова чи
-- скинута копія відновлюється зі знімка таблиць (`GET /api/v2/sync/snapshot`),
-- і без цього бекфілу звичка-лічильник прийшла б звичайною «так/ні», а
-- тренування — без програми. 172 такий бекфіл для полів підходу вже зробила;
-- це решта.
--
-- Правила ті самі, що в 172:
--   * лише `status = 'applied'` і `op IN ('insert', 'update')`;
--   * по КОЖНОМУ ключу окремо береться останній applied-оп рядка, у якому
--     цей ключ є (`client_ts DESC, id DESC`): це значення дав би реплей
--     журналу новим хендлером із прапорцем присутності ключа; ключ із `null`
--     = свідоме очищення, тоді й тут нічого не пишемо;
--   * значення проходять межі хендлера: `count_target` ціле ≥ 1,
--     `count_unit` рядок до 200 символів (`NAME_MAX_LEN`),
--     `auto_mark_source` лише з `AUTO_MARK_SOURCES`
--     (`modules/sync/routine/habitCounterFields.ts`); `program_id` непорожній
--     рядок разом із цілим `program_slot` ≥ 0 (`parseProgramRef`,
--     `modules/sync/fizruk/applySync.ts`). Невалідне пропускається;
--   * пишемо лише в колонку, що ще NULL, і лише рядки, де є що писати:
--     повторний прогін оновлює 0 рядків. `updated_at` не чіпаємо, щоб не
--     зрушити LWW: значення ті самі, що вже має кожен пристрій із журналу.
--
-- Каст у число лише всередині вкладеного CASE після перевірки
-- `jsonb_typeof`: порядок обчислення AND Postgres не гарантує, CASE — так.
--
-- Лише DML, схема не змінюється (Hard Rule #4: двофазність не потрібна).
-- Скан журналу (seq scan за `table_name`) тримає ACCESS SHARE і не заважає
-- INSERT-ам старого контейнера; UPDATE бере блокування лише зачеплених рядків.

WITH ops AS (
  SELECT l.user_id, l.row ->> 'id' AS id, l.row AS r, l.client_ts, l.id AS op_id
    FROM sync_op_log l
   WHERE l.table_name = 'routine_habits'
     AND l.status = 'applied'
     AND l.op IN ('insert', 'update')
     AND jsonb_typeof(l.row -> 'id') = 'string'
     AND (l.row ? 'count_target' OR l.row ? 'count_unit'
          OR l.row ? 'auto_mark_source')
),
last_target AS (
  SELECT DISTINCT ON (user_id, id) user_id, id, r -> 'count_target' AS v
    FROM ops
   WHERE r ? 'count_target'
   ORDER BY user_id, id, client_ts DESC, op_id DESC
),
last_unit AS (
  SELECT DISTINCT ON (user_id, id) user_id, id, r -> 'count_unit' AS v
    FROM ops
   WHERE r ? 'count_unit'
   ORDER BY user_id, id, client_ts DESC, op_id DESC
),
last_source AS (
  SELECT DISTINCT ON (user_id, id) user_id, id, r -> 'auto_mark_source' AS v
    FROM ops
   WHERE r ? 'auto_mark_source'
   ORDER BY user_id, id, client_ts DESC, op_id DESC
),
habit_keys AS (
  SELECT user_id, id FROM last_target
  UNION
  SELECT user_id, id FROM last_unit
  UNION
  SELECT user_id, id FROM last_source
),
habit_backfill AS (
  SELECT k.user_id, k.id,
         CASE WHEN jsonb_typeof(t.v) = 'number' THEN
           CASE WHEN (t.v #>> '{}')::numeric BETWEEN 1 AND 2147483647
                 AND (t.v #>> '{}')::numeric = trunc((t.v #>> '{}')::numeric)
                THEN (t.v #>> '{}')::numeric::integer END
         END AS count_target,
         CASE WHEN jsonb_typeof(u.v) = 'string'
               AND char_length(u.v #>> '{}') <= 200
              THEN u.v #>> '{}' END AS count_unit,
         CASE WHEN jsonb_typeof(s.v) = 'string'
               AND (s.v #>> '{}') IN ('fizruk_workout', 'nutrition_water_goal',
                                      'finyk_expense')
              THEN s.v #>> '{}' END AS auto_mark_source
    FROM habit_keys k
    LEFT JOIN last_target t ON t.user_id = k.user_id AND t.id = k.id
    LEFT JOIN last_unit u ON u.user_id = k.user_id AND u.id = k.id
    LEFT JOIN last_source s ON s.user_id = k.user_id AND s.id = k.id
)
UPDATE routine_habits h
   SET count_target     = COALESCE(h.count_target, b.count_target),
       count_unit       = COALESCE(h.count_unit, b.count_unit),
       auto_mark_source = COALESCE(h.auto_mark_source, b.auto_mark_source)
  FROM habit_backfill b
 WHERE h.user_id = b.user_id
   AND h.id = b.id
   AND (   (h.count_target IS NULL AND b.count_target IS NOT NULL)
        OR (h.count_unit IS NULL AND b.count_unit IS NOT NULL)
        OR (h.auto_mark_source IS NULL AND b.auto_mark_source IS NOT NULL));

WITH last_ref AS (
  SELECT DISTINCT ON (l.user_id, l.row ->> 'id')
         l.user_id, l.row ->> 'id' AS id,
         l.row -> 'program_id' AS pid, l.row -> 'program_slot' AS slot
    FROM sync_op_log l
   WHERE l.table_name = 'fizruk_workouts'
     AND l.status = 'applied'
     AND l.op IN ('insert', 'update')
     AND jsonb_typeof(l.row -> 'id') = 'string'
     AND (l.row ? 'program_id' OR l.row ? 'program_slot')
   ORDER BY l.user_id, l.row ->> 'id', l.client_ts DESC, l.id DESC
),
workout_backfill AS (
  SELECT user_id, id, pid #>> '{}' AS program_id,
         CASE WHEN jsonb_typeof(slot) = 'number' THEN
           CASE WHEN (slot #>> '{}')::numeric BETWEEN 0 AND 2147483647
                 AND (slot #>> '{}')::numeric = trunc((slot #>> '{}')::numeric)
                THEN (slot #>> '{}')::numeric::integer END
         END AS program_slot
    FROM last_ref
   WHERE jsonb_typeof(pid) = 'string'
     AND (pid #>> '{}') ~ '\S'
)
UPDATE fizruk_workouts w
   SET program_id   = b.program_id,
       program_slot = b.program_slot
  FROM workout_backfill b
 WHERE w.user_id = b.user_id
   AND w.id = b.id
   AND w.program_id IS NULL
   AND w.program_slot IS NULL
   AND b.program_slot IS NOT NULL;
