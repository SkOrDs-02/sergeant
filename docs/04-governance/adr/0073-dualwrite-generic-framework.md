# ADR-0073: Shared dual-write core for module persistence

- **Status:** Accepted
- **Date:** 2026-07-03
- **Last validated:** 2026-09-04 by @codex
- **Next review:** 2027-03-04
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:** [ADR-0011](./0011-local-first-storage.md), [ADR-0064](./0064-syncv2-modular-refactor.md), [`packages/dualwrite-core/`](../../../packages/dualwrite-core/), [`docs/02-engineering/architecture/domain-invariants.md`](../../02-engineering/architecture/domain-invariants.md)

## Context

Web and mobile preserve local-first module state through four domain-specific
SQLite writer families: finyk, fizruk, nutrition, and routine. Their domain
operations deliberately differ, but their error policy, LWW guard mechanics,
SQL execution contract, and telemetry must not drift independently.

## Decision

`@sergeant/dualwrite-core` is the shared platform-neutral mechanism for
applying operation batches. It provides `createApplyOps`, standard result
accounting, injectable logging, and the two supported error policies:
best-effort and atomic-batch. Web and mobile adapters use that core while each
domain retains ownership of its op shapes, SQL, conflict semantics, timestamps,
and side effects.

The framework is intentionally not a generic domain model. Hard delete,
tombstone, child-cascade, timestamp, and LWW/no-guard choices remain explicit
in each adapter and are verified by SQL/result tests.

## Consequences

New dual-write paths must reuse the core only for shared mechanics and add
parity/replay tests for the domain semantics they own. A change to a shared
policy needs an adapter-impact review across web and mobile; copying a server
sync apply handler into a client is not an acceptable shortcut.
