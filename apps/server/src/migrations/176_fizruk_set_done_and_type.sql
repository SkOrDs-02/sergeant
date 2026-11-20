-- 176: явний прапорець «виконано» і тип підходу Фізрука.
--
-- Спека: docs/work/specs/fizruk-set-done-flag-and-set-type.md, § Схема.
-- Рішення власника 2026-11-19 (Фз-3 (в)): типи робимо — розминка, дроп,
-- до відмови. Розминка поза результатом (обсяг, рекорди, зараховані
-- підходи), але лишається у відновленні; дроп і «до відмови» рахуються як
-- звичайні. Підрахунок робить доменний предикат, не база.
--
-- Форма:
--   fizruk_workout_sets.done     BOOLEAN  явний стан «виконано»;
--     NULL = запис до фічі, стан виводиться з значень (`isSetCompleted`).
--   fizruk_workout_sets.set_type TEXT     тип підходу (warmup | drop |
--     failure); NULL = звичайний підхід.
-- Наявні рядки не переписуються: обидва NULL, тобто рахуються рівно як до
-- фічі (спека, § Як їде старий рядок). Бекфіл `done` з значень SQL-ом
-- навмисно не робимо: правило зарахованості залежить від типу виміру
-- вправи і живе в одному предикаті домену.
--
-- CHECK на `set_type` перевіряє форму ідентифікатора, а не перелік: перелік
-- тримає sync-хендлер (`invalid_set_type`), як `measure` (172) і
-- `chosen_variant` (134), тож новий тип не потребує міграції.
--
-- Additive, single-phase (Hard Rule #4): nullable без дефолту, тобто лише
-- метадані, без переписування таблиці; CHECK на щойно доданій колонці
-- перевіряє лише NULL-и. Індексів немає: поля читаються разом із рядком.
-- Inline-CHECK у `ADD COLUMN IF NOT EXISTS` робить повторний прогін no-op.
--
-- БЕКФІЛ ВІКНА ДЕПЛОЮ (за зразком 172). Фронт їде раніше за бекенд: у вікні
-- новий клієнт шле `done` / `set_type`, старий сервер їх у колонки не пише,
-- але повний рядок лежить у `sync_op_log.row` applied-опа (rejected /
-- duplicate оп-и зберігають `{}`). Тому колонки дотягуються з журналу:
--   * лише `status = 'applied'` і `op IN ('insert', 'update')`;
--   * ПО КОЖНОМУ КЛЮЧУ окремо береться останній applied-оп рядка, у якому
--     цей ключ є (`client_ts DESC, id DESC`): оп без ключа колонку не
--     чіпає, ключ із `null` = свідоме очищення (тоді й тут NULL);
--   * `done`: JSON true / false або число 1 / 0 (клієнтський SQLite тримає
--     прапорець як INTEGER, конвенція `readBoolField`); `set_type`: лише
--     'warmup' / 'drop' / 'failure' (підмножина форми CHECK). Інше значення
--     дає NULL, тобто колонку пропущено, а міграція не падає;
--   * пишемо лише в колонку, що ще NULL (`COALESCE`), і лише рядки, де є що
--     писати: повторний прогін оновлює 0 рядків.
--
-- Порядок навмисний, як у 172: вибірка з журналу (seq scan) йде у
-- тимчасову таблицю ДО `ALTER TABLE`, тож довгий скан тримає лише
-- ACCESS SHARE на `sync_op_log`, а ACCESS EXCLUSIVE на
-- `fizruk_workout_sets` тримається тільки на час короткого UPDATE за PK.
-- `ON COMMIT DROP`: файл виконується однією транзакцією (раннер
-- `BEGIN ... COMMIT`, тест-гарнеси одним запитом); вручну через psql лише
-- з `-1`.

CREATE TEMP TABLE m176_set_backfill ON COMMIT DROP AS
WITH ops AS (
  SELECT l.user_id, l.row ->> 'id' AS id, l.row AS r, l.client_ts, l.id AS op_id
    FROM sync_op_log l
   WHERE l.table_name = 'fizruk_workout_sets'
     AND l.status = 'applied'
     AND l.op IN ('insert', 'update')
     AND jsonb_typeof(l.row -> 'id') = 'string'
     AND (l.row ? 'done' OR l.row ? 'set_type')
),
last_done AS (
  SELECT DISTINCT ON (user_id, id) user_id, id, r -> 'done' AS v
    FROM ops
   WHERE r ? 'done'
   ORDER BY user_id, id, client_ts DESC, op_id DESC
),
last_set_type AS (
  SELECT DISTINCT ON (user_id, id) user_id, id, r -> 'set_type' AS v
    FROM ops
   WHERE r ? 'set_type'
   ORDER BY user_id, id, client_ts DESC, op_id DESC
)
SELECT COALESCE(d.user_id, t.user_id) AS user_id,
       COALESCE(d.id, t.id) AS id,
       CASE WHEN jsonb_typeof(d.v) = 'boolean' THEN (d.v #>> '{}')::boolean
            WHEN jsonb_typeof(d.v) = 'number' AND (d.v #>> '{}') = '1' THEN TRUE
            WHEN jsonb_typeof(d.v) = 'number' AND (d.v #>> '{}') = '0' THEN FALSE
       END AS done,
       CASE WHEN jsonb_typeof(t.v) = 'string'
             AND (t.v #>> '{}') IN ('warmup', 'drop', 'failure')
            THEN t.v #>> '{}'
       END AS set_type
  FROM last_done d
  FULL JOIN last_set_type t ON t.user_id = d.user_id AND t.id = d.id;

ALTER TABLE fizruk_workout_sets
  ADD COLUMN IF NOT EXISTS done BOOLEAN,
  ADD COLUMN IF NOT EXISTS set_type TEXT
    CONSTRAINT fizruk_workout_sets_set_type_check CHECK (set_type ~ '^[a-z_]{1,16}$');

UPDATE fizruk_workout_sets s
   SET done     = COALESCE(s.done, b.done),
       set_type = COALESCE(s.set_type, b.set_type)
  FROM m176_set_backfill b
 WHERE s.user_id = b.user_id
   AND s.id = b.id
   AND (   (s.done IS NULL AND b.done IS NOT NULL)
        OR (s.set_type IS NULL AND b.set_type IS NOT NULL));

COMMENT ON COLUMN fizruk_workout_sets.done IS
  'Явний стан «виконано» (спека fizruk-set-done-flag-and-set-type). NULL = запис до фічі, стан виводиться з значень (isSetCompleted).';
COMMENT ON COLUMN fizruk_workout_sets.set_type IS
  'Тип підходу: warmup | drop | failure (спека fizruk-set-done-flag-and-set-type). NULL = звичайний. CHECK на форму, перелік перевіряє хендлер.';
