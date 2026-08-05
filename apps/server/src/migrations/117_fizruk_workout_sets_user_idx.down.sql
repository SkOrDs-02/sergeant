-- Down migration: fizruk_workout_sets_user_idx
--
-- Local-only rollback (Hard Rule #4) — прод ніколи не запускає `.down.sql`.
-- Індекс адитивний і жодним кодом не читається явно (його бачить лише
-- планувальник), тож DROP безпечний і не потребує двофазності.

DROP INDEX IF EXISTS fizruk_workout_sets_user_idx;
