# Sync Engine Writer Wiring Implementation Plan

> **Last validated:** 2026-05-13 by @andrijvigrav. **Next review:** 2026-08-11.
> **Status:** Active

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the sync v2 writer engine into the web runtime and close the Stage 5 outstanding roadmap item.

**Architecture:** Add an app-level web runtime factory that composes `@sergeant/api-client` scheduler/flush adapters with `@sergeant/db-schema` outbox helpers. Keep cloudSync v1 intact until Stage 7. Expose status and dead-letter recovery through a narrow runtime surface.

**Tech Stack:** TypeScript, React/Vite web app, Vitest, `@sergeant/api-client`, `@sergeant/db-schema`, existing web Sentry bridge.

---

### Task 1: Web Runtime Factory

**Files:**

- Create: `apps/web/src/core/syncEngine/syncEngineWriter.ts`
- Test: `apps/web/src/core/syncEngine/syncEngineWriter.test.ts`

- [ ] **Step 1: Write failing tests**

Create tests that assert:

```ts
it("starts the scheduler and reconnect adapter exactly once", () => {});
it("flushes immediately on enqueue notifications", async () => {});
it("reports tick completions as Sentry breadcrumbs without row payloads", () => {});
it("recovers all dead-letter rows and flushes", async () => {});
it("stops timers and reconnect listeners idempotently", () => {});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm --filter @sergeant/web test -- syncEngineWriter.test.ts`

Expected: FAIL because `syncEngineWriter.ts` does not exist.

- [ ] **Step 3: Implement minimal runtime**

Add a runtime factory with this public surface:

```ts
export interface SyncEngineWriterRuntime {
  start(): void;
  stop(): void;
  flushNow(): Promise<SyncEnginePushResult>;
  notifyEnqueued(): void;
  getStatus(): Promise<SyncOpOutboxStatusCounts>;
  recoverAllDeadLetters(): Promise<RecoverDeadLetterResult>;
}
```

The factory takes injected SQLite client, push function, timer functions, event target, Sentry observers, and interval options. It composes `createSyncEnginePushScheduler`, `createSyncEngineFlushOnReconnect`, and db-schema helpers.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `pnpm --filter @sergeant/web test -- syncEngineWriter.test.ts`

Expected: PASS.

### Task 2: Web Boot Wiring

**Files:**

- Modify: `apps/web/src/main.tsx`
- Create: `apps/web/src/core/syncEngine/singleton.ts`
- Test: `apps/web/src/core/syncEngine/singleton.test.ts`

- [ ] **Step 1: Write failing tests**

Test that the singleton boot:

```ts
it("starts once and returns the same runtime on repeated boot", () => {});
it("does not throw when boot dependencies are unavailable", () => {});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm --filter @sergeant/web test -- singleton.test.ts`

Expected: FAIL because singleton does not exist.

- [ ] **Step 3: Implement singleton and main boot call**

Create a web singleton that constructs runtime once and exports:

```ts
export function bootSyncEngineWriter(): SyncEngineWriterRuntime | null;
export function getSyncEngineWriter(): SyncEngineWriterRuntime | null;
```

Call `bootSyncEngineWriter()` from `main.tsx` after storage migrations and before deferred observability init.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `pnpm --filter @sergeant/web test -- singleton.test.ts`

Expected: PASS.

### Task 3: Status Surface

**Files:**

- Modify: `apps/web/src/core/cloudSync/hook/useSyncStatus.ts`
- Modify: `apps/web/src/core/app/OfflineBanner.tsx`
- Test: `apps/web/src/core/app/OfflineBanner.test.tsx`

- [ ] **Step 1: Write failing tests**

Extend existing tests so dead-letter count appears when the sync v2 runtime reports dead-letter rows, and retry action calls `recoverAllDeadLetters()`.

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm --filter @sergeant/web test -- OfflineBanner.test.tsx`

Expected: FAIL because the old hook only reads legacy dirty/queue counts.

- [ ] **Step 3: Implement minimal status bridge**

Extend `useSyncStatus` to include optional sync v2 counts when the runtime exists. Keep legacy fields unchanged.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `pnpm --filter @sergeant/web test -- OfflineBanner.test.tsx`

Expected: PASS.

### Task 4: Roadmap Update And Verification

**Files:**

- Modify: `docs/planning/storage-roadmap.md`

- [ ] **Step 1: Update roadmap**

Move Stage 5 writer wiring from Outstanding to landed/local-complete notes with the implementation file paths.

- [ ] **Step 2: Run targeted verification**

Run:

```bash
pnpm --filter @sergeant/web test -- syncEngineWriter.test.ts singleton.test.ts OfflineBanner.test.tsx
pnpm --filter @sergeant/api-client test -- syncV2.pushLoop.test.ts syncV2.pushScheduler.test.ts syncV2.flushOnReconnect.test.ts
pnpm --filter @sergeant/db-schema test -- sqlite-syncOpOutboxStatus.test.ts sqlite-syncOpOutboxRecover.test.ts
```

Expected: PASS.
