# SPIKE — Routine module on SQLite v2

> **Last validated:** 2026-05-02 by @Skords-01. **Next review:** 2026-05-16.
> **Status:** Active

> **Owner:** @Skords-01 · **Created:** 2026-05-02 ·
> **Roadmap reference:** [`docs/planning/storage-roadmap.md` PR #022](../../planning/storage-roadmap.md#stage-3--spike-на-routine) ·
> **Branch:** `devin/1777743313-spike-routine-sqlite-v2` ·
> **Time-box:** 2 weeks (window opens 2026-05-02).

This note tracks decisions and learnings for the Stage 3 SPIKE — the
last hard decision gate before committing to per-module SQLite migration
in Stage 4.

## Goal

> «Demo: toggle звички з web + mobile паралельно → обидва девайси у sync
> без конфлікту.» — storage-roadmap.md, PR #022.

Concretely:

- Routine module reads and writes from a local SQLite DB on both web
  (`sqlite-wasm` + OPFS-SAH) and mobile (`expo-sqlite`).
- Mutations enqueue an op into the durable client outbox.
- A background loop drains the outbox to `POST /v2/sync/push` and pulls
  remote ops via `GET /v2/sync/pull?since=…`, applying them with LWW
  conflict resolution.
- Behind feature flag `feature.routine.sqlite_v2` (default `false`).

## What this PR ships

| Surface                                                                                          | Status      | Notes                                                           |
| ------------------------------------------------------------------------------------------------ | ----------- | --------------------------------------------------------------- |
| Drizzle SQLite schema (`routine_entries`, `routine_streaks`, `sync_op_outbox`, `sync_op_cursor`) | Done        | `packages/db-schema/src/sqlite/routine.ts`                      |
| Bundled client migration (`001_routine_spike.sql`) + manifest                                    | Done        | Runs through `runMigrations` from `@sergeant/db-schema/migrate` |
| Web SPIKE library (repo + sync engine + sqlite-wasm adapter)                                     | Done        | `apps/web/src/modules/routine/lib/sqliteSpike/`                 |
| Mobile SPIKE library (mirror + expo-sqlite adapter)                                              | Done        | `apps/mobile/src/modules/routine/lib/sqliteSpike/`              |
| Web feature flag `feature.routine.sqlite_v2`                                                     | Done        | Registered in `apps/web/src/core/lib/featureFlags.ts`           |
| Unit tests (web vitest + mobile jest + db-schema vitest)                                         | Done        | 24 tests total — see "Tests" below                              |
| Dev-only UI panel (web + mobile) for manual demo                                                 | **Pending** | Tracked as a follow-up in this same SPIKE branch                |
| Decision-gate measurements (bundle, latency, multi-device)                                       | **Pending** | Cannot run until UI panel lands                                 |

The library code is intentionally split between platforms (≈500 lines
duplicated) so each app keeps its own `sqliteSpike/` directory. This is
acknowledged tech debt for a time-boxed SPIKE — Stage 5 (PR #040)
promotes the library to a shared workspace package once the design has
settled.

## Architecture summary

```
routine UI (RoutineApp / pages/*) ──┐
                                    │ feature.routine.sqlite_v2 = on
                                    ▼
                           routine.lib.sqliteSpike
                          ┌───────────────────────┐
                          │   repo  (raw SQL)     │
                          │  ─ upsertRoutineEntry │
                          │  ─ softDeleteEntry    │
                          │  ─ listActiveEntries  │
                          │  ─ enqueueOutboxOp    │
                          │  ─ applyPulledOp      │
                          └─────────┬─────────────┘
                                    │
                          ┌─────────┴─────────────┐
                          │  syncEngine           │
                          │  ─ pushPendingOutbox  │ → POST /v2/sync/push
                          │  ─ pullSince          │ ← GET  /v2/sync/pull
                          │  ─ recordCompletion   │
                          │  ─ deleteCompletion   │
                          └─────────┬─────────────┘
                                    │
                          ┌─────────┴─────────────┐
                          │  platform adapter      │
                          │  ─ sqlite-wasm  (web)  │
                          │  ─ expo-sqlite (mobile)│
                          │  ─ better-sqlite3 (test)│
                          └─────────┬─────────────┘
                                    │
                                  SQLite DB
                          (one connection per app instance)
```

Key invariants:

1. **Idempotency.** Every outbox row carries an `idempotency_key` (UUID
   v4 by default, base64-url-safe fallback). The server uses it to
   deduplicate replays — see `apps/server/src/modules/sync/syncV2.ts`.
2. **LWW.** `applyPulledRoutineEntry` compares the incoming `updated_at`
   (ISO-8601 with offset) against the local row's `updated_at` and
   skips application if the local copy is newer or equal.
3. **Origin filter.** `pullSince` passes `originDeviceId` through to
   the server so we don't echo our own pushed ops back to ourselves.
4. **Outbox triage.** Rejected pushes (`status: "rejected"` + reason)
   are kept in `sync_op_outbox` with `status='rejected'` so an operator
   can inspect them later — they no longer appear in
   `listPendingOutboxOps`.

The repo and sync engine are written against a `SqliteMigrationClient`
shape (`{exec, run, all}`) so the same source unit-tests against
`better-sqlite3` and runs against `sqlite-wasm` / `expo-sqlite` in
production. No Drizzle types leak into the SPIKE library — that
deliberately mirrors how Stage 5's hardened sync engine will sit one
layer below the typed Drizzle client.

## Tests (this PR)

| Suite                                                                                | Count | Coverage                                                                                                                                   |
| ------------------------------------------------------------------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/db-schema` schema-roundtrip (vitest)                                       | 3     | Migration runs idempotently; tables present; outbox UNIQUE on `idempotency_key`.                                                           |
| `apps/web/src/modules/routine/lib/sqliteSpike/__tests__/repo.test.ts` (vitest)       | 9     | upsert / soft-delete / list lifecycle, outbox enqueue+pop+reject, cursor, LWW conflict guard, malformed payload rejection.                 |
| `apps/web/src/modules/routine/lib/sqliteSpike/__tests__/syncEngine.test.ts` (vitest) | 6     | push drain, push reject triage, pull apply + cursor persist, origin-device echo filter, multi-device end-to-end, LWW with stale pulled op. |
| `apps/mobile/src/modules/routine/lib/sqliteSpike/__tests__/repo.test.ts` (jest)      | 6     | Mirror of the web repo tests + the `createExpoSqliteRawClient` adapter forwarder.                                                          |

All 24 tests pass locally on Node 22.12 / pnpm 9.15. Total runtime
≈3.5 s.

## Decision-gate metrics — pending

The kill criteria from storage-roadmap.md PR #022 are reproduced below
for convenience. Numbers will be filled in once the dev-only UI panel
is wired and a manual demo is run from a real device pair.

| Metric                            | Pass     | Fail                                | Measured |
| --------------------------------- | -------- | ----------------------------------- | -------- |
| Initial bundle (web)              | ≤ +5 KB  | ≥ +50 KB                            | TBD      |
| First open SQLite latency         | ≤ 200 ms | ≥ 800 ms                            | TBD      |
| OPFS на Safari iOS 16.4+          | works    | doesn't load                        | TBD      |
| Multi-device toggle conflict-free | yes      | manual conflict resolution required | TBD      |
| Vercel bundle build time          | ≤ +30s   | ≥ 2 min                             | TBD      |

Recording method (planned):

- **Bundle.** `pnpm --filter @sergeant/web build` with the flag default
  off → `dist/` size, then with the flag forced on at compile time →
  diff. We expect the SPIKE library to tree-shake when the flag is
  off because all SPIKE call sites are gated by a runtime
  `if (flag) {…}` plus dead-code elimination through Vite's prod
  build. If tree-shaking misbehaves, the `feature.routine.sqlite_v2`
  registry entry has a `removal date` of 2026-07-31 so we can simply
  delete the SPIKE code rather than ship dead bytes.
- **First-open latency.** Wrap `migrateRoutineSpike` + first
  `listActiveRoutineEntries` in `performance.now()` brackets; surface
  the number through the dev panel.
- **iOS Safari.** Test on a real device running iOS 16.4+ and on
  Capacitor mobile-shell (WKWebView). Existing OPFS-SAH detection
  fallback to `kvvfs` already covers older iOS — see
  `apps/web/src/core/db/sqlite.ts`.
- **Multi-device.** Run two browser tabs (with distinct `originDeviceId`)
  - one mobile build pointing at the same staging account; toggle a
    habit on each; confirm `pullSince` converges and no manual conflict
    resolution is shown.
- **Vercel build time.** Compare the last 3 main-branch builds (≈40 s
  baseline as of 2026-05-02) against the next build that includes
  this PR.

## What we'll learn (regardless of pass/fail)

1. Whether `runMigrations` on a real OPFS-SAH connection succeeds
   without blocking the main thread for noticeable time. If it does,
   we already need to move it off the main thread before Stage 4.
2. Whether `originDeviceId` filtering on the pull path is sufficient
   or whether we need a stronger "echo" guard (e.g. tracking the last
   `op_id` we pushed and refusing to apply ops with that id back).
3. Whether the LWW guard's "ignore-on-equal-timestamps" rule is
   sufficient for routine, or whether routine specifically needs CRDT
   merge logic (counted per-day completions etc).

## Follow-up SPIKE work (in this same branch / PR)

- [ ] Wire web dev-only panel under Settings → Експериментальне.
- [ ] Wire mobile dev-only panel into the existing DEV menu.
- [ ] Run decision-gate measurements on hardware.
- [ ] Update this document with measured values + go/no-go decision.

## If we decide STOP

If the gate fails:

1. Remove the feature flag entry from `apps/web/src/core/lib/featureFlags.ts`.
2. Delete `apps/web/src/modules/routine/lib/sqliteSpike/` and
   `apps/mobile/src/modules/routine/lib/sqliteSpike/`.
3. Keep `packages/db-schema/src/sqlite/routine.ts` and the migration
   bundle, since they cost nothing and unblock a later resumption.
4. Document blockers in this file and link to it from
   `docs/planning/storage-roadmap.md` Stage 3.
5. Fall back to Stage 1 plan B: continue on whole-blob LWW + custom
   per-row diffing on the server.
