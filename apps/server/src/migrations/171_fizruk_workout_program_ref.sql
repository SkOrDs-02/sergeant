-- 171: привʼязка тренування до слоту програми у `fizruk_workouts`.
--
-- Спека: docs/work/specs/fizruk-program-plan-sets.md, § Ризики, питання 1,
-- варіант (А); П-10 у § 11.9 розбору
-- docs/work/research/2026-11-17-modules-teardown-vs-leaders.md.
--
-- Навіщо. Курсор «наступна сесія програми» = слот після останнього
-- повноцінного тренування активної програми. Без привʼязки у рядку не
-- сказати, яку сесію закрито, а евристика за набором вправ помиляється.
--
-- Форма:
--   program_id   TEXT    id програми (каталогу або своєї), як у клієнті.
--   program_slot INTEGER індекс запису в `schedule` програми (з 0). Саме
--                        індекс, а не `sessionKey`: ключ сесії в розкладі
--                        повторюється (PPL push пн і чт).
-- Обидва NULL = тренування поза програмою (усі наявні рядки).
--
-- Additive, single-phase (Hard Rule #4): nullable без дефолту, тобто лише
-- метадані, без переписування таблиці; CHECK на щойно доданій колонці
-- перевіряє лише NULL-и. Індексу немає навмисно: поля читаються разом із
-- рядком тренування. Inline-CHECK у `ADD COLUMN IF NOT EXISTS` робить
-- повторний прогін no-op.

ALTER TABLE fizruk_workouts
  ADD COLUMN IF NOT EXISTS program_id TEXT,
  ADD COLUMN IF NOT EXISTS program_slot INTEGER
    CONSTRAINT fizruk_workouts_program_slot_check CHECK (program_slot >= 0);

COMMENT ON COLUMN fizruk_workouts.program_id IS
  'Програма, сесію якої закрило тренування (П-10, варіант А). NULL = поза програмою.';
COMMENT ON COLUMN fizruk_workouts.program_slot IS
  'Індекс запису в schedule програми, з 0 (sessionKey у розкладі повторюється). NULL = поза програмою.';
