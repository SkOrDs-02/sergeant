# Voyage AI + pgvector — AI memory

> **Last validated:** 2026-05-02 by @Skords-01. **Next review:** 2026-08-01.
> **Status:** Active (foundation + ingestion + retrieval; повний цикл готовий)

AI memory підсистема. ADR — [`0028-pgvector-ai-memory.md`](../adr/0028-pgvector-ai-memory.md).

## Що це таке

Server-side семантичний memory для Anthropic-асистента. Дозволяє запит-pattern-и типу:

- "знайди мою найдешевшу транзакцію за каву минулого місяця" (finyk)
- "нагадай, як я минулого тижня описував свої цілі" (chat / journal)
- "які тренування я робив із [X]" (fizruk)

на сотнях тисяч rows-ів, без token-cost-а у Anthropic-context-і. На відміну від [Memory Bank](../adr/0021-memory-bank.md) (local-first, structured user-facts) — pgvector-store зберігає embedding-и довільного тексту і повертає top-K-семантично-найближчих.

## Архітектура

```
┌────────────────┐
│ caller         │  PR2: ingestion-hooks (finyk/nutrition/fizruk/journal)
│ (PR2/PR3)      │  PR3: HubChat tool `recall_memory`, `/api/chat` RAG-injection
└───────┬────────┘
        │
        ▼  apps/server/src/modules/ai-memory/index.ts
┌──────────────────┐
│ AiMemoryService  │  service.ts — facade, master flag AI_MEMORY_ENABLED
└─┬─────────────┬──┘
  │             │
  ▼             ▼
┌──────────┐  ┌────────────────┐
│ Embedding │  │  VectorStore   │  vector-store-agnostic (turbopuffer-ready)
│ Provider  │  │                │
└─────┬─────┘  └───────┬────────┘
      │                │
      ▼                ▼
   Voyage          pgvector
   API             (Postgres extension)
```

- `embeddings.ts` — Voyage HTTP-клієнт (retry + circuit breaker).
- `vectorStore.ts` — pgvector реалізація `VectorStore` для таблиці `ai_memories`.
- `service.ts` — facade; `remember()` / `recall()` no-op-и, поки `AI_MEMORY_ENABLED=false`.
- `bootstrap.ts` — lazy singleton DI: `getAiMemory()` повертає shared service.
- `types.ts` — стабільний контракт; майбутня заміна на Turbopuffer/Qdrant — лише через `createTurbopufferStore()`.

## Що робить кожен файл

| Файл             | Відповідальність                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`       | `MemorySource`, `MemoryWrite`, `MemoryQueryResult`, `VectorStore`, `EmbeddingProvider` interfaces                               |
| `embeddings.ts`  | `createVoyageEmbeddings()` — fetch-клієнт з retry+breaker; `MissingVoyageApiKeyError`, `VoyageHttpError`, `VoyageContractError` |
| `vectorStore.ts` | `createPgVectorStore(pool)` — upsert (atomic), query (HNSW + ef_search), deleteBySource, deleteAllForUser, health               |
| `service.ts`     | `createAiMemoryService(deps)` — facade; `remember()`, `recall()`, `forgetUser()`, `forgetSource()`                              |
| `bootstrap.ts`   | `getAiMemory()` — lazy singleton; `__resetAiMemoryForTest()` — тестовий escape-hatch                                            |
| `index.ts`       | Public surface; caller-и імпортують лише звідси                                                                                 |

## Database schema

Таблиця `ai_memories` (міграція [`025_ai_memories_pgvector.sql`](../../apps/server/src/migrations/025_ai_memories_pgvector.sql)):

| Стовпчик             | Тип                                        | Призначення                                                                            |
| -------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------- |
| `id`                 | `BIGSERIAL`                                | PK; serializer коерсить → `Number` (rule #1)                                           |
| `user_id`            | `TEXT FK ON DELETE CASCADE` → `"user"(id)` | partitioning key + GDPR cascade                                                        |
| `source`             | `TEXT` (CHECK enum)                        | `chat / finyk / fizruk / nutrition / routine / journal / digest`                       |
| `source_ref`         | `TEXT NULL`                                | external id (mono_tx_id, week_key); `(user_id, source, source_ref)` логічно унікальний |
| `content`            | `TEXT`                                     | оригінальний текст для re-embed + human-debug                                          |
| `embedding`          | `HALFVEC(1024)`                            | 16-bit float vector (50% памʼяті vs `vector(1024)`)                                    |
| `embedding_provider` | `TEXT`                                     | `"voyage"` (для re-embed batch-у)                                                      |
| `embedding_model`    | `TEXT`                                     | `"voyage-3-lite"`                                                                      |
| `embedding_version`  | `TEXT`                                     | internal semver (`"1"` → `"2"` при зміні prompt-template)                              |
| `metadata`           | `JSONB`                                    | structured facts (amount, mcc, date, ...)                                              |
| `created_at`         | `TIMESTAMPTZ`                              | для time-window post-filter-ів                                                         |

Партиціонування: `PARTITION BY HASH (user_id)` на 32 партиції; кожна — окремий HNSW-index `m=16, ef_construction=64`.

## Налаштування

Усі прапорці у `apps/server/src/env.ts` + `.env.example`:

| Env var                       | Default         | Призначення                                                   |
| ----------------------------- | --------------- | ------------------------------------------------------------- |
| `AI_MEMORY_ENABLED`           | `false`         | Master flag; foundation-PR залишає off, PR2 вмикає            |
| `VOYAGE_API_KEY`              | —               | Без ключа — `MissingVoyageApiKeyError` при будь-якому виклику |
| `VOYAGE_EMBEDDING_MODEL`      | `voyage-3-lite` | Зміна → re-embed усіх row-ів                                  |
| `VOYAGE_EMBEDDING_DIM`        | `1024`          | Має співпадати з `HALFVEC(N)` у міграції                      |
| `AI_MEMORY_EMBEDDING_VERSION` | `1`             | Internal semver; ⇈ при зміні prompt-template без зміни моделі |
| `VOYAGE_TIMEOUT_MS`           | `15_000`        | HTTP timeout                                                  |
| `VOYAGE_MAX_RETRIES`          | `2`             | Retry на 5xx/408/429; не ретраїмо 4xx                         |
| `VOYAGE_BATCH_SIZE`           | `32`            | Скільки текстів у одному запиті                               |
| `AI_MEMORY_HNSW_EF_SEARCH`    | `40`            | Search-time recall/latency-trade-off                          |
| `AI_MEMORY_TOP_K`             | `8`             | Default для `recall()` (overridable per-query)                |
| `AI_MEMORY_RAG_TOP_K`         | `4`             | Default top-K для RAG-injection у `/api/chat` (PR3)           |

## Lifecycle прапора `AI_MEMORY_ENABLED`

Foundation PR — `false` (default). `remember()` / `recall()` no-op-и (без виклику Voyage / БД).
PR2 (ingestion) — додає producer-и + worker. Master-flag залишається керівником: `AI_MEMORY_ENABLED=false` і ingestion-payload-и просто скіпаються (`mode=disabled` метрика).
PR3 (retrieval) — використовує `recall()` з двох сторін: HubChat tool `recall_memory` (explicit query від асистента) і RAG-injection у `/api/chat` (implicit augmentation на першому турі). При `AI_MEMORY_ENABLED=false` обидві гілки no-op-лять без HTTP-викликів до Voyage/БД.

`forgetUser()` / `forgetSource()` працюють незалежно від прапора — це GDPR escape-hatch.

## Ingestion (PR2)

Producer-и → BullMQ-черга `sergeant:ai-memory-ingest` → worker → `aiMemory.remember()` → Voyage embed → pgvector upsert.

```
┌─ Server-side hooks ──────────────────┐    ┌─ Client-driven ──────────┐
│ mono/webhook.ts (finyk transactions) │    │ POST /api/ai-memory/     │
│ digest/weekly-digest (digest source) │    │ ingest                   │
└─────────────┬────────────────────────┘    └─────────┬────────────────┘
              │                                       │
              ▼                                       ▼
        enqueueMemoryIngest({ userId, source, sourceRef, content, metadata? })
                                  │
                ┌─────────────────┴─────────────────┐
                ▼                                   ▼
       BullMQ (Redis-backed)              fallback (no Redis)
       sergeant:ai-memory-ingest          in-process direct dispatch
                │
                ▼
       processMemoryIngestJob (Worker)
                │
                ▼
       aiMemory.remember() — Voyage embed + pgvector upsert
```

### Producer-и

| Producer                                                                           | Source                                              | sourceRef                  | Коли                                                                         |
| ---------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------- |
| [`mono/webhook.ts`](../../apps/server/src/modules/mono/webhook.ts)                 | `finyk`                                             | `mono_tx_id`               | Після успішного COMMIT транзакції; gate-нуто `MONO_AI_MEMORY_INGEST_ENABLED` |
| [`digest/weekly-digest.ts`](../../apps/server/src/modules/digest/weekly-digest.ts) | `digest`                                            | `userId:weekKey`           | Після генерації AI-summary тижня                                             |
| `POST /api/ai-memory/ingest`                                                       | `chat`, `fizruk`, `nutrition`, `routine`, `journal` | client-supplied (optional) | Клієнт вирішує "це варто памʼятати"                                          |

`finyk` і `digest` навмисно ВИКЛЮЧЕНІ з client-driven endpoint-у — для них є server-side hooks з повноціннішим payload-ом (item, weekRange).

### Дедуплікація

Job-id у BullMQ — `${userId}__${source}__${sourceRef}`, тож одночасний enqueue з двох API-replic-ів зливається атомарно у Redis. Другий шар захисту — UNIQUE-індекс `(user_id, source, source_ref) WHERE source_ref IS NOT NULL` у міграції 025; пустий sourceRef (chat-ingest без stable id) дозволяє дублі (два кліки `Send` = два memories).

### Retry policy

| Помилка                            | Retry?                        |
| ---------------------------------- | ----------------------------- |
| `VoyageHttpError` 429 / 5xx        | Так (exponential, до 5 спроб) |
| `VoyageHttpError` 4xx (except 429) | Ні (palit-and-drop)           |
| `MissingVoyageApiKeyError`         | Ні (manual fix)               |
| Network / timeout / abort          | Так                           |

Backoff: 30s → 2min → 8min → 32min → 2h. Сумарно ~2.5h, достатньо щоб пережити Voyage incident на 1–2h без втрати job-у.

### Метрики

| Метрика                                    | Лейбли              |
| ------------------------------------------ | ------------------- | -------- | ------------------------- | ------------------------ |
| `ai_memory_ingest_enqueued_total`          | `mode=queued        | fallback | disabled                  | enqueue_error`, `source` |
| `ai_memory_ingest_processed_total`         | `outcome=ok         | retry    | permanent_fail`, `source` |
| `ai_memory_ingest_duration_ms` (histogram) | `outcome`, `source` |
| `ai_memory_ingest_queue_depth` (gauge)     | `state=waiting      | active   | delayed                   | failed`                  |

### Failure mode

`enqueueMemoryIngest()` навмисно НЕ throw-ить — failure mode = log + drop. Тобто mono-webhook ніколи не падає через memory-ingestion-incident, ні Voyage outage не валить /api/chat. Memory — best-effort, втрата одного job-у НЕ ламає UX.

### POST /api/ai-memory/ingest

Зразок payload:

```json
{
  "source": "nutrition",
  "sourceRef": "meal-2026-05-01-08-00",
  "content": "вівсянка з горіхами 350 ккал",
  "metadata": { "calories": 350, "mealType": "breakfast" }
}
```

- 401 без сесії
- 503 коли `AI_MEMORY_ENABLED=false`
- 400 для invalid source / empty content / unknown fields / oversized content
- 413 для metadata > 8KB
- 202 happy path (job enqueued)

Дозволені source-и: `chat`, `fizruk`, `nutrition`, `routine`, `journal` (НЕ `finyk`/`digest` — server-side hooks).

## Retrieval (PR3)

Дві гілки використання `aiMemory.recall()` у chat-flow:

```
┌─ Anthropic-tool-call ────────────────┐    ┌─ /api/chat first turn ───┐
│ HubChat tool `recall_memory`         │    │ ragContext.buildRagContext│
│  (explicit, асистент сам вирішує)    │    │  (implicit, automatic)    │
└─────────────┬────────────────────────┘    └─────────┬────────────────┘
              │                                       │
              ▼                                       ▼
   POST /api/ai-memory/recall          aiMemory.recall(top_k=AI_MEMORY_RAG_TOP_K)
   (sync, ~300ms Voyage + ~10ms pg)    додається у system prompt як [Релевантні спогади:]
              │                                       │
              ▼                                       ▼
        aiMemory.recall(top_k=AI_MEMORY_TOP_K)
        повертає top-K MemoryQueryResult
```

### HubChat tool `recall_memory`

Server-визначення: [`apps/server/src/modules/chat/toolDefs/memory.ts → MEMORY_TOOLS`](../../apps/server/src/modules/chat/toolDefs/memory.ts).
Клієнт-executor: [`apps/web/src/core/lib/chatActions/serverActions.ts → handleRecallMemoryAction()`](../../apps/web/src/core/lib/chatActions/serverActions.ts) (async, через окремий dispatcher `ASYNC_CHAT_ACTION_NAMES`).
Capability registry: `recall_memory` додано у `ASSISTANT_CAPABILITIES` (`packages/shared/src/lib/assistantCatalogue.ts`) → автоматично потрапляє у "Пам'ять"-список SYSTEM_PROMPT.

Async-tool execution: `recall_memory` — єдиний поки async tool, `ASYNC_CHAT_ACTION_NAMES` whitelist дозволяє server-call без ламання sync-тестів інших tool-ів.

### POST /api/ai-memory/recall

Sync read-path (на відміну від async ingestion). Блокує handler на ≤Voyage timeout (`VOYAGE_TIMEOUT_MS=15s`) + pgvector query (~10ms).

```json
{
  "query": "коли я востаннє був у спортзалі?",
  "top_k": 8,
  "sources": ["fizruk", "chat"]
}
```

- 401 без сесії
- 503 коли `AI_MEMORY_ENABLED=false` або `MissingVoyageApiKeyError` / `VoyageHttpError(5xx)` (graceful)
- 400 для empty query / oversized query / `top_k > 50` / unknown source / unknown keys
- 200 happy path: `{ memories: MemoryQueryResult[] }`

### RAG-injection у /api/chat

Implicit augmentation на **першому турі** (НЕ на tool-result-турі — щоб не дублювати context між Anthropic-стрім-iter-аціями). Реалізація — [`ragContext.ts → buildRagContext()`](../../apps/server/src/modules/ai-memory/ragContext.ts).

Failure mode: будь-яка помилка / timeout (`AI_MEMORY_RAG_TIMEOUT_MS=1500ms`) → no-op, повертаємо `baseContext` без інжекту і логуємо `warn`. Anthropic-call ніколи не валиться через RAG.

Short-circuit умови:

- `AI_MEMORY_ENABLED=false`
- `AI_MEMORY_RAG_TOP_K=0`
- `userId == null` (anonymous chat)
- last-user-message коротше за 6 символів (нема сенсу embed-ити)
- немає user-messages у history (наприклад, виклик з system-only payload)

Smaller top-K (4) ніж explicit tool-call (8) — баланс між context-relevance і token-cost у Anthropic-context-і.

## GDPR

`ai_memories.user_id` — FK з `ON DELETE CASCADE` до `"user"(id)`. Better Auth `DELETE /api/me` автоматично purge-ить vector rows. Додатковий queue-job не потрібен.

`forgetUser(userId)` API лишається доступним як explicit-hook для пайплайнів, які видаляють лише vector-data без видалення акаунта (PostHog Person delete sync, наприклад).

## GDPR

`ai_memories.user_id` — FK з `ON DELETE CASCADE` до `"user"(id)`. Better Auth `DELETE /api/me` автоматично purge-ить vector rows. Додатковий queue-job не потрібен.

## Cost / scaling notes

Embedding-bill для 10k активних × 500 memories/міс × 200 tokens ≈ 1B tokens/міс ≈ **$20/міс** (Voyage `voyage-3-lite` ~ $0.02/1M tokens).

Storage:

- 1024d × 2 байти (halfvec) = 2 KB/vector raw
- - ~1.5× для HNSW index у buffer cache
- 50M-вектор-датасет ≈ ~150 GB on-disk (RAM-bound при ~16 GB shared_buffers)

Threshold-и міграції на dedicated vector DB — у [ADR-0028 § scaling thresholds](../adr/0028-pgvector-ai-memory.md#scaling-thresholds).

## Тестування

- Unit (mocked fetch + in-memory store): `apps/server/src/modules/ai-memory/embeddings.test.ts`, `service.test.ts`. Запуск — `pnpm test`.
- Integration (testcontainers + `pgvector/pgvector:pg16`): `vectorStore.integration.test.ts`. Запуск — `pnpm --filter @sergeant/server test:integration`.

Без Docker integration-test-и soft-skip-аються з warning-ом — local dev без Docker лишається зеленим.

## Зовнішні посилання

- ADR-0028 — `docs/adr/0028-pgvector-ai-memory.md`
- pgvector — https://github.com/pgvector/pgvector
- Voyage embeddings API — https://docs.voyageai.com/reference/embeddings-api
