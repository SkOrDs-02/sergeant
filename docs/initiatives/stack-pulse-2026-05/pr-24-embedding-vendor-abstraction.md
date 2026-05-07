# PR-24: Embedding-vendor abstraction (voyage-3.5-lite lock-in)

> **Last validated:** 2026-05-07 by Devin. **Next review:** 2026-08-05.
> **Status:** Planned

|                    |                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------- |
| **Severity**       | Medium (M8)                                                                              |
| **Linked finding** | M8 (`00-overview.md`)                                                                    |
| **Owner**          | TBD (sponsor: @Skords-01)                                                                |
| **Effort**         | 1–2 дні                                                                                  |
| **Risk**           | Medium (re-embed всієї `ai_memories` table коштовний; rollback вимагає reverse migration) |
| **Touches**        | `apps/server/src/modules/ai-memory/`, `apps/server/src/migrations/`                      |
| **Trigger**        | quality regression на voyage-3.5-lite АБО pricing change АБО vendor outage                |

## Контекст

Поточно (`apps/server/src/modules/ai-memory/embeddings.test.ts` + co.) — embedding-провайдер `voyage-3.5-lite` зашитий у код через `VoyageAIClient` direct-call. Якщо завтра:

- Voyage AI вимикає `voyage-3.5-lite` (deprecation policy ~6mo).
- Ціна стрибне 5×.
- Конкурент (Cohere embed-v4, OpenAI text-embedding-3-large) дає кращу quality на нашому benchmark-у.

Switching cost — повна переписка `vectorStore` + re-embed всіх existing memories (millions of vectors). Без abstraction-ленції — це 5+ днів роботи + outage-window.

## Scope

### 1. Provider interface

```ts
// packages/shared/src/ai/embeddings/provider.ts
export interface EmbeddingProvider {
  readonly modelId: string;
  readonly dimensions: number;
  readonly costPer1kTokens: number;
  embed(texts: string[]): Promise<number[][]>;
  // metadata used для cost-tracking + cosine-similarity validation
}
```

### 2. Concrete adapters

- `VoyageEmbeddingProvider` — поточний код, перенесений за interface
- `OpenAIEmbeddingProvider` — text-embedding-3-large fallback (не використовується, але присутній)
- `MockEmbeddingProvider` — для тестів (deterministic)

### 3. Routing

`apps/server/src/modules/ai-memory/embeddingRouter.ts`:

```ts
// Читає env: EMBEDDING_PROVIDER=voyage-3.5-lite|openai-3-large|...
// Розв'язує у concrete provider
// Логує + cost-tracks через існуючий obs/cost.ts
```

### 4. `model_id` в БД

```sql
-- apps/server/src/migrations/047_ai_memories_model_id.sql
ALTER TABLE ai_memories ADD COLUMN model_id TEXT NOT NULL DEFAULT 'voyage-3.5-lite';
ALTER TABLE ai_memories ADD COLUMN dimensions INTEGER NOT NULL DEFAULT 1024;
CREATE INDEX ai_memories_model_id_idx ON ai_memories (model_id);
```

При vector-search — query тільки memories з `model_id = current_active_model`.

### 5. Migration playbook

`docs/playbooks/embedding-provider-migration.md`:

- Step 1: deploy code with abstraction (no behavior change).
- Step 2: dual-write (legacy + new model) for new entries.
- Step 3: backfill — re-embed historical entries у batches (rate-limit-aware).
- Step 4: switch read-path до нового model_id.
- Step 5: drop legacy entries (after 30d).

## Out of scope

- Self-hosted embedding (sentence-transformers on-server) — окремий ADR.
- Multi-model ensemble retrieval — backlog.

## Acceptance criteria (DoD)

- [ ] `packages/shared/src/ai/embeddings/provider.ts` interface + 3 adapters.
- [ ] `apps/server/src/modules/ai-memory/embeddingRouter.ts` з env-based selection.
- [ ] Migration `047_ai_memories_model_id.sql` merged.
- [ ] Existing `vectorStore` queries добавляють `WHERE model_id = $current`.
- [ ] `docs/playbooks/embedding-provider-migration.md` з step-by-step.
- [ ] `apps/server/src/modules/ai-memory/__tests__/embeddingRouter.test.ts` — env-routing covered.

## Тести

- `embeddingRouter.test.ts` — kожен env value → правильний provider.
- `vectorStore.integration.test.ts` — query filters by model_id.
- Cost-tracking — переконатися що obs/cost.ts отримує model_id у tag.

## Rollout

1. PR-1: interface + adapters + router (env stays voyage; no behavior change).
2. PR-2: migration `model_id` (default voyage).
3. PR-3 (only if vendor switch needed): playbook execution.

## Risks & mitigations

| Risk                                                                | Mitigation                                                                          |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Dual-write doubles embedding cost during transition                 | Time-bound transition (max 7d) + cost-monitoring alert                              |
| Different dimension counts (1024 voyage vs 3072 openai)             | Migration `047` додає `dimensions` column; vector index re-built per-model           |
| Backfill rate-limit фейлить → partial state                         | Idempotent `model_id` upsert; resumable job; checkpoint у `ai_memories_backfill` table |

## Touchpoints (file:line)

- `apps/server/src/modules/ai-memory/embeddings.test.ts` — references existing voyage-3.5-lite usage
- `apps/server/src/modules/ai-memory/types.ts`
- `apps/server/src/modules/ai-memory/vectorStore.integration.test.ts`
- `apps/server/src/modules/ai-memory/ragContext.test.ts`
- `apps/server/src/obs/cost.ts` — додати `model_id` tag
- `packages/shared/src/ai/embeddings/` — new
- `docs/playbooks/embedding-provider-migration.md` — new

## Refs

- [Voyage AI deprecation policy](https://docs.voyageai.com/)
- [OpenAI text-embedding-3-large](https://platform.openai.com/docs/guides/embeddings)
- ADR-0023 RAG architecture (existing, якщо є)
