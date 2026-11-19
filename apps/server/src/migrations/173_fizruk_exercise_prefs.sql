-- 173: памʼять людини про тип виміру вправи, `fizruk_exercise_prefs`.
--
-- Спека: docs/work/specs/fizruk-exercise-measure-type.md, § Міграції,
-- міграція Б. Рішення founder-а 2026-11-18 (розбір
-- docs/work/research/2026-11-17-modules-teardown-vs-leaders.md § 11.9):
-- змінений людиною тип виміру запамʼятовується і їде між пристроями.
--
-- Форма за зразком `routine_habit_counts` (170): PK `(user_id, id)`, LWW по
-- `updated_at`, soft-delete через `deleted_at` (= «повернути дефолт
-- каталогу»). `id` = id вправи (каталогу чи власної), рядок на вправу;
-- окремої `exercise_id` немає, вона дорівнювала б `id`. CHECK на `measure`
-- перевіряє форму ідентифікатора, перелік тримає sync-хендлер.
--
-- Additive, single-phase (Hard Rule #4): нова порожня таблиця, старий код
-- її не читає. Окремого індексу немає: PK `(user_id, id)` покриває і
-- вибірку всіх рядків людини, і точковий lookup. Повторний прогін no-op.

CREATE TABLE IF NOT EXISTS fizruk_exercise_prefs (
  id          TEXT NOT NULL,
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  measure     TEXT NOT NULL
    CONSTRAINT fizruk_exercise_prefs_measure_check CHECK (measure ~ '^[a-z_]{1,32}$'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ,
  PRIMARY KEY (user_id, id)
);

COMMENT ON TABLE fizruk_exercise_prefs IS
  'Тип виміру вправи, обраний людиною (спека fizruk-exercise-measure-type, міграція Б). id = id вправи. LWW по updated_at, soft-delete = повернути дефолт каталогу.';
