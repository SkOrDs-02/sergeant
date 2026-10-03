-- 140 down: повернути `fizruk_pushups` (форма з 131) і розкласти назад
-- перенесені тренування — один рядок на (user, day) з кількістю повторень
-- єдиного підходу. Зворотній перенос читає ОБИДВІ форми id (`pushups:<day>`
-- з клієнтського переносу фази 1 і `pushups:<user>:<day>` з 140), день
-- бере з хвоста id (`YYYY-MM-DD` — рівно 10 символів). Самі тренування
-- лишаються в журналі: down не має права видаляти те, чого сам не створював,
-- а відрізнити «створене 140» від «створене клієнтом» після факту не можна.

CREATE TABLE IF NOT EXISTS fizruk_pushups (
  user_id     TEXT NOT NULL,
  date_key    TEXT NOT NULL,
  reps        INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date_key)
);

INSERT INTO fizruk_pushups (user_id, date_key, reps, updated_at)
SELECT w.user_id, right(w.id, 10), s.reps, w.updated_at
  FROM fizruk_workouts w
  JOIN fizruk_workout_items i ON i.workout_id = w.id AND i.deleted_at IS NULL
  JOIN fizruk_workout_sets  s ON s.workout_item_id = i.id AND s.deleted_at IS NULL
 WHERE w.id LIKE 'pushups:%'
   AND w.deleted_at IS NULL
   AND right(w.id, 10) ~ '^\d{4}-\d{2}-\d{2}$'
ON CONFLICT (user_id, date_key) DO NOTHING;
