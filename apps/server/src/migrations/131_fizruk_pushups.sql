-- 131: fizruk_pushups - перенос власності pushup-даних routine -> fizruk.
--
-- WHY. Канон routine.md §10 і рішення founder-а 2026-08-30: «фізактивність
-- належить fizruk». Історично лічильник віджимань жив у RoutineState.
-- pushupsByDate і таблиці routine_pushups (міграція 050), а fizruk читав
-- його крізь модульний шов (usePushupActivity -> routinePushupsRead) -
-- інверсія власності. Ця міграція створює fizruk-власну таблицю тієї самої
-- форми і КОПІЮЄ всі наявні рядки зі збереженням updated_at, тож
-- per-row LWW-порівняння на sync-шляху дає ті самі результати, що й до
-- переносу.
--
-- ФОРМА. 1:1 дзеркало routine_pushups: один рядок на (user, day) з
-- лічильником повторів; date_key - device-local YYYY-MM-DD (ADR-0078).
--
-- ДВОФАЗНІСТЬ (Hard Rule #4). routine_pushups НЕ дропається і навіть не
-- перестає приймати push у цій міграції: старі клієнти ще шлють у неї опи.
-- Зняття routine-половини (writer, стейт, drop таблиці) - окрема пізніша
-- поставка (Phase B переносу).

CREATE TABLE IF NOT EXISTS fizruk_pushups (
  user_id     TEXT NOT NULL,
  date_key    TEXT NOT NULL,
  reps        INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date_key)
);

-- Копія історії. ON CONFLICT DO NOTHING робить міграцію ідемпотентною при
-- повторному прогоні; свіжіші рядки, що встигли зʼявитись у fizruk_pushups
-- напряму, не перезаписуються старішими routine-даними.
INSERT INTO fizruk_pushups (user_id, date_key, reps, updated_at)
SELECT user_id, date_key, reps, updated_at
  FROM routine_pushups
ON CONFLICT (user_id, date_key) DO NOTHING;
