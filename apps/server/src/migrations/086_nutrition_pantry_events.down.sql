-- Down migration: nutrition_pantry_events
--
-- Ідемпотентний rollback для `086_nutrition_pantry_events.sql`.
-- Таблиця з'явилась саме в 086 і на момент стадії 1 не має ні писарів, ні
-- читачів, тому rollback = прибрати її разом з індексами (DROP TABLE знімає
-- власні індекси автоматично). Жодна існуюча таблиця у 086 не змінювалась —
-- зокрема `nutrition_pantry_items` не чіпали, — тож відкочувати більше
-- нічого.
--
-- Production НІКОЛИ не запускає `.down.sql` — local-rollback only
-- (див. `db.ts` -> runPendingSqlMigrations). Two-phase DROP з Hard Rule #4
-- стосується forward-міграцій; тут DROP живе виключно у down-файлі.

DROP TABLE IF EXISTS nutrition_pantry_events;
