# AI memory architecture

> **Last touched:** 2026-09-19 by @claude (PR-3 ініціативи 0024 — CHECK-констрейнт звужений міграцією 144, sources matrix оновлена). **Next review:** 2026-12-16.
> **Status:** Active

> Single source of truth для серверного episodic-memory **індексу** (`ai_memories` table з migration 025) — ingestion, recall, backfill. Не плутати з фактами профілю: локальний Memory Bank — кеш/редактор, `user_profile` JSONB — їхня істина, а `source='profile'` у `ai_memories` — похідний RAG-індекс (ADR-0021).

## Modules

| Surface      | File / table                                                                                                                  | Roles                                                                                                                                                                                                                                                                                                                           |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Storage      | [`apps/server/src/migrations/025_ai_memories_pgvector.sql`](../../../apps/server/src/migrations/025_ai_memories_pgvector.sql) | pgvector HALFVEC(1024) partitioned by user_id; CHECK у БД звужений [міграцією 144](../../../apps/server/src/migrations/144_ai_memories_prune_dead_sources.sql) (2026-09-19, PR-3 ініціативи 0024) до `digest`/`cofounder`/`product`/`profile` — двофазне звуження завершене, `ALLOWED_MEMORY_SOURCES` і CHECK тепер збігаються. |
| Embeddings   | [`apps/server/src/modules/ai-memory/embeddings.ts`](../../../apps/server/src/modules/ai-memory/embeddings.ts)                 | Voyage `voyage-3.5-lite` (1024d). Voyage budget guard у [`apps/server/src/modules/ai-memory/voyageBudget.ts`](../../../apps/server/src/modules/ai-memory/voyageBudget.ts).                                                                                                                                                      |
| Service      | [`apps/server/src/modules/ai-memory/service.ts`](../../../apps/server/src/modules/ai-memory/service.ts)                       | `remember()` + `recall()` орchestrator. Викликається BullMQ-worker-ом + recall-route.                                                                                                                                                                                                                                           |
| Ingest queue | [`apps/server/src/modules/ai-memory/ingestQueue.ts`](../../../apps/server/src/modules/ai-memory/ingestQueue.ts)               | BullMQ `ai-memory-ingest`. `enqueueMemoryIngest()` — public producer, живі callers: `weekly-digest.ts` (`digest`), `profileMirror.ts` (`profile`). Per-source kill-switch перецілений із `finyk` на `digest` (`DIGEST_AI_MEMORY_INGEST_ENABLED`, PR-2, ініціатива 0024).                                                        |
| Recall route | [`apps/server/src/modules/ai-memory/recallRoute.ts`](../../../apps/server/src/modules/ai-memory/recallRoute.ts)               | Public `POST /api/ai-memory/recall` (session-auth). HubChat tool: [`apps/web/src/core/lib/chatActions/serverActions.ts`](../../../apps/web/src/core/lib/chatActions/serverActions.ts).                                                                                                                                          |
| Backfill     | знято 2026-08-29 (OpenClaw retired, ADR-0075)                                                                                 | Модулі `backfill.ts` / internal-роут / CLI `ai-memory:backfill` видалено. Таблиця `ai_memory_backfill_state` (міграція 065) чекає двофазного DROP.                                                                                                                                                                              |

## Ingest flow (current state)

Ініціатива 0024 (PR-1, 2026-09-03) прибрала клієнт-driven `POST
/api/ai-memory/ingest` і `finyk`-гілку в `ingestQueue.ts` — жодне з шести
джерел без продюсера (`chat`, `finyk`, `fizruk`, `nutrition`, `routine`,
`journal`) ніколи не писало в `ai_memories` (замір § Перезамір 2026-09-03
у `docs/work/specs/initiatives/0024-ai-memory-source-coverage.md`).

```
producer-callsite                            BullMQ queue                worker
─────────────────                            ─────────────                ──────
 weekly digest (source=digest)         ┐                                 ┌─ Voyage embed
 profileMirror (source=profile)        ├─→  ai-memory-ingest    ───→     ├─ INSERT ai_memories
                                        ┘                                 └─ metrics + breadcrumb
```

`event-sync` (PR-24) знято 2026-08-29: телеметрія в ролі «фактів про людину» лише шуміла в RAG. Наявні рядки `source='product'` читаються в list/recall як legacy.

`enqueueMemoryIngest` gating:

- `AI_MEMORY_ENABLED=false` → skip ALL sources (metric `mode="disabled"`).
- `DIGEST_AI_MEMORY_INGEST_ENABLED` (default `true`) — per-source kill-switch,
  перецілений PR-2 (ініціатива 0024, § План змін) із мертвого `finyk` на
  `digest`: `false` або активний runtime kill-switch `digest_ai_memory_ingest`
  (in-memory, авто-flip з RAG-евалу при `status=kill`) скіпають лише
  `source="digest"` (metric `mode="source_disabled"`).
- `profile` не гейтиться per-source прапорцем — тече, коли увімкнено лише
  master-flag.

Worker idempotency: BullMQ jobId = `${userId}:${source}:${sourceRef}`. На повторний enqueue (повторний прогін digest, повторний `PUT /api/me/profile`; backfill знято 2026-08-29) одна job у Redis-і — duplicate в `ai_memories` запобігається UNIQUE-індексом `(user_id, source, source_ref) WHERE source_ref IS NOT NULL`.

## Retry, DLQ + observability

`ai-memory-ingest` BullMQ-queue має retry-with-exponential-backoff (`AI_MEMORY_INGEST_ATTEMPTS=5`, `backoff.delay=30s`, sumарно ~2.5h coverage для Voyage incident-у 1–2h). [`isRetryableIngestError`](../../../apps/server/src/modules/ai-memory/ingestQueue.ts) класифікує:

- **Retryable** — Voyage 429, 5xx, network/abort/timeout. BullMQ scheduling-ить наступну спробу з exponential-backoff.
- **Non-retryable** — `MissingVoyageApiKeyError` (manual fix), Voyage 4xx (квота/auth). Повторна спроба нічого не змінить.

### Dead-letter queue

Permanent-fail jobs пишуться у [`ai_memory_ingest_failed`](../../../apps/server/src/migrations/069_ai_memory_ingest_failed.sql) (migration 069) у двох випадках:

1. **Non-retryable error** — `processMemoryIngestJob` ловить, log + `recordIngestDlq()`.
2. **Retries-exhausted** — BullMQ emit-ить `failed`-event після `attemptsMade >= AI_MEMORY_INGEST_ATTEMPTS`; worker.on("failed") handler пише у DLQ.

DLQ-row — `(user_id, source, source_ref, payload_json, error_msg, attempts, last_attempt_at, replayed_at, replay_count)`. Partial-UNIQUE `(user_id, source, source_ref) WHERE source_ref IS NOT NULL AND replayed_at IS NULL` гарантує idempotent INSERT — повторне permanent-fail тієї ж job-и bump-ить `attempts/last_attempt_at`, не плодить дублі.

Sentry warning на DLQ-write шле `error_signature='ai-memory-ingest-dlq'` (routing-ключ для alert-dedup; історично n8n WF-22/WF-98, виведено — ADR-0090), rate-limited 1 alert/хв per process (anti-spam при Voyage incident-і коли 100s падінь за секунди).

### Replay tooling

Operator workflow після fix-у downstream-bug-у:

```bash
# 1. Подивитися що у DLQ (read-only). `--source` — одне з ALLOWED_MEMORY_SOURCES
#    (`digest` / `profile`; `finyk` більше не source — знято 0024 PR-2)
pnpm replay:dlq --source=digest --since='2026-09-01' --list-only

# 2. Dry-run — побачити які rows replay-нуться
pnpm replay:dlq --source=digest --since='2026-09-01'

# 3. Execute — actually re-enqueue (повторно проходить gating + budget guard)
pnpm replay:dlq --source=digest --since='2026-09-01' --execute

# Або точкове по ID-ах
pnpm replay:dlq --ids=42,43,44 --execute
```

API endpoint: `POST /api/internal/ai-memory-dlq/{list,replay}` (bearer-auth, `INTERNAL_API_KEY`). Replay-callsite викликає `enqueueMemoryIngest()` → BullMQ → той самий worker. Тобто replay повторно проходить `AI_MEMORY_ENABLED` / per-source gating / Voyage budget — rate-limit-friendly.

### Metrics

| Signal | Help |
| ------------------------------------------- | -------------------------------- | -------- | -------------- | -------------------- | -------------------------------------------------------------- |
| `ai_memory_ingest_enqueued_total{mode}` | `queued                          | fallback | enqueue_error  | disabled             | source_disabled`. |
| `ai_memory_ingest_processed_total{outcome}` | `ok                              | retry    | permanent_fail | dlq                  | skipped`. `dlq`counted IN ADDITION to`permanent_fail`/`retry`. |
| `ai_memory_ingest_duration_ms{outcome}` | Histogram per-job duration (мс). |
| `ai_memory_ingest_queue_depth{status}` | Gauge `waiting                   | active   | delayed        | failed`, polled 30s. |

DLQ-row count поки не expose-ється як gauge — operator SQL-ить безпосередньо:

```sql
SELECT source, COUNT(*) AS active_failures
  FROM ai_memory_ingest_failed
 WHERE replayed_at IS NULL
 GROUP BY source;
```

## Sources matrix

`source` differentiates origin + read-policy. CHECK constraint у `025_ai_memories_pgvector.sql` (extended у 028 + 068 + 118) звужений [міграцією 144](../../../apps/server/src/migrations/144_ai_memories_prune_dead_sources.sql) (2026-09-19, PR-3 ініціативи 0024) до чотирьох рядків нижче. TS-рівень (`ALLOWED_MEMORY_SOURCES`) звужений раніше PR-1 (2026-09-03): `chat`, `finyk`, `fizruk`, `nutrition`, `routine`, `journal` прибрані — жоден ніколи не мав продюсера в дереві (замір § Перезамір, `docs/work/specs/initiatives/0024-ai-memory-source-coverage.md`). Заміром на проді перед PR-3 (2026-09-19) підтверджено нуль рядків по всіх шести значеннях — DELETE у міграції 144 не мав ефекту.

| Source      | Producer                                                                                          | Reader                                | Isolation                                                                                                                                                                                                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `digest`    | Weekly digest cron (server-side, `weekly-digest.ts`)                                              | `/recall` + RAG                       | Per-user.                                                                                                                                                                                                                                                                                              |
| `profile`   | `profileMirror.ts` — дзеркало серверного `user_profile` (банк памʼяті, PUT `/api/me/profile`)     | `/recall` API + RAG context-injection | Per-user; єдиний редактор — Профіль → «Банк памʼяті» (не `/api/ai-memory/*`).                                                                                                                                                                                                                          |
| `cofounder` | LEGACY: писався backfill-ом з `tg_topic_archive` (OpenClaw); механіку знято 2026-08-29 (ADR-0075) | list/recall (legacy-рядки)            | Нових рядків не буде. Замір на проді перед PR-3 (2026-09-19) показав нуль рядків, тож наявних legacy-рядків до читання/видалення через UI немає — лишений у CHECK/`ALLOWED_MEMORY_SOURCES` ратифікованим рішенням власника 2026-08-26; звужувати далі до `digest`+`profile` — окреме рішення власника. |
| `product`   | LEGACY: PostHog-дзеркало (`event-sync`, PR-24); знято 2026-08-29                                  | list/recall (legacy-рядки)            | Телеметрія в ролі «фактів про людину» шуміла в RAG. Нових рядків не буде; наявні читаються й видаляються через UI.                                                                                                                                                                                     |

`chat`, `finyk`, `fizruk`, `nutrition`, `routine`, `journal` — шість джерел без жодного продюсера в дереві, прибрані з `ALLOWED_MEMORY_SOURCES` PR-1 (2026-09-03) і з CHECK-констрейнта [міграцією 144](../../../apps/server/src/migrations/144_ai_memories_prune_dead_sources.sql) (PR-3, 2026-09-19). Замір на проді до міграції показав нуль рядків по всіх шести — DELETE не мав ефекту; INSERT з такими значеннями тепер падає з `ai_memories_source_check` violation.

## Backfill з `tg_topic_archive` — знято 2026-08-29

Ретроактивний embed OpenClaw-архіву (`backfill.ts`, internal-роути `/api/internal/ai-memory/backfill/*`, CLI `pnpm ai-memory:backfill`, PR-21/22) видалено разом із рештою OpenClaw-спадщини (ADR-0075): архів більше не поповнюється, разова міграція своє відпрацювала. Таблиця стану `ai_memory_backfill_state` (міграція 065) лишається в БД до двофазного DROP (Hard Rule #4); те саме стосується soft-delete-механіки `/forget` (`forget.ts`, `forgetCleanup.ts`, `invocation-audit.ts` — Telegram-консольні команди founder-а, мертві з виходом OpenClaw).

## Related ADRs

- [ADR-0028](../../governance/adr/0028-pgvector-ai-memory.md) — initial design (storage + Voyage).
- [ADR-0031](../../governance/adr/0031-openclaw-v0-telegram-cofounder.md) §3 — cofounder source strict isolation.
- PR-19 (#2605) — ingest activation + per-source gating.
- PR-21 (#2625) — WF-30 weekly digest activation.
