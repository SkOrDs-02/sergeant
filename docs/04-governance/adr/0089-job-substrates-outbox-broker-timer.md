# ADR-0089: Background-job substrates

- **Status:** Accepted
- **Date:** 2026-08-28
- **Last validated:** 2026-09-04 by @codex
- **Next review:** 2027-03-04
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:** [ADR-0016](./0016-user-deletion-and-pii-handling.md), [ADR-0065](./0065-sync-op-log-retention-and-multi-instance-fanout.md), [ADR-0074](./0074-hosting-hetzner-coolify.md), [`apps/server/src/lib/jobs/connection.ts`](../../../apps/server/src/lib/jobs/connection.ts), [`apps/server/src/lib/reminders/scheduler.ts`](../../../apps/server/src/lib/reminders/scheduler.ts)

## Decision

Choose the substrate from the durability and scheduling semantics of the job:

1. **BullMQ/Redis** for discrete asynchronous work that benefits from queue
   retry/backoff/delay and has no need for atomic coupling with a Postgres
   transaction. Current examples include auth mail, FTUX drip, and AI-memory
   ingest. The BullMQ connection uses its own Redis settings and fails back only
   where the caller explicitly supports that mode.
2. **Postgres outbox plus a poller/worker** when enqueue must commit atomically
   with a domain write, or when the job is an auditable user-data operation.
   Current examples include Mono enrichment and GDPR cleanup.
3. **In-process timer/sweep** for periodic scans whose idempotency and dedup
   state already live in Postgres. Reminder sweeps and scheduled maintenance
   use this model.
4. **In-memory buffering** is permitted only for lossy/rebuildable batch hints,
   never as the sole source of truth for user data or required work.

Redis is not a durable database in this deployment. A job whose correctness
depends on durable enqueue must use a Postgres outbox even if Redis is
available.

## Consequences

New background work must document its substrate, retry/idempotency boundary,
shutdown behavior, and data-loss behavior. Do not reintroduce n8n as an
implicit scheduler or claim that all jobs share one queue implementation.
