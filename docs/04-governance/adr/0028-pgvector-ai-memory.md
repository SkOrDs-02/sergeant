# ADR-0028: pgvector + Voyage для AI retrieval-індексу

- **Status:** Accepted
- **Last validated:** 2026-09-04 by Codex (звірка графа коду й джерел). **Next review:** 2026-12-03.
- **Date:** 2026-05-01
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`025_ai_memories_pgvector.sql`](../../../apps/server/src/migrations/025_ai_memories_pgvector.sql)
  - [`apps/server/src/modules/ai-memory/`](../../../apps/server/src/modules/ai-memory)
  - [Архітектура AI-memory](../../02-engineering/architecture/ai-memory.md)
  - [ADR-0021](./0021-memory-bank.md)

## Історичний контекст

Цей ADR обрав PostgreSQL з pgvector і Voyage embeddings замість окремої
керованої vector DB. Початкова міграція створила partitioned `ai_memories`,
`HALFVEC(1024)` та HNSW cosine index. Ці рішення про storage зберігаються в
схемі; первісний широкий план ingestion вже не описує поточний набір продюсерів.

## Поточне рішення

`ai_memories` — per-user семантичний **retrieval-індекс**, а не джерело істини
для продуктового запису чи фактів профілю. Він зберігає metadata провайдера,
моделі та версії embedding для re-embed, а при видаленні користувача рядки
видаляє foreign-key cascade.

`AiMemoryService` — єдиний facade для embedding, upsert, recall та deletion.
Він гейтує читання і запис `AI_MEMORY_ENABLED` та per-user consent. Ingestion
не критичний: вимкнений flag, soft/hard Voyage budget guard чи помилка embedding
не можуть зламати вихідну операцію профілю або дайджесту.

Chat RAG використовує лише останнє змістовне повідомлення користувача,
обмежений top-K та timeout. Помилка recall або timeout повертає наданий base
context: запит чату не падає лише через недоступність retrieval.

Межа живих продюсерів навмисно вузька: перевірені `digest` і `profile`.
`cofounder` та `product` зарезервовані для legacy-рядків, але не мають
перевіреного продюсера; retired domain sources не приймаються для нового
ingestion. Додавання продюсера чи розширення sources — нове рішення та
реалізація, а не дозвіл, що вже випливає з цього ADR.

## Наслідки

- Факти профілю з `user_profile` можуть індексуватись як `source='profile'`,
  але векторна копія disposable і мусить сходитися з джерелом істини профілю.
- pgvector лишається поруч з реляційними даними та зберігає межу `VectorStore`
  для майбутньої міграції, якщо її виправдає доказ масштабу або operability.
- Runtime activation не видно з checkout. Чи ввімкнені в середовищі
  `AI_MEMORY_ENABLED` і credentials провайдера, **очікує підтвердження деплою**;
  не можна називати індекс активним у середовищі лише за цими джерелами.
- Очищення sources не завершено, поки існують reserved legacy sources. Їхнє
  видалення або схвалений продюсер для них — **pending**, а не неявна частина
  прийнятого storage-рішення.

## Межа верифікації

Migration/index contract, `VectorStore` serialization, consent gate і RAG
fail-safe мають лишатися покритими ai-memory unit та integration тестами. Новий
source потребує явного продюсера, idempotency strategy і deletion path до
додавання у публічний набір sources.
