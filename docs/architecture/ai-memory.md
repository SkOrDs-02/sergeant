# AI memory architecture

> **Last validated:** 2026-05-13 by Devin. **Next review:** 2026-08-11.
> **Status:** Active

> Single source of truth для серверного episodic-memory store (`ai_memories` table з migration 025) — ingestion, recall, backfill. Не плутати з local-first Memory Bank (ADR-0021) — той зберігає user-fact strings.

## Modules

| Surface      | File / table                                                                                                               | Roles                                                                                                                                                                                               |
| ------------ | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Storage      | [`apps/server/src/migrations/025_ai_memories_pgvector.sql`](../../apps/server/src/migrations/025_ai_memories_pgvector.sql) | pgvector HALFVEC(1024) partitioned by user_id; CHECK source IN (`chat`, `finyk`, `fizruk`, `nutrition`, `routine`, `journal`, `digest`, `cofounder`).                                               |
| Embeddings   | [`apps/server/src/modules/ai-memory/embeddings.ts`](../../apps/server/src/modules/ai-memory/embeddings.ts)                 | Voyage `voyage-3.5-lite` (1024d). Voyage budget guard у [`apps/server/src/modules/ai-memory/voyageBudget.ts`](../../apps/server/src/modules/ai-memory/voyageBudget.ts).                             |
| Service      | [`apps/server/src/modules/ai-memory/service.ts`](../../apps/server/src/modules/ai-memory/service.ts)                       | `remember()` + `recall()` орchestrator. Викликається BullMQ-worker-ом + recall-route.                                                                                                               |
| Ingest queue | [`apps/server/src/modules/ai-memory/ingestQueue.ts`](../../apps/server/src/modules/ai-memory/ingestQueue.ts)               | BullMQ `ai-memory-ingest`. `enqueueMemoryIngest()` — public producer. Per-source gating через `AI_MEMORY_ENABLED` (master) + `MONO_AI_MEMORY_INGEST_ENABLED` (finyk).                               |
| Recall route | [`apps/server/src/modules/ai-memory/recallRoute.ts`](../../apps/server/src/modules/ai-memory/recallRoute.ts)               | Public `POST /api/ai-memory/recall` (session-auth). HubChat tool: [`packages/openclaw-plugin/src/legacy/tools/recall-memory.ts`](../../packages/openclaw-plugin/src/legacy/tools/recall-memory.ts). |
| Backfill     | [`apps/server/src/modules/ai-memory/backfill.ts`](../../apps/server/src/modules/ai-memory/backfill.ts)                     | Resumable backfill з `tg_topic_archive` → cofounder memory. Detailed нижче.                                                                                                                         |

## Ingest flow (current state)

```
producer-callsite                            BullMQ queue                worker
─────────────────                            ─────────────                ──────
 mono webhook  (source=finyk)         ┐                                  ┌─ Voyage embed
 weekly digest (source=digest)        ├─→  ai-memory-ingest    ───→     ├─ INSERT ai_memories
 hub/chat user posts (chat)           ┘                                  └─ metrics + breadcrumb
 backfill CLI (source=cofounder)
```

`enqueueMemoryIngest` gating:

- `AI_MEMORY_ENABLED=false` → skip ALL sources (metric `mode="disabled"`).
- `MONO_AI_MEMORY_INGEST_ENABLED=false` AND source=`finyk` → skip just finyk (PR-19).
- All other sources flow when master flag on.

Worker idempotency: BullMQ jobId = `${userId}:${source}:${sourceRef}`. На повторний enqueue (webhook retry, backfill resume) одна job у Redis-і — duplicate в `ai_memories` запобігається UNIQUE-індексом `(user_id, source, source_ref) WHERE source_ref IS NOT NULL`.

## Backfill з `tg_topic_archive` (PR-21 follow-up)

### Motivation

PR-19 (#2605) активував ingest-flag для **нових** messages. Historical message archive з Telegram (`tg_topic_archive` table, migration 048) не embedded — `/recall` не бачить старого контексту. Backfill CLI ретроактивно проходить window архіву і enqueue-ить рядки у ту саму `ai-memory-ingest` queue, що й live producers.

### Components

| File                                                                                                                               | Role                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [`apps/server/src/migrations/065_ai_memory_backfill_state.sql`](../../apps/server/src/migrations/065_ai_memory_backfill_state.sql) | `ai_memory_backfill_state` — resumable state ledger (один row per run).                                      |
| [`apps/server/src/modules/ai-memory/backfill.ts`](../../apps/server/src/modules/ai-memory/backfill.ts)                             | `startBackfill` / `runBackfillBatch` / `finalizeBackfill` — core orchestrator.                               |
| [`apps/server/src/routes/internal/ai-memory.ts`](../../apps/server/src/routes/internal/ai-memory.ts)                               | `POST /api/internal/ai-memory/backfill/{start,batch,finalize}` — chunked endpoints (INTERNAL_API_KEY-gated). |
| [`scripts/ai-memory-backfill.mjs`](../../scripts/ai-memory-backfill.mjs)                                                           | Operator CLI — `pnpm ai-memory:backfill --founder=<id> [...]`.                                               |

### When to run

**One-time** після того як ingest-flag активовано у production (PR-19 → Day-0). Запускайте у такому порядку:

1. **Dry-run** для cost-estimate:

   ```bash
   pnpm ai-memory:backfill --founder=<userId> --days=90 --dry-run
   ```

   CLI друкує total candidates і estimated USD cost. Якщо cost > `VOYAGE_DAILY_BUDGET_USD_SOFT` (default $1) — або підняти budget env, або зменшити `--days`, або обмежити `--topic`.

2. **Execute**:

   ```bash
   pnpm ai-memory:backfill --founder=<userId> --days=90 --batch=100 --execute
   ```

   Loop-ить `/batch` endpoint доки `hasMore=false`. Прогрес лог раз на 100 batches.

3. **Resume** (якщо CLI впав / Ctrl+C):
   ```bash
   pnpm ai-memory:backfill --founder=<userId> --resume-state-id=<id> --execute
   ```
   Стартує з `last_processed_id` cursor, не передає start-арg-и (immutable після INSERT).

### Cost model

Voyage `voyage-3.5-lite` — $0.02 per 1M input tokens (April 2026). Roughly 4 chars per token (UA/EN mix). Formula:

```
usd = sum(LENGTH(text)) / 4 / 1_000_000 * 0.02
```

Real-world: 10k archive rows × ~500 chars avg = 5M chars → ~$0.025 (under default $1 soft budget).

`startBackfill` обчислює estimate за один single `COUNT + SUM(LENGTH)` query і пише у `ai_memory_backfill_state.estimated_cost_usd`. Якщо > `VOYAGE_DAILY_BUDGET_USD_SOFT` → status='aborted_budget', `Sentry.addBreadcrumb({category: 'ai-memory.backfill', level: 'warning'})`, CLI друкує hint і exit 4.

### Dedup

SQL-предикат у `buildCandidatesPredicate`:

```sql
WHERE sent_at > NOW() - ($N::int * INTERVAL '1 day')
  AND text <> ''
  AND NOT EXISTS (
    SELECT 1 FROM ai_memories m
    WHERE m.source = 'cofounder'
      AND m.source_ref = 'tg_archive:' || tg_topic_archive.id::text
  )
```

Кожна row → payload з `source='cofounder'`, `sourceRef='tg_archive:<id>'`. Друге проганянь CLI (intentional re-run) — no-op: candidates count = 0, бо всі вже у `ai_memories`. BullMQ jobId-dedup ловить race-condition між паралельними CLI runs.

### Resume / pause

`ai_memory_backfill_state` тримає `last_processed_id` cursor (BIGINT у `tg_topic_archive.id`). Partial UNIQUE index `WHERE status='running' AND dry_run=FALSE` блокує паралельні runs per founder — другий CLI впаде на conflict. Dry-run runs не блокуються (cost-estimate безпечно паралелити).

### Monitoring

| Signal            | Where                                                                       | What to look at                                                                      |
| ----------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Run state         | `SELECT * FROM ai_memory_backfill_state ORDER BY started_at DESC LIMIT 10`  | Останні runs, `status`, `processed_count` vs `total_candidates`.                     |
| Enqueue rate      | `ai_memory_ingest_enqueued_total{source="cofounder", mode="queued"}` (Prom) | Рост під час backfill-у — confirm queue receiving jobs.                              |
| Worker outcome    | `ai_memory_ingest_processed_total{source="cofounder", outcome=*}`           | `ok` має бути ~= cumulative_enqueued; `permanent_fail` > 0 → дивитися Sentry/logger. |
| Sentry breadcrumb | Filter category=`ai-memory.backfill`                                        | Run lifecycle: started / aborted_budget / completed.                                 |

Після успішного backfill-у — спот-чек `/recall`:

```bash
# Founder DM: /recall "коли я говорив про PR-19"
# Очікувано: top-5 з джерелами `tg_archive:<id>` у sourceRef.
```

### Failure modes

| Symptom                                | Cause                                        | Action                                                                                                                              |
| -------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `aborted_budget`                       | Estimated cost > soft budget                 | `--days=` нижче, або `--topic=` allowlist, або підняти `VOYAGE_DAILY_BUDGET_USD_SOFT`.                                              |
| `enqueueMemoryIngest` returns silently | `AI_MEMORY_ENABLED=false` або Redis incident | Перевірити env + Redis health у Railway. CLI продовжить counter-и, але queue лишиться порожньою — `ai_memories` rows не зʼявляться. |
| `aborted_error`                        | DB або endpoint exception                    | Перевірити Sentry breadcrumb + server logs. CLI друкує `unhandled error` → exit 2. Resume `--resume-state-id`.                      |
| `last_processed_id` stuck              | Cursor не bump-нувся (порожній batch)        | Перевірити predicate — можливо ВСЕ у window вже у `ai_memories`. `total_candidates=0` на `/start` підтверджує.                      |

## Related ADRs

- [ADR-0028](../adr/0028-pgvector-ai-memory.md) — initial design (storage + Voyage).
- [ADR-0031](../adr/0031-openclaw-v0-telegram-cofounder.md) §3 — cofounder source strict isolation.
- PR-19 (#2605) — ingest activation + per-source gating.
- PR-21 (#2625) — WF-30 weekly digest activation.
