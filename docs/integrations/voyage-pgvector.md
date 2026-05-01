# Voyage AI + pgvector — AI memory (foundation)

> **Last validated:** 2026-05-01 by @devin-ai-integration[bot]. **Next review:** 2026-08-01.
> **Status:** Active (foundation; ingestion + retrieval — у наступних PR-ах)

Foundation-layer AI memory підсистеми. ADR — [`0028-pgvector-ai-memory.md`](../adr/0028-pgvector-ai-memory.md).

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
│ (PR2/PR3)      │  PR3: HubChat tool `recall_memory`, `/api/chat` RAG
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

## Lifecycle прапора `AI_MEMORY_ENABLED`

Foundation PR (цей) — `false`. `remember()` / `recall()` no-op-и (без виклику Voyage / БД).
PR2 (ingestion) — `true` у production одразу при rollout-і. Hook-и з finyk/nutrition/fizruk/journal починають писати у `ai_memory_embed_queue`.
PR3 (retrieval) — використовує `recall()` з `/api/chat` і HubChat tool `recall_memory`.

`forgetUser()` / `forgetSource()` працюють незалежно від прапора — це GDPR escape-hatch.

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
