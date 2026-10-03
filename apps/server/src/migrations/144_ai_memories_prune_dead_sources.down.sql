-- 144 down: rollback звуження CHECK-constraint `ai_memories_source_check`
-- назад до широкого 10-значного списку (стан після 118).
--
-- ОДНОБІЧНІСТЬ (задокументована навмисно, як у `forgetSource()`): рядки
-- `chat`/`finyk`/`fizruk`/`nutrition`/`routine`/`journal`, видалені
-- `DELETE` у forward-міграції, ЦЕЙ down НЕ повертає — вони або й так були
-- відсутні (замір на проді 2026-09-19 показав нуль рядків по всіх
-- шести), або втрачені назавжди разом із forward-міграцією. Rollback тут
-- відновлює лише СХЕМУ (ширший CHECK), не ДАНІ.

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
    'product',
    'profile'
  ));

COMMENT ON CONSTRAINT ai_memories_source_check ON ai_memories IS
  'Доменний source. Розширено: 028 -> ''cofounder'' (ADR-0031, OpenClaw v0), 068 -> ''product'' (PostHog -> AI memory sync), 118 -> ''profile'' (явно заявлені факти користувача про себе, L-8 аудит 2026-08-08). Ingestion-hook для ''profile'' приземляється окремим PR (Фаза 2, див. docstring ALLOWED_MEMORY_SOURCES у ai-memory/types.ts) - до того моменту CHECK дозволяє значення, яке ще ніхто не пише.';
