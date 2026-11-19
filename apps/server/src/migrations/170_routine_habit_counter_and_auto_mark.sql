-- 170: лічильник звички і привʼязка автовідмітки в Рутині.
--
-- Спека: docs/work/specs/routine-counter-automark-percent-and-hub-rows.md
-- (§ Поза скоупом, § Ризики). Рішення founder-а 2026-11-18 (розбір
-- docs/work/research/2026-11-17-modules-teardown-vs-leaders.md § 11.9):
-- Р-1 (а) лічильник; Р-1 (в) автовідмітку ставлять три фіксовані події,
-- звичку привʼязує поле у формі звички, «знято сьогодні» памʼятається на
-- пристрої. Тому колонки чи таблиці заглушень тут НЕМАЄ.
--
-- Що додає:
--   1. `routine_habits.count_target` (ціле ≥ 1) і `count_unit` (підпис
--      одиниці). NULL = звичка «так/ні», як до міграції.
--   2. `routine_habits.auto_mark_source`: яка подія ставить відмітку сама.
--      NULL = автовідмітки немає. Значення (модуль_подія):
--        'fizruk_workout'       завершене повноцінне тренування Фізрука;
--        'nutrition_water_goal' досягнута денна ціль води Харчування;
--        'finyk_expense'        будь-яка записана витрата Фініка.
--   3. `routine_habit_counts`: кроки лічильника за день. Форма за зразком
--      `routine_habit_skips` (098) після 162: PK `(user_id, id)`, LWW по
--      `updated_at`, soft-delete через `deleted_at`. `id` = `habitId__dateKey`
--      (той самий ключ, що `skip_key`); `habit_id` і `date_key` лежать і
--      окремо, бо індекс і читачі ходять по звичці. `date_key` = день
--      пристрою (ADR-0078), сервер його не перераховує.
--
-- Additive, single-phase (Hard Rule #4). Колонки nullable без дефолту:
-- метадані без переписування таблиці; CHECK на щойно доданій колонці
-- перевіряє лише NULL-и. Старі клієнти полів не шлють і не читають.
-- Inline-CHECK у `ADD COLUMN IF NOT EXISTS` робить повторний прогін no-op.
-- Індекс нової таблиці без CONCURRENTLY: таблиця порожня.

ALTER TABLE routine_habits
  ADD COLUMN IF NOT EXISTS count_target INTEGER
    CONSTRAINT routine_habits_count_target_check CHECK (count_target IS NULL OR count_target >= 1),
  ADD COLUMN IF NOT EXISTS count_unit TEXT,
  ADD COLUMN IF NOT EXISTS auto_mark_source TEXT
    CONSTRAINT routine_habits_auto_mark_source_check CHECK (auto_mark_source IS NULL OR auto_mark_source IN ('fizruk_workout', 'nutrition_water_goal', 'finyk_expense'));

CREATE TABLE IF NOT EXISTS routine_habit_counts (
  id          TEXT NOT NULL,
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  habit_id    TEXT NOT NULL,
  date_key    TEXT NOT NULL,
  count       INTEGER NOT NULL
    CONSTRAINT routine_habit_counts_count_check CHECK (count >= 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ,
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS routine_habit_counts_user_habit_idx
  ON routine_habit_counts (user_id, habit_id);

COMMENT ON COLUMN routine_habits.count_target IS
  'Ціль лічильника за день, ціле >= 1 (Р-1 (а)). NULL = звичка так/ні. День зараховано, коли count >= count_target; частковий день не виконано (П-12 (А)).';
COMMENT ON COLUMN routine_habits.count_unit IS
  'Підпис одиниці лічильника (склянки, сторінки). NULL разом із count_target = звичка так/ні.';
COMMENT ON COLUMN routine_habits.auto_mark_source IS
  'Подія іншого модуля, що сама ставить відмітку сьогодні (Р-1 (в), § 11.9): fizruk_workout | nutrition_water_goal | finyk_expense. NULL = автовідмітки немає. Зняття за сьогодні памʼятає пристрій, не схема.';
COMMENT ON TABLE routine_habit_counts IS
  'Кроки лічильника звички за день (Р-1 (а)). id = habitId__dateKey, date_key за днем пристрою (ADR-0078). LWW по updated_at, soft-delete через deleted_at, як routine_habit_skips.';
