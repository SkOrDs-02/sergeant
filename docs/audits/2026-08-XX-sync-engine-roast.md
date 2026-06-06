# Sync Engine Deep Roast — `apps/server/src/modules/sync/syncV2.ts` (stub)

> **Last validated:** 2026-06-06 by @claude (audit-closeout pass — added per-handler transaction-boundary diagrams and DLQ TTL note from direct code trace). **Next review:** 2026-09-06.
> **Status:** Draft

> **Owner:** TBD (backend-engineer)
> **Trigger window:** Q3 2026 (next backend-roast cycle, аligned with `docs/planning/sprint-roadmap-q2q3-2026.md` § Спринт 8 closeout). Заплановано **2026-08-11** як baseline-date.
> **Tracking:** [`docs/planning/pr-plan-backend-perf-2026-05.md` §PR-12](../planning/pr-plan-backend-perf-2026-05.md).

## TL;DR

`apps/server/src/modules/sync/syncV2.ts` — **3099 рядок**, найбільший single-file у репо. Файл обслуговує всі sync-engine paths (push, pull, op-log, idempotency, dead-letter). Розмір сам по собі не is-bad-news, але:

- При >3 kLOC chunkability per-handler ставиться питанням, чи можна окремо тестувати idempotency-key hot path і retry-semantics без перенавантажування fixture-bootstrap.
- Atomic-transaction boundaries (одна `BEGIN`-у-handler чи декілька) досі не задокументовано — а це визначає, чи може half-committed batch виникнути при connection drop.
- Retry-семантика з v1 sunset-у (ADR-0047) не повністю переглянута для v2 op-log shape — особливо для conflict-resolution-у з SQLite-mobile (Stage 8/9).

Цей stub фіксує scope, не recommendations. Реальний аудит — окрема 1-2-денна сесія наступного циклу.

## Scope

**In scope:**

1. **Chunkability** — чи можна декомпонувати `syncV2.ts` за route-family (push / pull / op-log / DLQ) у sub-modules без зламаного contract-у з api-client? Чи блокує single-file shape pattern якесь shared-state (наприклад, in-memory idempotency cache)?
2. **Atomic-transaction boundaries** — кожен `pool.connect() / BEGIN / COMMIT` парний-у-handler? Чи є шляхи де rollback не виконується при exception всередині batch processing? CI наскрізний test покриває?
3. **Idempotency-key hot path** — TTL retention, eviction strategy, race vs concurrent retry. Скільки rows тримає `sync_idempotency` table на quarterly basis? Index-coverage достатня для p95 lookup?
4. **Retry semantics for v2 op-log shape** — v1 sunset (ADR-0047 Amendment) видалив legacy retry path. Чи v2 conflict-detection повністю покриває mobile SQLite Stage 8/9 dual-write scenarios (`docs/planning/storage-roadmap.md`)?
5. **Dead-letter recovery** — `recoverDeadLetter({ all: true })` callsite у `apps/{web,mobile}/src/core/syncEngine/singleton.ts` — wiring перевірений, але DLQ-row TTL і manual-replay-flow задокументовані тільки в коментарях.

**Out of scope:**

- Зміна op-log payload schema (потребує окремого ADR із SQLite migration plan).
- Frontend `syncEngineWriter` zone — Stage 5 wiring already done (CHANGELOG, PR #2877).
- v1 sunset retrospective — закрите в ADR-0047 Amendment 2026-04-27.

## Methodology hints

- **LOC profile** — `git log -L :handler:syncV2.ts` для кожного route handler; шукати handlers >300 LOC (chunkability candidates).
- **Transaction boundary trace** — `rg "BEGIN|COMMIT|ROLLBACK" apps/server/src/modules/sync/syncV2.ts` + ASCII диаграма per-handler.
- **Idempotency-key telemetry** — Grafana panel `sync_idempotency_size` (потрібен як precondition; додати у `metrics.md §6` якщо відсутній).
- **Retry simulation** — `apps/server/src/modules/sync/syncV2.integration.test.ts` — додати ACID-стрес-кейс із artificial connection drop. Testcontainers Postgres має це підтримувати через `pg-connection-pool` тюнинг.
- **Mobile co-evolution** — звірити з `apps/mobile/src/core/syncEngine/singleton.ts` (recovery wiring); `packages/db-schema/src/sqlite/syncOpOutboxRecover.ts` (DLQ row shape).

## Transaction-boundary trace (2026-06-06 code read)

Traced from `apps/server/src/modules/sync/syncV2.ts` (475 LOC as of this pass).
Note: the file has been substantially refactored from the 3099-LOC version mentioned in the TL;DR below — domain `applySync` functions have been extracted into per-domain sub-modules (`routine/applySync.ts`, `fizruk/applySync.ts`, `nutrition/applySync.ts`, `finyk/applySync.ts`), reducing `syncV2.ts` itself to ~475 LOC. The transaction model is unchanged.

### Handler: `syncV2Push` (POST /api/v2/sync/push)

```
pool.connect()
│
├─ client.query("BEGIN")
│   │
│   └─ for each op in ops[]:
│       │
│       ├─ SELECT sync_op_log WHERE idempotency_key     [idempotency check — read inside tx]
│       │   └─ if duplicate → skip, continue
│       │
│       ├─ validate: clock_skew / op_not_supported / table_not_allowed
│       │
│       ├─ client.query("SAVEPOINT op_apply")           [per-op nested savepoint]
│       │   └─ applyFn(client, op, userId, clientTs)    [domain apply — inside savepoint]
│       │       └─ on throw:
│       │           client.query("ROLLBACK TO SAVEPOINT op_apply")  → status="rejected"
│       ├─ client.query("RELEASE SAVEPOINT op_apply")   [idempotent after rollback]
│       │
│       └─ INSERT INTO sync_op_log (status, reject_reason, ...)    [always — records outcome]
│
├─ client.query("COMMIT")   ← success path: all op-log inserts + applied rows committed atomically
│
└─ on outer throw:
    client.query("ROLLBACK")   ← whole batch rolled back (nothing persisted)
│
client.release()   [finally block — always executed]
```

**Key properties:**

- One `BEGIN`/`COMMIT` wraps the entire batch — all ops in a single push request are committed atomically or not at all.
- Per-op failures use `SAVEPOINT` so a single rejected op does not poison the whole transaction; the op-log INSERT still records the rejection.
- `client.release()` is in a `finally` block — connection is never leaked even on outer exception.
- Connection drop mid-batch → outer `ROLLBACK` fires (or connection pool detects broken connection); no half-committed batch can reach the DB. The idempotency check on retry ensures re-push is safe.

### Handler: `syncV2Pull` (GET /api/v2/sync/pull)

```
pool.query(...)   [direct pool — no explicit BEGIN/COMMIT]
│
└─ SELECT sync_op_log
   WHERE user_id = $1 AND id > $2 AND status = 'applied'
   AND origin_device_id IS DISTINCT FROM $3
   ORDER BY id ASC LIMIT $4
```

**Key properties:**

- Read-only SELECT; no transaction wrapper needed (auto-commit, snapshot isolation from Postgres default).
- No `pool.connect()` / `client.release()` — `pool.query()` acquires and releases a connection automatically.
- Cursor-based pagination (`id > since`, returns `next_cursor`).

### DLQ-row TTL note

The dead-letter queue (DLQ) is **client-side only** (SQLite `sync_op_outbox` table, status `'dead_letter'`). Key findings from code trace:

- **No TTL**: `dead_letter` rows are **never automatically purged**. `purgeSyncOpOutboxForUser()` (`packages/db-schema/src/sqlite/syncOpOutboxPurge.ts`) deletes only `status='pending'` rows on logout; terminal rows (`rejected`, `dead_letter`, `quarantined`) are intentionally preserved for forensic value.
- **Recovery**: `recoverDeadLetter({ all: true })` (`packages/db-schema/src/sqlite/syncOpOutboxRecover.ts`) moves `dead_letter` → `pending` and re-queues. Both `apps/web` and `apps/mobile` singleton call this on reconnect (`syncEngineWriter.ts:176` / `syncEngineWriter.ts:185`).
- **Implication**: On a device that never reconnects cleanly, the DLQ can grow unbounded. A TTL-based cleanup job (e.g., purge `dead_letter` rows older than N days) is not implemented. This is a **future audit item** — risk is low for typical mobile churn but warrants a Grafana panel tracking dead-letter bucket size.
- **Server-side**: `sync_op_log` (server Postgres) has no DLQ concept; server-side rejections are recorded inline (status `'rejected'`). No server-side TTL purge exists in `syncV2.ts` — retention-job referenced as comment in `apps/server/src/modules/sync/audit.ts:152` but not implemented in this module.

## Cross-refs

- **Code:** [`apps/server/src/modules/sync/syncV2.ts`](../../apps/server/src/modules/sync/syncV2.ts) (3099 LOC).
- **ADR:** [`docs/adr/0047-cloudsync-v1-410-gone.md`](../adr/0047-cloudsync-v1-410-gone.md) (sunset Amendment 2026-04-27).
- **Initiative:** [`docs/initiatives/0003-sync-v2-rollout-and-v1-sunset.md`](../initiatives/0003-sync-v2-rollout-and-v1-sunset.md) (Phases 1-6 done; Phase 7 wiring closed 2026-05-15).
- **Storage roadmap:** [`docs/planning/storage-roadmap.md`](../planning/storage-roadmap.md) (Stage 8/9 dual-write — взаємозалежність зі sync-conflict-resolution).
- **PR plan:** [`docs/planning/pr-plan-backend-perf-2026-05.md` §PR-12](../planning/pr-plan-backend-perf-2026-05.md).
- **Synthesis:** [`docs/audits/2026-05-15-deep-audit-state-of-repo.md`](./archive/2026-05-15-deep-audit-state-of-repo.md) (state-of-repo snapshot — D1-D4 trackers).
