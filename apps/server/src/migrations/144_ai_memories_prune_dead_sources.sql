-- 144: ai_memories — фаза 2 звуження джерел (ініціатива 0024, PR-3).
--
-- Контекст (двофазний процес — docstring `ALLOWED_MEMORY_SOURCES` у
-- apps/server/src/modules/ai-memory/types.ts). Фаза 1 (PR-1, 2026-09-03)
-- звузила TS-рівень (`ALLOWED_MEMORY_SOURCES`) до чотирьох живих значень
-- (`digest`, `cofounder`, `product`, `profile`), лишивши CHECK-constraint
-- широким (10 значень) для legacy-рядків. Ця міграція — Фаза 2: DELETE
-- мертвих рядків + звуження CHECK до тих самих чотирьох значень.
--
-- Рішення founder-а 2026-08-26 (§ Ратифіковані рішення #4/#5,
-- docs/work/specs/initiatives/0024-ai-memory-source-coverage.md):
-- прибрати `chat`, `finyk`, `fizruk`, `nutrition`, `routine`, `journal`
-- повністю, включно з DELETE легасі-рядків у ЦІЙ ЖЕ міграції.
--
-- Замір на проді (виконаний власником 2026-09-19, до цієї міграції):
--
--   source  | count
--  ---------+-------
--   product |    26
--   profile |    22
--   digest  |     6
--  (3 rows)
--
-- Наслідок: по всіх шести мертвих джерелах (`chat`, `finyk`, `fizruk`,
-- `nutrition`, `routine`, `journal`) — НУЛЬ рядків. DELETE видаляє 0
-- рядків; бекап/батчинг не потрібні; рядків поза новим CHECK-списком
-- немає, тож ADD CONSTRAINT нижче не впаде.
--
-- `cofounder` на проді теж має нуль рядків (замір узагалі його не
-- показав — рахуються лише source-и, присутні в таблиці). Незважаючи на
-- це, `cofounder` лишається в CHECK і в `ALLOWED_MEMORY_SOURCES`: чинним
-- є ратифіковане рішення власника 2026-08-26 (чотири значення). Факт
-- «легасі-рядків немає» — відкрите питання до власника, не рішення цього
-- PR-а (див. docstring `RESERVED_SOURCES` у types.ts і § «Прогрес»
-- ініціативи 0024): чи звужувати склад далі до `digest`+`profile`,
-- вирішує власник окремо.
--
-- ─── Партиційний caveat (перевірено проти 118, не скопійовано на віру) ──
--
-- `ai_memories` HASH-партиційована на 32 партиції (025,
-- `PARTITION BY HASH (user_id)`). `DROP CONSTRAINT` / `ADD CONSTRAINT` на
-- parent-таблиці каскадиться в кожну партицію автоматично (стандартна
-- поведінка декларативного партиціонування Postgres ≥11) — тому
-- `ALTER TABLE ai_memories` достатньо, партиції окремо не чіпаємо.

DELETE FROM ai_memories
 WHERE source IN ('chat', 'finyk', 'fizruk', 'nutrition', 'routine', 'journal');

ALTER TABLE ai_memories
  DROP CONSTRAINT IF EXISTS ai_memories_source_check;

ALTER TABLE ai_memories
  ADD CONSTRAINT ai_memories_source_check
  CHECK (source IN (
    'digest',
    'cofounder',
    'product',
    'profile'
  ));

COMMENT ON CONSTRAINT ai_memories_source_check ON ai_memories IS
  'Доменний source. Розширено: 028 -> ''cofounder'' (ADR-0031, OpenClaw v0), 068 -> ''product'' (PostHog -> AI memory sync), 118 -> ''profile'' (явно заявлені факти користувача про себе, L-8 аудит 2026-08-08). 144 -> звужено до чотирьох джерел, що мають продюсера (ініціатива 0024, рішення founder-а 2026-08-26): DELETE + DROP CHECK на ''chat''/''finyk''/''fizruk''/''nutrition''/''routine''/''journal'' (нуль рядків на проді на момент міграції).';
