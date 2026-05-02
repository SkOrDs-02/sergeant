-- Down-migration для 028_openclaw.sql.
--
-- Видаляємо обидві таблиці і відкочуємо source CHECK у попередній стан.
-- Якщо у `ai_memories` уже є row-и з source='cofounder' — DROP CONSTRAINT
-- + ADD CONSTRAINT упаде на violation. Це навмисно: не хочемо silently
-- лосити cofounder memory при rollback-у. Якщо потрібно справді відкотити
-- — спочатку manual `DELETE FROM ai_memories WHERE source = 'cofounder'`,
-- потім цю міграцію.
--
-- Ідемпотентно (AGENTS rule #4 + PR-5.B): кожен statement тут має
-- IF EXISTS, тому повторний прогін не падає. Не використовуємо
-- ALTER TABLE openclaw_decisions DROP CONSTRAINT перед DROP TABLE
-- тому що при другому прогоні таблиця вже відсутня — DROP TABLE
-- сам прибирає всі FK-залежності.

DROP TABLE IF EXISTS openclaw_decisions;
DROP TABLE IF EXISTS openclaw_invocations;

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
    'digest'
  ));
