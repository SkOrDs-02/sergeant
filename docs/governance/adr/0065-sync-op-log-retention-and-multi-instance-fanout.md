# ADR-0065: Sync operation-log retention and fan-out

- **Status:** Accepted
- **Date:** 2026-06-07
- **Last validated:** 2026-09-04 by @codex
- **Next review:** 2027-03-04
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:** [ADR-0047](./0047-cloudsync-v1-410-gone.md), [ADR-0074](./0074-hosting-hetzner-coolify.md), [`apps/server/src/modules/sync/syncV2Stream.ts`](../../../apps/server/src/modules/sync/syncV2Stream.ts), [`packages/db-schema/src/sqlite/`](../../../packages/db-schema/src/sqlite/)

## Decision

The server `sync_op_log` is an append-only replay source for sync v2. The
client keeps its own SQLite outbox and applies explicit lifecycle/TTL rules to
stale, rejected, or completed operations. Server stream delivery currently
uses an in-process emitter, which is valid only for the current single-instance
deployment.

Multi-instance fan-out and server-side log compaction are not shipped by this
ADR. They are explicit follow-up work with separate correctness requirements:

- fan-out needs a durable cross-instance transport and reconnect semantics;
- retention needs a cursor/snapshot compatibility proof, not a blind delete;
- both changes need operational metrics and failure/replay tests.

## Consequences

Do not describe client TTL as server retention, or in-process SSE as a
multi-replica guarantee. Scaling the API horizontally or deleting old log rows
is a trigger to revisit this ADR before changing deployment/data policy.
