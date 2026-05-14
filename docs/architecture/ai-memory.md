# AI memory architecture

> **Last validated:** 2026-05-13 by Devin. **Next review:** 2026-08-11.
> **Status:** Active

> Single source of truth для серверного episodic-memory store (`ai_memories` table з migration 025) — ingestion, recall, backfill. Не плутати з local-first Memory Bank (ADR-0021) — той зберігає user-fact strings.

## Modules

| Surface      | File / table                                                                                                               | Roles                                                                                                                                                                                                               |
| ------------ | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Storage      | [`apps/server/src/migrations/025_ai_memories_pgvector.sql`](../../apps/server/src/migrations/025_ai_memories_pgvector.sql) | pgvector HALFVEC(1024) partitioned by user_id; CHECK source IN (`chat`, `finyk`, `fizruk`, `nutrition`, `routine`, `journal`, `digest`, `cofounder`, `product`). `cofounder` додано у 028, `product` у 068 (PR-24). |
| Embeddings   | [`apps/server/src/modules/ai-memory/embeddings.ts`](../../apps/server/src/modules/ai-memory/embeddings.ts)                 | Voyage `voyage-3.5-lite` (1024d). Voyage budget guard у [`apps/server/src/modules/ai-memory/voyageBudget.ts`](../../apps/server/src/modules/ai-memory/voyageBudget.ts).                                             |
| Service      | [`apps/server/src/modules/ai-memory/service.ts`](../../apps/server/src/modules/ai-memory/service.ts)                       | `remember()` + `recall()` орchestrator. Викликається BullMQ-worker-ом + recall-route.                                                                                                                               |
| Ingest queue | [`apps/server/src/modules/ai-memory/ingestQueue.ts`](../../apps/server/src/modules/ai-memory/ingestQueue.ts)               | BullMQ `ai-memory-ingest`. `enqueueMemoryIngest()` — public producer. Per-source gating через `AI_MEMORY_ENABLED` (master) + `MONO_AI_MEMORY_INGEST_ENABLED` (finyk).                                               |
| Recall route | [`apps/server/src/modules/ai-memory/recallRoute.ts`](../../apps/server/src/modules/ai-memory/recallRoute.ts)               | Public `POST /api/ai-memory/recall` (session-auth). HubChat tool: [`packages/openclaw-plugin/src/legacy/tools/recall-memory.ts`](../../packages/openclaw-plugin/src/legacy/tools/recall-memory.ts).                 |
| Backfill     | [`apps/server/src/modules/ai-memory/backfill.ts`](../../apps/server/src/modules/ai-memory/backfill.ts)                     | Resumable backfill з `tg_topic_archive` → cofounder memory. Detailed нижче.                                                                                                                                         |

## Ingest flow (current state)

```
producer-callsite                            BullMQ queue                worker
─────────────────                            ─────────────                ──────
 mono webhook  (source=finyk)         ┐                                  ┌─ Voyage embed
 weekly digest (source=digest)        ├─→  ai-memory-ingest    ───→     ├─ INSERT ai_memories
 hub/chat user posts (chat)           │                                  └─ metrics + breadcrumb
 backfill CLI (source=cofounder)      │
 event-sync route (source=product)    ┘
```

`event-sync` (PR-24): web `trackEvent` дзеркалить allowlist analytics events (`onboarding_completed`, `first_action_completed`, `signup_completed`, `subscription_started`) до `POST /api/ai-memory/event-sync`. Route форматує payload у людський text (`"2026-05-13: completed onboarding wizard (vibe_picked)"`), scrubPII, enqueue-ить як `source='product'`. Idempotency: `sourceRef = "<eventName>:<userId>:<dayKey>"` — повторні fire-и тієї ж події у Kyiv-добу дедуплікуються.

`enqueueMemoryIngest` gating:

- `AI_MEMORY_ENABLED=false` → skip ALL sources (metric `mode="disabled"`).
- `MONO_AI_MEMORY_INGEST_ENABLED=false` AND source=`finyk` → skip just finyk (PR-19).
- All other sources flow when master flag on.

Worker idempotency: BullMQ jobId = `${userId}:${source}:${sourceRef}`. На повторний enqueue (webhook retry, backfill resume) одна job у Redis-і — duplicate в `ai_memories` запобігається UNIQUE-індексом `(user_id, source, source_ref) WHERE source_ref IS NOT NULL`.

## Retry, DLQ + observability

`ai-memory-ingest` BullMQ-queue має retry-with-exponential-backoff (`AI_MEMORY_INGEST_ATTEMPTS=5`, `backoff.delay=30s`, sumарно ~2.5h coverage для Voyage incident-у 1–2h). [`isRetryableIngestError`](../../apps/server/src/modules/ai-memory/ingestQueue.ts) класифікує:

- **Retryable** — Voyage 429, 5xx, network/abort/timeout. BullMQ scheduling-ить наступну спробу з exponential-backoff.
- **Non-retryable** — `MissingVoyageApiKeyError` (manual fix), Voyage 4xx (квота/auth). Повторна спроба нічого не змінить.

### Dead-letter queue

Permanent-fail jobs пишуться у [`ai_memory_ingest_failed`](../../apps/server/src/migrations/068_ai_memory_ingest_failed.sql) (migration 068) у двох випадках:

1. **Non-retryable error** — `processMemoryIngestJob` ловить, log + `recordIngestDlq()`.
2. **Retries-exhausted** — BullMQ emit-ить `failed`-event після `attemptsMade >= AI_MEMORY_INGEST_ATTEMPTS`; worker.on("failed") handler пише у DLQ.

DLQ-row — `(user_id, source, source_ref, payload_json, error_msg, attempts, last_attempt_at, replayed_at, replay_count)`. Partial-UNIQUE `(user_id, source, source_ref) WHERE source_ref IS NOT NULL AND replayed_at IS NULL` гарантує idempotent INSERT — повторне permanent-fail тієї ж job-и bump-ить `attempts/last_attempt_at`, не плодить дублі.

Sentry warning на DLQ-write шле `error_signature='ai-memory-ingest-dlq'` (routing-ключ для n8n alert-dedup, WF-22/WF-98), rate-limited 1 alert/хв per process (anti-spam при Voyage incident-і коли 100s падінь за секунди).

### Replay tooling

Operator workflow після fix-у downstream-bug-у:

```bash
# 1. Подивитися що у DLQ (read-only)
pnpm replay:dlq --source=finyk --since='2026-05-13' --list-only

# 2. Dry-run — побачити які rows replay-нуться
pnpm replay:dlq --source=finyk --since='2026-05-13'

# 3. Execute — actually re-enqueue (повторно проходить gating + budget guard)
pnpm replay:dlq --source=finyk --since='2026-05-13' --execute

# Або точкове по ID-ах
pnpm replay:dlq --ids=42,43,44 --execute
```

API endpoint: `POST /api/internal/ai-memory-dlq/{list,replay}` (bearer-auth, `INTERNAL_API_KEY`). Replay-callsite викликає `enqueueMemoryIngest()` → BullMQ → той самий worker. Тобто replay повторно проходить `AI_MEMORY_ENABLED` / per-source gating / Voyage budget — rate-limit-friendly.

### Metrics

| Signal                                      | Help                             |
| ------------------------------------------- | -------------------------------- | -------- | -------------- | -------------------- | -------------------------------------------------------------- |
| `ai_memory_ingest_enqueued_total{mode}`     | `queued                          | fallback | enqueue_error  | disabled             | source_disabled`.                                              |
| `ai_memory_ingest_processed_total{outcome}` | `ok                              | retry    | permanent_fail | dlq                  | skipped`. `dlq`counted IN ADDITION to`permanent_fail`/`retry`. |
| `ai_memory_ingest_duration_ms{outcome}`     | Histogram per-job duration (мс). |
| `ai_memory_ingest_queue_depth{status}`      | Gauge `waiting                   | active   | delayed        | failed`, polled 30s. |

DLQ-row count поки не expose-ється як gauge — operator SQL-ить безпосередньо:

```sql
SELECT source, COUNT(*) AS active_failures
  FROM ai_memory_ingest_failed
 WHERE replayed_at IS NULL
 GROUP BY source;
```

## Sources matrix

`source` differentiates origin + read-policy. CHECK constraint у `025_ai_memories_pgvector.sql` (extended у 028 + 068).

| Source      | Producer                                                                                                | Reader                                                                                   | Isolation                                                                                                                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chat`      | Hub chat user posts                                                                                     | `/recall` API + RAG context-injection                                                    | Per-user; default tier.                                                                                                                                                                                                 |
| `finyk`     | Mono webhook (server-side)                                                                              | `/recall` + RAG                                                                          | Per-user; behind `MONO_AI_MEMORY_INGEST_ENABLED` (PR-19).                                                                                                                                                               |
| `fizruk`    | Client-driven (RxDB) ingest                                                                             | `/recall` + RAG                                                                          | Per-user.                                                                                                                                                                                                               |
| `nutrition` | Client-driven (RxDB) ingest                                                                             | `/recall` + RAG                                                                          | Per-user.                                                                                                                                                                                                               |
| `routine`   | Client-driven (RxDB) ingest                                                                             | `/recall` + RAG                                                                          | Per-user.                                                                                                                                                                                                               |
| `journal`   | Client-driven (RxDB) ingest                                                                             | `/recall` + RAG                                                                          | Per-user.                                                                                                                                                                                                               |
| `digest`    | Weekly digest cron (server-side)                                                                        | `/recall` + RAG                                                                          | Per-user.                                                                                                                                                                                                               |
| `cofounder` | `pnpm ai-memory:backfill` CLI (PR-22) → backfill API → `tg_topic_archive`                               | OpenClaw `recall_memory` tool (HARDCODED `sources=['cofounder']`, ADR-0031 §3 isolation) | Founder-only namespace. Хардкодинг у tool гарантує що cofounder DM-recall повертає тільки founder-input narrative.                                                                                                      |
| `product`   | Web `trackEvent` (PR-24) → `POST /api/ai-memory/event-sync` для allowlist (`onboarding_completed` etc.) | `POST /api/ai-memory/recall` з явним `sources=['cofounder','product']` для combined view | НЕ доступний з OpenClaw `recall_memory` tool (зберігає founder-input clean). UI-recall на web-side комбінує. Soft-isolation: server route — session-gated, не INTERNAL_API_KEY; per-user partitioning (як усі sources). |

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
