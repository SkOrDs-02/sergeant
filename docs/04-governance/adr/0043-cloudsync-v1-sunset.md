# ADR-0043: CloudSync v1 sunset — historical rollout record

- **Status:** Deprecated
- **Date:** 2026-05-04
- **Last validated:** 2026-09-04 by @codex
- **Next review:** 2027-03-04
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:** [ADR-0004](./0004-cloudsync-lww-conflict-resolution.md), [ADR-0047](./0047-cloudsync-v1-410-gone.md), [ADR-0065](./0065-sync-op-log-retention-and-multi-instance-fanout.md), [`apps/server/src/modules/sync/`](../../../apps/server/src/modules/sync/)

## Decision and outcome

CloudSync v1 was retired through a staged RFC 8594 deprecation rollout before
the product moved to the operation-log-based sync v2 contract. This document
records that completed rollout only.

The temporary deprecation headers, survey instrumentation, and `410 Gone`
handler have been removed after their migration window. The retired v1 path now
uses the normal absent-route `404` behavior. Current sync development starts
from the v2 pull, push, and stream modules—not from this rollout plan.

## Consequences

Do not reintroduce v1 behavior, the old headers, or its removal metrics. Old
phase names and file paths are historical evidence, not an implementation
checklist. Current retention and scale constraints are described by ADR-0065.
