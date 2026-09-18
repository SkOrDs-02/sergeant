# ADR-0081: Repository simplification and durable discovery

- **Status:** Accepted
- **Date:** 2026-07-29
- **Last validated:** 2026-09-04 by @codex
- **Next review:** 2027-03-04
- **Deciders:** @Skords-01
- **Supersedes:** ADR-0058, ADR-0059, ADR-0060, ADR-0066, ADR-0070
- **Related:** [`AGENTS.md`](../../../AGENTS.md), [ADR-0071](./0071-dynamic-agent-snapshot.md), [ADR-0084](./0084-agent-graph-topology.md), [`scripts/dualwrite-residue.ts`](../../../scripts/dualwrite-residue.ts)

## Decision

The repository does not commit generated code-symbol graphs, retrieval indexes,
or local archive trees that duplicate Git history. Code discovery uses the
external codebase-memory MCP first, then TypeScript/LSP or `rg` as fallback.
The MCP graph is an external, current discovery service; it is not a committed
repository artifact.

Completed audits, initiatives, and plans are preserved through Git history or
stable permalinks. Direct checks replace broad wrappers: Knip for dead code,
the documentation checkers for link/freshness drift, ESLint for dependency
cycles and invariants, and the dual-write-residue check for its specific risk.

The ESLint plugin protects runtime, security, storage, API, and domain
invariants. Visual taste belongs in design tokens, Storybook, accessibility
checks, and review rather than heuristic AST rules.

## Consequences

New tooling must not restore a second committed knowledge graph or a local
archive hierarchy. A document that is removed from the working tree needs its
inbound links changed to a verified permalink or a current canonical document;
otherwise the link checker will correctly surface debt.
