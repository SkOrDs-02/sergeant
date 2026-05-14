-- 068 down: rollback `product` source. Видаляємо product rows перш ніж
-- вузити CHECK constraint, інакше re-add впаде на existing data.
--
-- Якщо у `ai_memories` уже є `source='product'` rows, ця rollback ВИДАЛИТЬ
-- їх (без soft-delete buffer-у — це rollback, не data-loss-protected path).
-- Backup перед запуском: `pg_dump --table=ai_memories`.

DELETE FROM ai_memories WHERE source = 'product';

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
    'cofounder'
  ));
