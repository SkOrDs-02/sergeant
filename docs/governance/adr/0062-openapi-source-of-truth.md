# ADR-0062: API contract source of truth — code-first Zod/OpenAPI

- **Status:** Accepted
- **Date:** 2026-06-05
- **Last validated:** 2026-09-04 by @codex
- **Next review:** 2027-03-04
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:** [ADR-0025](./0025-openapi-generation.md), [ADR-0053](./0053-api-versioning-policy.md), [`packages/api-client/src/endpoints/`](../../../packages/api-client/src/endpoints/), [`docs/engineering/api/`](../../engineering/api/)

## Decision

Runtime Zod schemas and the server code that uses them are the semantic source
of truth. The repository generates/validates the OpenAPI JSON representation
from that code-first contract. `packages/api-client/src/endpoints/*` contains
the maintained client-facing types and must agree with server responses and
contract tests under Hard Rule #3.

The previously proposed generated `openapi.d.ts` path is not a current public
API surface and must not be described as one. Generated artifacts are outputs,
not an excuse to edit a parallel hand-written specification first.

## Consequences

An endpoint change requires the server schema/handler, OpenAPI output, client
types, and contract tests to move together. If a generated artifact is removed
or regenerated, this ADR should describe the current pipeline rather than
preserve dead file names in the decision text.

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                     | Title                                                                   | Merged     |
| ------------------------------------------------------ | ----------------------------------------------------------------------- | ---------- |
| [#689](https://github.com/Skords-01/Sergeant/pull/689) | fix(ci): governance-sync відрізняє живе посилання від навмисно мертвого | 2026-08-07 |

_Auto-derived from `docs/governance/pr-ledger/index.json`. Top 1 most recent PRs touching this file._
<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
