# SPIKE — Routine module on SQLite v2

> **Last validated:** 2026-05-02 by @Skords-01. **Next review:** 2026-05-16.
> **Status:** Active — automated gates PASS; awaiting hardware confirmation
> (iOS Safari 16.4+, multi-device toggle).

> **Owner:** @Skords-01 · **Created:** 2026-05-02 ·
> **Roadmap reference:** [`docs/planning/storage-roadmap.md` PR #022](../../planning/storage-roadmap.md#stage-3--spike-на-routine) ·
> **Branch:** `devin/1777743313-spike-routine-sqlite-v2` (library) →
> `devin/1777752068-fix-adr-0031-readme-index` and `devin/1777753778-strict-ts-docs-sync`
> for follow-up panel landings → this branch (`devin/1777755997-close-routine-sqlite-spike`)
> for closure ·
> **Time-box:** 2 weeks (window opened 2026-05-02).

This note tracks decisions and learnings for the Stage 3 SPIKE — the
last hard decision gate before committing to per-module SQLite migration
in Stage 4.

## What is this SPIKE? (TL;DR)

A SPIKE is a **time-boxed proof of concept**: 2 weeks of focused work
to answer one question — _can the routine module run on local SQLite
on web and mobile, and stay in sync between devices, without paying
unacceptable bundle / latency / build-time cost?_

It is **not** the final implementation. The code lives behind the
feature flag `feature.routine.sqlite_v2` (default `false`) and is
explicitly disposable — the "If we decide STOP" section at the bottom
spells out the rollback. Until the gate is closed and the flag flipped
on, every routine read/write still goes through the existing
whole-blob `/v1/sync` path; the SPIKE only writes a parallel SQLite
mirror inside a runtime `if (flag) {…}` branch.

The SPIKE answers a specific go/no-go question for **Stage 3** of
[`docs/planning/storage-roadmap.md`](../../planning/storage-roadmap.md#stage-3--spike-на-routine).
A "go" signal unlocks Stage 4 (per-module migration of the rest of the
app — habits, scratchpad, focus, settings — onto the same pattern).
A "no-go" signal makes us delete the SPIKE library and stop on
Stage 1+2 (Drizzle + foundations already shipped) without burning
Stage 4 effort.

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

| Surface                                                                                          | Status                | Notes                                                                                                                  |
| ------------------------------------------------------------------------------------------------ | --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Drizzle SQLite schema (`routine_entries`, `routine_streaks`, `sync_op_outbox`, `sync_op_cursor`) | Done                  | `packages/db-schema/src/sqlite/routine.ts`                                                                             |
| Bundled client migration (`001_routine_spike.sql`) + manifest                                    | Done                  | Runs through `runMigrations` from `@sergeant/db-schema/migrate`                                                        |
| Web SPIKE library (repo + sync engine + sqlite-wasm adapter)                                     | Done                  | `apps/web/src/modules/routine/lib/sqliteSpike/`                                                                        |
| Mobile SPIKE library (mirror + expo-sqlite adapter)                                              | Done                  | `apps/mobile/src/modules/routine/lib/sqliteSpike/`                                                                     |
| Web feature flag `feature.routine.sqlite_v2`                                                     | Done                  | Registered in `apps/web/src/core/lib/featureFlags.ts`                                                                  |
| Unit tests (web vitest + mobile jest + db-schema vitest)                                         | Done                  | 24 tests total — see "Tests" below                                                                                     |
| Dev-only web panel (`Settings → «Routine SPIKE — dev panel»`)                                    | Done                  | Landed in commit `501a7b74` (`feat(web): routine SPIKE dev panel у Settings → Експериментальне`)                       |
| Dev-only mobile panel (`Settings → Акаунт → «Routine SPIKE — dev panel»`)                        | Done                  | Landed in commit `22a0b249` (`feat(mobile): routine SPIKE dev panel у Settings → Акаунт`)                              |
| Bundle-delta gate (web)                                                                          | **PASS** (this PR)    | 0 KB initial-bundle delta — SPIKE library + `vendor-sqlite` chunk both lazy-loaded only when the flag is on. See below |
| Build-time gate (CI / Vercel)                                                                    | **PASS** (this PR)    | Local `pnpm --filter @sergeant/web build` ≈ 19 s vs ≈ 40 s historical baseline. See below                              |
| First-open SQLite latency gate (≤ 200 ms)                                                        | **Hardware-required** | Dev panel surfaces the metric; needs operator click on a real device. Runbook below                                    |
| OPFS на iOS Safari 16.4+                                                                         | **Hardware-required** | iOS-only check; no automated path                                                                                      |
| Multi-device toggle conflict-free                                                                | **Hardware-required** | Two devices + staging account                                                                                          |

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

## Decision-gate metrics

The kill criteria from storage-roadmap.md PR #022, with measured values
from this closure pass.

| Metric                            | Pass     | Fail                                | Measured                                          | Status                                              |
| --------------------------------- | -------- | ----------------------------------- | ------------------------------------------------- | --------------------------------------------------- |
| Initial bundle (web)              | ≤ +5 KB  | ≥ +50 KB                            | **0 KB** in `index-*.js` / `RoutineApp-*.js`      | **PASS**                                            |
| First-open SQLite latency         | ≤ 200 ms | ≥ 800 ms                            | dev-panel ready; needs operator click on hardware | **Hardware-pending**                                |
| OPFS на Safari iOS 16.4+          | works    | doesn't load                        | dev-panel ready; needs iOS 16.4+ device           | **Hardware-pending**                                |
| Multi-device toggle conflict-free | yes      | manual conflict resolution required | dev-panel ready; needs 2 devices vs staging       | **Hardware-pending**                                |
| Vercel bundle build time          | ≤ +30s   | ≥ 2 min                             | local proxy ≈ 19 s (baseline ≈ 40 s)              | **PASS** (Vercel CI run will confirm absolute time) |

### What each metric actually measures

Five numbers, five distinct risks. Every threshold answers a different
"are we sure this scales out of routine into the rest of the app?"
question.

**1. Initial bundle delta (web): ≤ +5 KB pass, ≥ +50 KB fail.**
Measures **tree-shaking effectiveness when the flag is off**. The
SPIKE library compiles into the web bundle even though no caller
reaches it at runtime (because the flag default is `false`). If Vite's
prod build cannot dead-code-eliminate the SPIKE through the
`if (flag) {…}` gates, every user — including the >99 % who will
never see the SPIKE — pays the download cost. +5 KB gz is "noise
floor of one helper file"; +50 KB gz is "we're actually shipping the
whole sqlite-wasm + sync engine to everyone". Stage 4 multiplies this
across ≥4 modules, so a fail here would compound badly.

**2. First-open SQLite latency: ≤ 200 ms pass, ≥ 800 ms fail.**
Measures **migration runner + first connection time on a real
OPFS-SAH connection** — i.e. the user-visible cold-start cost the
first time someone enables the flag. Wrapped from
`migrateRoutineSpike()` through the first `listActiveRoutineEntries()`
call. 200 ms ≈ "one frame at 60 Hz times a few" — perceptible but
not annoying. 800 ms ≈ "a full second blocking the routine screen on
every cold start"; that would force us to move migrations off the
main thread before Stage 4, which is its own multi-PR project.

**3. OPFS на Safari iOS 16.4+: works pass, doesn't load fail.**
Measures **platform support reality on the riskiest target**.
OPFS-SAH is the only SQLite-WASM VFS that gives us synchronous
persistence on iOS Safari, and Apple shipped it in 16.4 (March 2023).
Older iOS already falls back to the in-memory `kvvfs` adapter
(`apps/web/src/core/db/sqlite.ts`), but if 16.4+ itself does not
load OPFS reliably (e.g. private-mode quirks, Capacitor WKWebView
restrictions) then the whole "local-first" thesis collapses on
mobile-Safari users. "Works" here means: opens, persists, reloads —
not just compiles.

**4. Multi-device toggle conflict-free: yes pass, manual fail.**
Measures **sync correctness end-to-end with the real LWW conflict
resolver, not the unit-test fake**. Two devices (web tab + mobile
build), each with its own `originDeviceId`, toggle the same habit
within the same minute against staging. Pass = both converge to the
same state via `pullSince` without showing the user a "which version
do you want to keep?" dialog. Fail = the LWW guard
(`updated_at` comparison) lets through inconsistent state we have to
patch up by hand. This is the only metric that is binary by design —
sync is either correct or it isn't; "mostly correct" doesn't ship.

**5. Vercel build time: ≤ +30 s pass, ≥ 2 min fail.**
Measures **CI / deploy-pipeline impact** of dragging sqlite-wasm
loaders, the migration manifest, and the new Drizzle SQLite schema
through the prod build. Baseline is the last 3 main-branch builds
(≈40 s as of 2026-05-02). +30 s is "another tsc + bundle pass" —
acceptable. +2 min is "deploy feedback loop has visibly slowed" —
unacceptable, because Stage 4 will keep adding modules and the cost
compounds linearly.

### Measurement evidence — bundle delta (PASS)

The SPIKE-library code is **fully isolated** behind
`React.lazy(() => import("…/RoutineSpikeDevPanel"))` in
`RoutineSpikeSection.tsx`, and the `RoutineSpikeDevPanel` itself is the
only place that imports `apps/web/src/modules/routine/lib/sqliteSpike/`.
That means Rollup splits the SPIKE library plus its sqlite-wasm
adapter into the lazy chunk for the dev panel, and the sqlite-wasm
vendor module ships in a separate `vendor-sqlite-*.js` chunk that is
only fetched when the user actually opens the panel and clicks
«Init / migrate».

From `dist/assets/` after a clean `pnpm --filter @sergeant/web build`:

| Chunk                           | Raw KB |  Gzip KB | Loaded when                                      |
| ------------------------------- | -----: | -------: | ------------------------------------------------ |
| `index-*.js` (initial)          |  554.1 |    167.8 | always — initial paint                           |
| `RoutineApp-*.js`               |   50.4 |     15.9 | when user opens the routine module               |
| `RoutineSpikeDevPanel-*.js`     |   24.0 |      8.0 | only when flag is on AND Settings page is open   |
| `vendor-sqlite-*.js`            |  290.6 |     87.1 | only when the dev panel calls `getSqliteDb()`    |
| `sqlite3-worker1-*.js`          |  217.5 |     ~ 60 | only when the worker spawns inside the dev panel |
| `sqlite3-opfs-async-proxy-*.js` |   11.7 |    ~ 4.5 | only when the worker spawns                      |
| `sqlite3-*.wasm`                |  859.7 | (binary) | only when the worker spawns                      |

Greps over the built artefacts confirm the isolation:

- `rg "sqliteSpike|SqliteSpike|sync_op_outbox" dist/assets/index-*.js`
  → 0 hits.
- `rg "sqliteSpike|SqliteSpike|sync_op_outbox" dist/assets/RoutineApp-*.js`
  → 0 hits.
- `rg "sqliteSpike|SqliteSpike|sync_op_outbox" dist/assets/RoutineSpikeDevPanel-*.js`
  → 9 hits.

So: **a user who never enables the flag downloads exactly 0 bytes of
SPIKE code**. The Stage 3 «≤ +5 KB initial-bundle delta when the flag
is off» kill criterion is satisfied with margin.

### Measurement evidence — Vercel build time (PASS, provisional)

Local proxy on this machine (Node 22.12, pnpm 9.15.1, warm pnpm cache):

```
$ START=$(date +%s) && pnpm --filter @sergeant/db-schema build && \
  pnpm --filter @sergeant/web build && END=$(date +%s) && \
  echo "BUILD_DURATION_SEC=$((END-START))"
…
✓ built in 17.00s
…
BUILD_DURATION_SEC=19
```

That is **comfortably below** the historical ≈ 40 s baseline
(documented in storage-roadmap.md PR #022 as the last 3 main-branch
builds). Vercel CI will run on cold cache and should land within the
«≤ +30 s vs baseline» pass threshold; the next main-branch deploy
after this PR confirms the absolute number.

### Recording method (hardware-only metrics)

Three gates can only be measured on real targets. The dev panel is
already wired and surfaces every number we need; an operator just
needs to click through it on the relevant device.

#### Operator runbook

**Web (any Chromium / Firefox 16+ / Safari 16.4+):**

1. `pnpm --filter @sergeant/db-schema build && pnpm --filter @sergeant/web build && pnpm preview`
   — серверится з production-bundle на `http://localhost:4173`. Open
   the URL and sign in (or use a staging deployment behind
   `https://staging.<host>`).
2. Settings → «Експериментальне» → flip
   `feature.routine.sqlite_v2` to **on**.
3. Scroll to «Routine SPIKE — dev panel» and click **Init / migrate**.
   - The header surfaces `VFS` (expected: `opfs-sahpool` on
     Chromium / Safari 16.4+, fallback `kvvfs` on older Safari /
     non-isolated contexts), `crossOriginIsolated` (expected: `true`
     on Vercel post-PR #016) and **Init latency**.
   - Record the latency number into the **First-open SQLite latency**
     row of the gate table above. Pass if ≤ 200 ms.
4. Click **Запис тренування (insert)** → **Push outbox → /v2/sync/push**.
   The log line shows local-write latency and the push round-trip;
   useful sanity, not gated.

**Mobile (Expo dev-client, EAS Build):**

1. `pnpm --filter @sergeant/mobile start` (или TestFlight / internal
   track build).
2. Settings → «Експериментальне» → flip
   `feature.routine.sqlite_v2` to on. Scroll up to «Акаунт» →
   «Routine SPIKE — dev panel». Click **Init**, **Запис**,
   **Push**, **Pull** — same surfaces as web.

**iOS Safari 16.4+ (OPFS-SAH check):**

- Open the staging URL in Safari on a real device running iOS 16.4 or
  newer. Repeat the web runbook. Pass = `VFS` reads `opfs-sahpool`
  AND **Init / migrate** completes without an error in the panel.
  Older iOS (< 16.4) is expected to fall back to `kvvfs` — that is
  acceptable per `apps/web/src/core/db/sqlite.ts` and is _not_ a fail
  for this gate.

**Multi-device toggle:**

1. Sign in to the same Better Auth account on two devices (e.g. web
   tab + iOS Safari, or web tab + Expo build), both pointing at
   staging.
2. Enable the flag and click **Init** on both.
3. On device A: **Запис**, then **Push**.
4. On device B: **Pull**. Confirm the log line shows
   `applied=1 conflicts=0` and a fresh entry is visible (re-running
   **Init / migrate** triggers a `listActiveRoutineEntries` so the
   row count goes up by one).
5. Within the same minute, on device B do **Запис** + **Push**, then
   on device A do **Pull**. Confirm convergence — both devices end
   up with the same two rows in their local SQLite, no manual conflict
   prompt.

A failure on the multi-device gate looks like: device A's pull shows
`conflicts ≥ 1` for an op that was actually compatible, OR the user is
asked to manually pick a winner. Either is a hard fail per the gate
definition («yes pass, manual fail»).

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

## Follow-up SPIKE work

- [x] Wire web dev-only panel under Settings → Експериментальне.
      _(Landed in `501a7b74` `feat(web): routine SPIKE dev panel у Settings → Експериментальне`.)_
- [x] Wire mobile dev-only panel into the existing DEV menu.
      _(Landed in `22a0b249` `feat(mobile): routine SPIKE dev panel у Settings → Акаунт`.)_
- [x] Run automated decision-gate measurements (bundle delta, build time).
      _(This PR — both PASS, evidence above.)_
- [ ] Run hardware decision-gate measurements (first-open latency on
      Chromium + iOS Safari 16.4+, multi-device toggle vs staging).
      _(Operator runbook above.)_
- [ ] Replace the «Hardware-pending» rows in the gate table with the
      measured numbers; flip status to «PASS» / «FAIL» per row.
- [ ] Record the final go/no-go decision in the next section.

## Preliminary go/no-go

Given the automated gates pass with margin (bundle delta = 0 KB,
build time well under +30 s budget) and the dev panel is now wired on
both platforms, the **default outcome is GO** — provided the three
hardware-pending rows do not flip to FAIL during the operator pass.

The hardware gates are:

1. First-open SQLite latency on representative client devices.
2. OPFS-SAH actually loading on iOS Safari 16.4+.
3. Multi-device toggle converging without manual conflict resolution.

These are routine checks against the dev panel; none of them require
further engineering work in this SPIKE. If any of them fails, the
operator records the failure mode in this file and we revert to the
«If we decide STOP» path below — the underlying Stage 2 foundations
(Drizzle, sqlite-wasm, expo-sqlite, op-log endpoints) all stay in
place because they have value beyond this SPIKE.

When the operator pass is complete, replace this section with a
definitive go/no-go statement and link to the artefacts (screenshots
of the dev panel with measured numbers, multi-device convergence log,
etc.). Until then, treat the SPIKE as **conditionally GO**:

> Stage 4 planning may proceed as long as the hardware gates have not
> reported a fail. Production rollout (`feature.routine.sqlite_v2=on`
> by default) MUST wait until all three hardware gates report PASS.

### Stage 4 progress (routine module)

| PR   | Title                                      | Status            |
| ---- | ------------------------------------------ | ----------------- |
| #024 | Dual-write LS↔SQLite                       | ✅ Merged         |
| #025 | Cut-over reads to SQLite, deprecate LS     | ✅ Merged (#1407) |
| #026 | Remove LS path, drop `module_data.routine` | ✅ Merged (#1412) |

Routine module migration на SQLite завершена. Completions читаються
з SQLite, LS blob більше не cloud-synced. Після deploy потрібно:
`DELETE FROM module_data WHERE module = 'routine'` (server-side).

## If we decide STOP

If the gate fails:

1. Remove the feature flag entry from `apps/web/src/core/lib/featureFlags.ts`.
2. Delete `apps/web/src/modules/routine/lib/sqliteSpike/` and
   `apps/mobile/src/modules/routine/lib/sqliteSpike/`.
3. Delete the dev panels (`apps/web/src/modules/routine/components/RoutineSpikeDevPanel.{tsx,test.tsx}`,
   `apps/web/src/core/settings/RoutineSpikeSection.{tsx,test.tsx}`,
   plus mobile mirrors) and their `HubSettingsPage` imports.
4. Keep `packages/db-schema/src/sqlite/routine.ts` and the migration
   bundle, since they cost nothing and unblock a later resumption.
5. Keep the server-side `routine_entries` / `routine_streaks` PG
   tables and the `/v2/sync/push` + `/v2/sync/pull` endpoints — they
   are also independent of the SPIKE outcome.
6. Document blockers in this file and link to it from
   `docs/planning/storage-roadmap.md` Stage 3.
7. Fall back to Stage 1 plan B: continue on whole-blob LWW + custom
   per-row diffing on the server.
