-- Idempotent rollback for `026_routine_tables.sql`.
-- Re-runnable: `IF EXISTS` на кожному drop-і (rule #4 — AGENTS.md).
-- DROP TABLE … CASCADE також знімає індекси з up.sql, окремих
-- DROP INDEX не потрібно. Production ніколи не запускає `.down.sql` —
-- це local-rollback only (див. db.ts → runPendingSqlMigrations).
--
-- Порядок: спершу таблиці без foreign-key-залежностей одна на одну.
-- routine_streaks і routine_entries обидва FK на "user", без взаємних
-- посилань — порядок не критичний, але алфавітний для передбачуваності.

DROP TABLE IF EXISTS routine_entries CASCADE;
DROP TABLE IF EXISTS routine_streaks CASCADE;
