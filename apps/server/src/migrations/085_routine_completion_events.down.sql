-- Down migration: routine_completion_events
--
-- Ідемпотентний rollback для `085_routine_completion_events.sql`.
-- Таблиця з'явилась саме в 085 і на момент стадії 1 не має жодного читача,
-- тому rollback = прибрати її разом з індексами (DROP TABLE знімає власні
-- індекси автоматично). Жодна існуюча таблиця у 085 не змінювалась, тож
-- відкочувати більше нічого.
--
-- Production НІКОЛИ не запускає `.down.sql` — local-rollback only
-- (див. `db.ts` -> runPendingSqlMigrations). Two-phase DROP з Hard Rule #4
-- стосується forward-міграцій; тут DROP живе виключно у down-файлі.

DROP TABLE IF EXISTS routine_completion_events;
