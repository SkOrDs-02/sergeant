-- 090: Retire raw Finyk/Monobank transaction rows from AI profile memory.
-- Transactions remain available in Finyk and can be fetched by the assistant
-- through module context; they are not durable user-profile facts.
UPDATE ai_memories
   SET deleted_at = NOW()
 WHERE source = 'finyk'
   AND deleted_at IS NULL;
