-- 098_routine_habit_skips.sql
--
-- Хвиля 4, рядок «гнучкий стрік» — персистенція двох механізмів мʼякості,
-- які до цього жили лише в локальному стані Рутини:
--
--   1) `routine_habit_skips` — третій стан дня «не зміг з причиною»
--      (канон `docs/01-product/model/routine.md` §5). Форма один-в-один як
--      у `routine_completion_notes` (міграція 050): композитний PK
--      `(user_id, skip_key)`, LWW по `updated_at`, soft-delete через
--      `deleted_at`. `skip_key` — `habitId__dateKey`.
--
--   2) `routine_habits.pause_intervals` — датовані інтервали планованої
--      паузи (канон §4). Колонка `paused` НЕ видаляється: старі клієнти
--      все ще пишуть недатований прапор, і читачі поважають обидва.
--      Двофазний DROP `paused` — окрема майбутня міграція, коли жоден
--      живий клієнт більше не писатиме в неї (Hard Rule #4).
--
-- Обидві зміни адитивні: DEFAULT покриває наявні рядки, NOT NULL безпечний.

ALTER TABLE routine_habits
  ADD COLUMN IF NOT EXISTS pause_intervals JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS routine_habit_skips (
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  skip_key    TEXT NOT NULL,
  reason      TEXT NOT NULL DEFAULT 'other',
  note        TEXT NOT NULL DEFAULT '',
  at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ,
  PRIMARY KEY (user_id, skip_key)
);

CREATE INDEX IF NOT EXISTS routine_habit_skips_user_active_idx
  ON routine_habit_skips (user_id)
  WHERE deleted_at IS NULL;
