# Sync Engine Deep Roast — `apps/server/src/modules/sync/syncV2.ts` (stub)

> **Last validated:** 2026-05-15 by Claude Opus 4.7 (external session — pr-plan-backend-perf PR-12 scoping stub). **Next review:** 2026-08-11.
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

## Cross-refs

- **Code:** [`apps/server/src/modules/sync/syncV2.ts`](../../apps/server/src/modules/sync/syncV2.ts) (3099 LOC).
- **ADR:** [`docs/adr/0047-cloudsync-v1-410-gone.md`](../adr/0047-cloudsync-v1-410-gone.md) (sunset Amendment 2026-04-27).
- **Initiative:** [`docs/initiatives/0003-sync-v2-rollout-and-v1-sunset.md`](../initiatives/0003-sync-v2-rollout-and-v1-sunset.md) (Phases 1-6 done; Phase 7 wiring closed 2026-05-15).
- **Storage roadmap:** [`docs/planning/storage-roadmap.md`](../planning/storage-roadmap.md) (Stage 8/9 dual-write — взаємозалежність зі sync-conflict-resolution).
- **PR plan:** [`docs/planning/pr-plan-backend-perf-2026-05.md` §PR-12](../planning/pr-plan-backend-perf-2026-05.md).
- **Synthesis:** [`docs/audits/2026-05-15-deep-audit-state-of-repo.md`](./2026-05-15-deep-audit-state-of-repo.md) (state-of-repo snapshot — D1-D4 trackers).
