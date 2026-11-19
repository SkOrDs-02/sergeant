-- 172: секунди й метри на кожен підхід і тип виміру вправи в тренуванні.
--
-- Спека: docs/work/specs/fizruk-exercise-measure-type.md, § Міграції,
-- міграція А. Рішення founder-а 2026-11-18 (розбір
-- docs/work/research/2026-11-17-modules-teardown-vs-leaders.md § 11.9):
-- секунди й метри пишуться на кожен підхід, а не на вправу.
--
-- Форма:
--   fizruk_workout_sets.duration_sec INTEGER  секунди одного підходу;
--   fizruk_workout_sets.distance_m   INTEGER  метри одного підходу;
--     NULL = підхід без цієї величини (усі наявні рядки).
--   fizruk_workout_items.measure     TEXT     тип виміру вправи в цьому
--     тренуванні; NULL = запис до фічі, читач виводить тип зі старого `type`.
-- Однойменні `duration_sec` / `distance_m` на `fizruk_workout_items`
-- (міграція 029) лишаються як є: це величини вправи цілком, не підходу.
--
-- CHECK на `measure` перевіряє форму ідентифікатора, а не перелік: перелік
-- ще відкритий і росте без нової міграції, його тримає sync-хендлер
-- (`invalid_measure`), як `chosen_variant`. Верхні межі секунд і метрів
-- теж у хендлері: зміна стелі не потребує міграції.
--
-- Additive, single-phase (Hard Rule #4): nullable без дефолту, тобто лише
-- метадані, без переписування таблиці; CHECK на щойно доданій колонці
-- перевіряє лише NULL-и. Індексів немає: поля читаються разом із рядком.
-- Inline-CHECK у `ADD COLUMN IF NOT EXISTS` робить повторний прогін no-op.
--
-- БЕКФІЛ ВІКНА ДЕПЛОЮ (спека, § Міграція А, «Бекфіл»). Фронт їде раніше
-- за бекенд: у вікні новий клієнт шле `duration_sec` / `distance_m` /
-- `measure`, старий сервер їх у колонки не пише, але повний рядок лежить у
-- `sync_op_log.row` applied-опа (`encryptOpRowForStorage` шифрує лише
-- `fizruk_injuries.note`; rejected / duplicate оп-и зберігають `{}`).
-- Тому тут колонки дотягуються з журналу:
--   * лише `status = 'applied'` і `op IN ('insert', 'update')`;
--   * ПО КОЖНОМУ КЛЮЧУ окремо береться останній applied-оп рядка, у якому
--     цей ключ є (`client_ts DESC, id DESC`). Це рівно те значення, яке дав
--     би реплей журналу новим хендлером із прапорцем присутності: оп без
--     ключа колонку не чіпає, ключ із `null` = свідоме очищення (тоді й тут
--     NULL);
--   * значення проходять межі хендлера: число або числовий рядок, без
--     мінуса, `floor`, 0..86400 с і 0..1000000 м; `measure` лише з переліку
--     `EXERCISE_MEASURES` (він підмножина форми CHECK). Невалідне значення
--     дає NULL, тобто колонку пропущено, а міграція не падає;
--   * пишемо лише в колонку, що ще NULL (`COALESCE`), і лише рядки, де є що
--     писати: повторний прогін оновлює 0 рядків.
--
-- Порядок навмисний: вибірка з журналу (seq scan, бо індексу з
-- `table_name` попереду немає) йде у тимчасову таблицю ДО `ALTER TABLE`.
-- Так довгий скан тримає лише ACCESS SHARE на `sync_op_log` (не конфліктує
-- з INSERT старого сервера), а ACCESS EXCLUSIVE на таблицях Фізрука від
-- ALTER тримається тільки на час короткого UPDATE за PK. `ON COMMIT DROP`:
-- файл виконується однією транзакцією (раннер `BEGIN ... COMMIT`, тест-
-- гарнеси одним запитом); вручну через psql лише з `-1`, інакше UPDATE
-- впаде на відсутній тимчасовій таблиці (голосно, без часткового стану).

CREATE TEMP TABLE m172_set_backfill ON COMMIT DROP AS
WITH ops AS (
  SELECT l.user_id, l.row ->> 'id' AS id, l.row AS r, l.client_ts, l.id AS op_id
    FROM sync_op_log l
   WHERE l.table_name = 'fizruk_workout_sets'
     AND l.status = 'applied'
     AND l.op IN ('insert', 'update')
     AND jsonb_typeof(l.row -> 'id') = 'string'
     AND (l.row ? 'duration_sec' OR l.row ? 'distance_m')
),
last_duration AS (
  SELECT DISTINCT ON (user_id, id) user_id, id, r -> 'duration_sec' AS v
    FROM ops
   WHERE r ? 'duration_sec'
   ORDER BY user_id, id, client_ts DESC, op_id DESC
),
last_distance AS (
  SELECT DISTINCT ON (user_id, id) user_id, id, r -> 'distance_m' AS v
    FROM ops
   WHERE r ? 'distance_m'
   ORDER BY user_id, id, client_ts DESC, op_id DESC
)
SELECT COALESCE(d.user_id, m.user_id) AS user_id,
       COALESCE(d.id, m.id) AS id,
       CASE WHEN jsonb_typeof(d.v) IN ('number', 'string')
             AND (d.v #>> '{}') ~ '^[0-9]{1,9}(\.[0-9]+)?$'
            THEN CASE WHEN floor((d.v #>> '{}')::numeric) <= 86400
                      THEN floor((d.v #>> '{}')::numeric)::integer END
       END AS duration_sec,
       CASE WHEN jsonb_typeof(m.v) IN ('number', 'string')
             AND (m.v #>> '{}') ~ '^[0-9]{1,9}(\.[0-9]+)?$'
            THEN CASE WHEN floor((m.v #>> '{}')::numeric) <= 1000000
                      THEN floor((m.v #>> '{}')::numeric)::integer END
       END AS distance_m
  FROM last_duration d
  FULL JOIN last_distance m ON m.user_id = d.user_id AND m.id = d.id;

CREATE TEMP TABLE m172_item_backfill ON COMMIT DROP AS
SELECT user_id, id,
       CASE WHEN measure IN ('weight_reps', 'reps', 'weight_time', 'time',
                             'weight_distance', 'distance_time')
            THEN measure END AS measure
  FROM (
    SELECT DISTINCT ON (l.user_id, l.row ->> 'id')
           l.user_id, l.row ->> 'id' AS id,
           CASE WHEN jsonb_typeof(l.row -> 'measure') = 'string'
                THEN l.row ->> 'measure' END AS measure
      FROM sync_op_log l
     WHERE l.table_name = 'fizruk_workout_items'
       AND l.status = 'applied'
       AND l.op IN ('insert', 'update')
       AND jsonb_typeof(l.row -> 'id') = 'string'
       AND l.row ? 'measure'
     ORDER BY l.user_id, l.row ->> 'id', l.client_ts DESC, l.id DESC
  ) last_item;

ALTER TABLE fizruk_workout_sets
  ADD COLUMN IF NOT EXISTS duration_sec INTEGER
    CONSTRAINT fizruk_workout_sets_duration_sec_check CHECK (duration_sec >= 0),
  ADD COLUMN IF NOT EXISTS distance_m INTEGER
    CONSTRAINT fizruk_workout_sets_distance_m_check CHECK (distance_m >= 0);

ALTER TABLE fizruk_workout_items
  ADD COLUMN IF NOT EXISTS measure TEXT
    CONSTRAINT fizruk_workout_items_measure_check CHECK (measure ~ '^[a-z_]{1,32}$');

UPDATE fizruk_workout_sets s
   SET duration_sec = COALESCE(s.duration_sec, b.duration_sec),
       distance_m   = COALESCE(s.distance_m, b.distance_m)
  FROM m172_set_backfill b
 WHERE s.user_id = b.user_id
   AND s.id = b.id
   AND (   (s.duration_sec IS NULL AND b.duration_sec IS NOT NULL)
        OR (s.distance_m IS NULL AND b.distance_m IS NOT NULL));

UPDATE fizruk_workout_items i
   SET measure = b.measure
  FROM m172_item_backfill b
 WHERE i.user_id = b.user_id
   AND i.id = b.id
   AND i.measure IS NULL
   AND b.measure IS NOT NULL;

COMMENT ON COLUMN fizruk_workout_sets.duration_sec IS
  'Секунди одного підходу (спека fizruk-exercise-measure-type, міграція А). NULL = підхід без часу.';
COMMENT ON COLUMN fizruk_workout_sets.distance_m IS
  'Метри одного підходу (спека fizruk-exercise-measure-type, міграція А). NULL = підхід без дистанції.';
COMMENT ON COLUMN fizruk_workout_items.measure IS
  'Тип виміру вправи в цьому тренуванні (спека fizruk-exercise-measure-type). NULL = запис до фічі, тип виводиться з type. Перелік перевіряє хендлер.';
