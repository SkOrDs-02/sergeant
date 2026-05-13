-- Down 067: revert soft-delete columns + indexes.
--
-- DANGER: dropping `deleted_at` втрачає soft-delete state. Якщо rollback
-- виконується після того, як founder робив `/forget` — soft-deleted rows
-- знову стануть видимими у `/recall` (бо filter `deleted_at IS NULL`
-- ніколи не матчиться по неіснуючій колонці). Це може бути небажано з
-- privacy point-of-view. Перед rollback переконайся, що cleanup cron
-- встиг видалити всі soft-deleted rows АБО прокинь окремий
-- `DELETE FROM ai_memories WHERE deleted_at IS NOT NULL` перед DROP.

DROP INDEX IF EXISTS ai_memories_pending_hard_delete_idx;
DROP INDEX IF EXISTS ai_memories_active_idx;

ALTER TABLE ai_memories
  DROP COLUMN IF EXISTS deleted_at;
