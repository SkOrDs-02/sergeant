# ADR-0047: CloudSync v1 sunset — historical completion record

- **Status:** Deprecated
- **Date:** 2026-05-06
- **Last validated:** 2026-09-04 by @codex
- **Next review:** 2027-03-04
- **Deciders:** @Skords-01
- **Supersedes:** [ADR-0004](./0004-cloudsync-lww-conflict-resolution.md)
- **Related:** [ADR-0043](./0043-cloudsync-v1-sunset.md), [`apps/server/src/modules/sync/`](../../../apps/server/src/modules/sync/), [ADR-0065](./0065-sync-op-log-retention-and-multi-instance-fanout.md)

## Decision and outcome

CloudSync v1 was sunset as part of the migration to the per-row operation-log
sync v2 contract. This ADR is retained as a historical completion record; it
is not the current HTTP behavior.

The old implementation returned `410 Gone` during the deprecation window. That
handler and its sunset middleware were later removed. A request to the retired
v1 path now receives the ordinary current `404` behavior. New sync work must
use the v2 pull/push/stream routes and their operation-log contract.

## Consequences

Old v1 clients must not retry or be reintroduced. References to the old `410`
response, removed sunset modules, and the original rollout phases are historical
only. Current sync behavior is documented by the v2 route/module code and
ADR-0065; this record must not be used as an API contract.
