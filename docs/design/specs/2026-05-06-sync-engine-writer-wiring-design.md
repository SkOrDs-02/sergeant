# Sync Engine Writer Wiring Design

> **Last validated:** 2026-05-13 by Codex. **Next review:** 2026-08-11.
> **Status:** Active

## Goal

Close the remaining Stage 5 storage-roadmap item: wire the already-landed sync v2 push-loop, scheduler, reconnect flush adapter, outbox status reader, and dead-letter recovery helper into the web runtime without removing cloudSync v1 yet.

## Scope

- Add web runtime wiring that creates one sync v2 writer engine per browser session.
- Start a periodic push scheduler after app boot.
- Flush immediately when the browser comes back online or becomes visible.
- Provide a push-on-enqueue hook so newly queued outbox rows do not wait for the next interval.
- Emit Sentry breadcrumbs for successful ticks and captured errors for failures without including row payloads.
- Expose a small status/recovery surface for dev/support UI: status counts and "recover all dead-letter rows, then flush".
- Update `docs/planning/storage-roadmap.md` so Stage 5 no longer lists the writer wiring as outstanding once the code is verified.

## Out Of Scope

- Stage 6 Railway/Grafana/Sentry infrastructure provisioning.
- Stage 7 cleanup: dropping `module_data`, deleting cloudSync v1, or removing KVStore/localStorage allowlists.
- Mobile sync v2 writer runtime if the mobile SQLite outbox runtime is not wired to the same client database surface yet.

## Architecture

The application layer owns dependency injection. `packages/api-client` remains independent from `packages/db-schema`; web code composes them:

- `packages/api-client`: `createSyncEnginePushScheduler`, `createSyncEngineFlushOnReconnect`, `runSyncEnginePushOnce` types.
- `packages/db-schema`: `drainSyncOpOutbox`, `markOutboxSuccess`, `markOutboxRetry`, `markOutboxRejected`, `planRetry`, `countOutboxByStatus`, `recoverDeadLetter`.
- `apps/web`: creates the SQLite client, binds the current API client sync v2 push endpoint, starts/stops runtime listeners, and exposes status/recovery helpers.

The runtime is idempotent. Calling `start()` twice does not create duplicate timers or duplicate DOM listeners. Calling `stop()` tears down timers and reconnect listeners. Immediate flushes are fire-and-forget for event listeners but observable through Sentry.

## Data Flow

1. A module queues a sync v2 outbox row through the existing enqueue helpers.
2. The web runtime receives an explicit enqueue notification and calls `scheduler.flushNow()`.
3. The scheduler runs `runSyncEnginePushOnce`.
4. The push loop drains due `sync_op_outbox` rows, pushes to `/api/v2/sync/push`, then advances each row's lifecycle.
5. Status UI reads aggregate counts through `countOutboxByStatus`.
6. Dead-letter retry uses `recoverDeadLetter({ all: true })`, then calls `flushNow()`.

## Error Handling

- Storage-layer failures propagate to the scheduler, then are captured through web Sentry helpers.
- DOM event flush failures are swallowed by the reconnect adapter after reporting, preventing `unhandledrejection`.
- Breadcrumbs include counts only: drained, pushed, retried, rejected. No row data, table row payloads, tokens, or user content.

## Testing

- Unit tests for runtime factory idempotency, scheduler start/stop, reconnect subscription, enqueue-triggered flush, Sentry observer calls, and dead-letter recovery.
- Integration-shaped test using fake deps to prove status counts and recovery call the expected db-schema helpers.
- Targeted package tests for affected web code and existing api-client/db-schema sync v2 suites.
