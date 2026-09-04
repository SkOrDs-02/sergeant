# ADR-0012: Application-enforced authorization boundary

- **Status:** Accepted
- **Date:** 2026-04-27
- **Last validated:** 2026-09-04 by @codex
- **Next review:** 2027-03-04
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:** [`apps/server/src/http/requireSession.ts`](../../../apps/server/src/http/requireSession.ts), [`apps/server/src/auth.ts`](../../../apps/server/src/auth.ts), [ADR-0011](./0011-local-first-storage.md), [`docs/04-governance/security/audit-exceptions.md`](../security/audit-exceptions.md)

## Context

Sergeant stores user-scoped data in Postgres and authenticates HTTP requests
through Better Auth. The production boundary is currently in the application:
routes resolve a session, handlers carry the authenticated opaque user id, and
queries scope reads and writes to that id. Postgres RLS policies and a database
session variable are not the current runtime contract.

## Decision

Application-enforced authorization is the accepted production model for the
current deployment. Every user-scoped route must:

1. pass through `requireSession()`, `requireFreshSession()`, or the explicitly
   justified soft variant;
2. derive the owner id from the authenticated request, never from a trusted
   client body/query field; and
3. include an explicit owner predicate or equivalent repository-level guard in
   every user-scoped read, update, delete, and sync operation.

Foreign keys, unique constraints, transaction boundaries, and cross-user
isolation tests are required supporting controls. RLS remains a possible future
defence-in-depth migration, not an implied target state or a prerequisite
already present in production.

## Consequences

The main failure mode is a missing owner predicate, so code review, route
contract tests, and cross-user integration tests are mandatory. Any future RLS
adoption must be a new explicit implementation change covering connection
pooling, transaction-local identity, migrations, bypass/admin paths, and a
rollback plan; this ADR must then be rewritten again rather than left as a
contradictory proposal.
