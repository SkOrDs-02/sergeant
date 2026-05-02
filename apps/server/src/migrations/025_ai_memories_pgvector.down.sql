-- Idempotent rollback for `025_ai_memories_pgvector.sql`.
-- Re-runnable: `IF EXISTS` на кожному drop-у (rule #4 — AGENTS.md).
--
-- Не дропаємо EXTENSION vector — вона безпечна без нашої таблиці
-- (no-op для решти БД), а DROP EXTENSION спрацював би лише якщо ніщо
-- більше її не використовує. На production rollback — це коректно
-- "залишити extension як no-op", хто би не реактивував AI memory.

DROP TABLE IF EXISTS ai_memories CASCADE;
