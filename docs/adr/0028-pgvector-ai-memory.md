# ADR-0028: pgvector + Voyage embeddings for AI semantic memory

- **Status:** Accepted
- **Date:** 2026-05-01
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`apps/server/src/migrations/025_ai_memories_pgvector.sql`](../../apps/server/src/migrations/025_ai_memories_pgvector.sql) — таблиця `ai_memories` (HALFVEC(1024) + HNSW + hash partitioning).
  - [`apps/server/src/modules/ai-memory/`](../../apps/server/src/modules/ai-memory/) — `types.ts`, `vectorStore.ts`, `embeddings.ts`, `service.ts`, `bootstrap.ts`, `ingestQueue.ts` (PR2), `ingestRoute.ts` (PR2).
  - [ADR-0021 — Memory Bank](./0021-memory-bank.md) — окрема (local-first) система user-fact-ів; pgvector — server-side **семантична** memory по транзакціях/тренуваннях/харчуванню.
  - [ADR-0014 — bigint→number policy](./0014-bigint-to-number-policy.md) — `BIGSERIAL` у `ai_memories.id` коерситься у `Number` у serializer.
  - [ADR-0016 — User deletion and PII handling](./0016-user-deletion-and-pii-handling.md) — `ON DELETE CASCADE` у foundation покриває GDPR-vector-deletion.

---

## Context and Problem Statement

Anthropic-асистент (`/api/chat` + HubChat tools) не пам'ятає нічого між сесіями: щоразу чистий контекст. Юзер не може спитати «знайди мою найдешевшу транзакцію за каву минулого місяця» або «нагадай, як я минулого тижня описував свої цілі», бо ці факти нікуди не індексуються семантично.

[ADR-0021 (Memory Bank)](./0021-memory-bank.md) частково закриває цей gap для **structured user-facts** (алергії, дієта, цілі) через local-first store. Але вон **не масштабується** на:

- сотні фінансових транзакцій з мульти-словами opis-ом ("Сільпо, Доміно картка, кава 65 грн"),
- тренувальні записи fizruk ("subt: legs day 2 sets squats"),
- харчування ("вівсянка з горіхами 350 ккал"),
- chat-турни як long-term context.

Потрібен **server-side семантичний memory** з ANN-пошуком. Питання: яка реалізація.

## Considered Options

1. **pgvector у Railway Postgres** — extension у поточній БД, нативно `JOIN`-ить з реляційними таблицями. **Обрано.**
2. **Turbopuffer** — serverless vector DB ($1/GB indexed + $0.005 per query). Дешевий на наш профіль (50M-векторів — ~$50/міс).
3. **Qdrant Cloud** — managed, $25+/міс на найменшому tier-і. Більш зріла екосистема.
4. **Pinecone** — $70+/міс на стартовому tier-і. Дорого.
5. **Weaviate** — schema-rich, але overkill для нашого use-case.
6. **Do nothing** — Anthropic prompt-cache + Memory Bank як зараз. Не покриває structured data.

## Decision

**Foundation layer** (цей PR):

1. **PostgreSQL extension `vector`** (pgvector ≥ 0.7.0) активується у міграції `025_ai_memories_pgvector.sql`.
2. **Таблиця `ai_memories`**:
   - `embedding HALFVEC(1024)` — 16-bit float, −50% памʼяті vs. `VECTOR(1024)`, втрата якості ~0% для cosine.
   - `embedding_provider`, `embedding_model`, `embedding_version` — дозволяють re-embed batch-ом без втрати даних при зміні моделі.
   - `metadata JSONB` — структуровані факти (amount, mcc, date) для post-filter запитів.
   - `source` — domain enum (`chat | finyk | fizruk | nutrition | routine | journal | digest`); CHECK constraint у БД, union-type у TS. Розширення двофазне.
   - `source_ref` — зовнішній id (mono_tx_id для finyk, week_key для digest, NULL для chat); upsert-семантика per `(user_id, source, source_ref)`.
   - `user_id` FK → `"user"(id) ON DELETE CASCADE` — GDPR cascade без додаткового queue-job-у.
3. **Hash-партиціонування `PARTITION BY HASH (user_id)` на 32 партиції** — pre-filter по `user_id` тривіальний, ANN-запит торкається лише однієї партиції; уникаємо post-filter latency-розривів на популярних користувачах.
4. **HNSW index per partition** з параметрами `m=16, ef_construction=64`. Search-time `ef_search` через env `AI_MEMORY_HNSW_EF_SEARCH=40`.
5. **Voyage AI як embedding-провайдер** (model `voyage-3-lite`, 1024-вимірний, multilingual — добре підтримує українську). Власний fetch-клієнт замість `voyageai` SDK (axios + python-style API → лишній dep).
6. **Vector-store-agnostic інтерфейс** (`apps/server/src/modules/ai-memory/types.ts → VectorStore`) — `pgVectorStore` — конкретна реалізація; майбутня заміна на `turbopufferStore` обмежується dep-ін'єкцією, без зачеплення callers.
7. **Service facade** (`AiMemoryService`) — єдиний entry-point: `remember(inputs)`, `recall(input)`, `forgetUser(userId)`, `forgetSource(...)`. Caller-и (PR2 ingestion, PR3 retrieval) ніколи не торкаються `embeddings.ts` / `vectorStore.ts` напряму.
8. **Master-flag `AI_MEMORY_ENABLED=false`** у foundation-PR. `remember()` / `recall()` no-op-и, поки PR2 не вмикає прапор разом з ingestion-hook-ами. Foundation не зачіпає поточний `/api/chat` flow.

**PR2 (ingestion, наступний крок)**: BullMQ queue `ai_memory_embed_queue` + hooks з finyk/nutrition/fizruk/journal-domain-ів.
**PR3 (retrieval)**: інтеграція у `/api/chat` (query-paraphrasing + RAG-context), HubChat tool `recall_memory`.

## Rationale

**Чому pgvector, а не Turbopuffer/Qdrant з самого старту:**

- На горизонті 1-2 років (1k → 10k активних юзерів × ~500 memories/міс ≈ 5M-50M векторів) pgvector тримає запит < 100мс на Railway Postgres Pro (16 GB RAM) при `halfvec(1024)` + HNSW + партиціонування. Бенчмарки Voyage + pgvector показують recall@10 ≥ 0.95 на `ef_search=40`.
- Reляційні `JOIN`-и: для finyk-запитів типу «топ 5 схожих транзакцій за категорією food за останні 30 днів» pgvector + регулярний WHERE працює природно. Turbopuffer вимагав би federated query (vector-DB + Postgres roundtrip).
- $0 incremental cost — extension, не окремий сервіс. На горизонті <100k юзерів — economically dominated.
- Vendor lock-in мінімальний: інтерфейс `VectorStore` дозволяє swap без зачеплення callers. Migration recipe записаний у [сcaling notes](#scaling-thresholds).

**Чому Voyage `voyage-3-lite`, не OpenAI / Cohere:**

- Найдешевший multilingual embedding на момент рішення (~$0.02/1M tokens). На 10k активних × 500 memories/міс × 200 tokens = 1B tokens/міс ≈ $20/міс.
- Українська якість відчутно краща за `text-embedding-3-small` від OpenAI на наших internal-eval-ах (chat-context UA + transactional opis-и UA + EN суміш).
- Cohere `embed-multilingual-v3` — alternative; дорожче, нативно 1024d (співпадає). Тримаємо як fallback у `embeddings.ts → createCohereEmbeddings()` (PR2).

**Чому halfvec(1024), не vector(1536):**

- 1024d Voyage purpose-built для cost/quality trade-off; OpenAI 1536d не дає proportional quality на нашому use-case.
- `halfvec` зменшує index size у 2× і HNSW-build-time у ~1.5× (більше rows у buffer cache). На 50M-вектор-датасеті це різниця між 100 GB і 50 GB on-disk.
- pgvector 0.7+ тримає halfvec для HNSW нативно — без re-rank-ингу у full precision.

**Чому окремий circuit-breaker для Voyage (а не shared з Anthropic):**

- Provider-isolation: Voyage outage не має валити chat. Anthropic outage не має валити memory ingestion. Окремі counters → окремі open/close transitions.

**Чому master-flag `AI_MEMORY_ENABLED=false` у foundation-PR:**

- Foundation merge ≠ activation. Між PR1 (foundation) і PR2 (ingestion) проміжок — flag захищає production від випадкового write-у через caller-а, що випередив ingestion-логіку.
- Тести вмикають flag через `enabled` override у `createAiMemoryService(deps)`.

## Consequences

### Positive

- Семантичний пошук готовий до використання у PR3 (HubChat `recall_memory` tool, RAG у `/api/chat`).
- GDPR-cascade «безкоштовний» через FK `ON DELETE CASCADE`; не треба додавати ще один queue-step у user-deletion.
- Re-embed-pipeline можливий: `embedding_provider/model/version` snap-shot-нуті у row-і; PR можна додати `forCohere()` як новий прапор-альтернативу.
- Інтерфейс `VectorStore` робить майбутню міграцію на Turbopuffer days-ом, не months-ом.

### Negative

- pgvector + HNSW запис повільніший за чистий INSERT — через partial-update H-graph-у. Очікуваний throughput ~hundreds inserts/sec на партицію; на наших write-rate-ах (BullMQ queue з batch-розміром 32, інтервал 5 сек) — non-issue. Вимірюємо `recordExternalHttp("voyage", ...)` + queue-throughput у Prometheus.
- Voyage rate-limit (`429`) → ретраї з exponential backoff (`[0, 250, 750, 2000]` ms). Якщо breaker відкрився, `ai_memory_embed_queue` тимчасово park-ить items, не валить системи. Worst-case: ingestion lag на хвилини.
- `voyage-3-lite` зміна (Voyage сам колись deprecate-не) → треба rebuild всіх векторів. Mitigation: `embedding_version` + batch re-embed worker (буде у PR2.1, окремо).
- Postgres `shared_buffers` має тримати hot-partition HNSW-index у RAM, інакше latency розривається на cold-cache. На Railway Postgres Pro (16 GB) — комфортно до ~200 GB-індексу разом, тобто ~30M-векторів.

### Neutral

- ESLint / TS — без змін: новий модуль `apps/server/src/modules/ai-memory/` дотримується вже зафіксованих conventions (Vitest, testcontainers, no-bigint-leak, factory-pattern, circuit-breaker через `lib/circuitBreaker.ts`).
- Operability: метрики `voyage_external_http_*` додаються до Prometheus, дашборд оновлюється у PR2 разом з ingestion.

## Compliance

- **Migration lint** (`pnpm lint:migrations`) — підтверджує `025_*.sql` у sequential order і має `*.down.sql` sibling (rule #4 AGENTS.md).
- **Rollback sanity test** (`apps/server/src/migrations/__tests__/rollback-sanity.test.ts`) — runs `025_*.down.sql → 025_*.sql` на pg-container-і у CI.
- **Unit tests**: `apps/server/src/modules/ai-memory/embeddings.test.ts`, `service.test.ts` — мокаємо `fetch` + in-memory store; bigint→number у `vectorStore.ts → rowToResult` зберігається.
- **Integration tests**: `vectorStore.integration.test.ts` через testcontainers + `pgvector/pgvector:pg16` — реальний pgvector behaviour, GDPR-cascade, atomic-rollback.
- **Code-review checklist (PR2 / PR3)**: caller може імпортувати лише з `apps/server/src/modules/ai-memory/index.ts` (public surface); direct import з `vectorStore.ts` / `embeddings.ts` блокується ESLint-правилом `@typescript-eslint/no-restricted-imports` у `eslint-plugin-sergeant-design` (TODO у PR2).

## Scaling thresholds

| Активних юзерів | Вектори (≈) | Стан pgvector                                       | Рекомендована дія                                                        |
| --------------- | ----------- | --------------------------------------------------- | ------------------------------------------------------------------------ |
| 1k              | ~5M         | Comfortable on Railway Postgres Pro (16 GB)         | Default config; HNSW + halfvec + 32 partitions                           |
| 10k             | ~50M        | Working; шаred_buffers ≥ 16 GB, read replica для AI | Додати read replica; binary-quantization rerank як option                |
| 100k            | ~500M       | На межі — час планувати міграцію                    | Hybrid: hot 90 days у pgvector, cold у `user_memory_summaries` (PR4)     |
| 1M+             | ~5B         | Dedicated vector DB                                 | Switch `VectorStore` impl → Turbopuffer / Qdrant; pgvector — для JOIN-ів |

Конкретний recipe написаний у наступний sесії як PR4-планування. **Foundation-layer PR1** не змінює його — лишає `VectorStore` interface як abstraction-boundary.

## Links

- pgvector docs: https://github.com/pgvector/pgvector
- Voyage AI embeddings API: https://docs.voyageai.com/reference/embeddings-api
- HNSW paper (Malkov & Yashunin, 2018): https://arxiv.org/abs/1603.09320
- Halfvec benchmark (pgvector 0.7 release notes): https://github.com/pgvector/pgvector/releases/tag/v0.7.0
