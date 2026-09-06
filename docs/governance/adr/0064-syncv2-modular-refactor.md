# ADR-0064: Per-module sync v2 apply architecture

- **Status:** Accepted
- **Date:** 2026-06-05
- **Last validated:** 2026-09-04 by @codex
- **Next review:** 2027-03-04
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:** [ADR-0065](./0065-sync-op-log-retention-and-multi-instance-fanout.md), [`apps/server/src/modules/sync/`](../../../apps/server/src/modules/sync/), [`packages/dualwrite-core/`](../../../packages/dualwrite-core/)

## Context

The original record was an implementation plan to split a large `syncV2.ts`.
The split is complete: sync v2 keeps routing/registry concerns centralized and
places domain-specific apply behavior beside the owning module. The old staged
file-size plan is not a current architecture decision.

## Decision

Server sync v2 is organized around a central route/operation registry and
per-module apply handlers. Shared parsing, validation, idempotency, operation
metadata, and stream behavior stay in the sync layer; routine, fizruk,
nutrition, and finyk data semantics stay in their owning apply modules.

New sync tables must declare their operation shape and owner, implement
user-scoped/idempotent apply behavior, and include cross-user and replay tests.
Extracting code merely to reach a line-count threshold is not sufficient; the
module boundary must correspond to the domain that owns the data semantics.

## Consequences

The old monolithic-file structure and staged refactor estimates are historical.
Cross-module client persistence is handled separately by the dual-write core
(ADR-0073), not by copying server apply code into clients.
