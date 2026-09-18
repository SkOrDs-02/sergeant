-- 118 down: rollback `profile` source. Видаляємо profile-рядки перш ніж
-- звужувати CHECK constraint — інакше re-add вужчого CHECK впаде на
-- existing data (той самий порядок, що й 068 down).
--
-- Якщо у `ai_memories` уже є `source='profile'` rows на момент rollback-у,
-- ця операція ВИДАЛИТЬ їх без soft-delete buffer-у — це rollback-шлях, не
-- data-loss-protected path. Backup перед запуском:
-- `pg_dump --table=ai_memories`. Клієнтський банк пам'яті
-- (`hub_user_profile_v1`) і серверний `user_profile` (115) цим НЕ
-- зачіпаються — rollback стосується лише RAG-дзеркала (`ai_memories`),
-- не source-of-truth профілю.

DELETE FROM ai_memories WHERE source = 'profile';

ALTER TABLE ai_memories
  DROP CONSTRAINT IF EXISTS ai_memories_source_check;

ALTER TABLE ai_memories
  ADD CONSTRAINT ai_memories_source_check
  CHECK (source IN (
    'chat',
    'finyk',
    'fizruk',
    'nutrition',
    'routine',
    'journal',
    'digest',
    'cofounder',
    'product'
  ));
