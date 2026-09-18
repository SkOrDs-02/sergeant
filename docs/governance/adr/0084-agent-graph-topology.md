# ADR-0084: Verifiable agent-topology graph

- **Status:** Accepted
- **Date:** 2026-08-05
- **Last validated:** 2026-09-04 by @codex
- **Next review:** 2027-03-04
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:** [`.agents/agent-graph.json`](../../../.agents/agent-graph.json), [`scripts/check-agent-graph.mjs`](../../../scripts/check-agent-graph.mjs), [ADR-0081](./0081-repository-simplification.md)

## Decision

`.agents/agent-graph.json` is the machine-checked declaration of the intended
agent layer: skills, agents, workspaces, and allowed transitions. The
`pnpm lint:agent-graph` gate validates that declared intent against the files
on disk and catches dangling references, missing terminal paths, and orphaned
surfaces.

This topology graph is deliberately different from the codebase-memory graph:
the former expresses governance intent for the agent system; the latter is a
tool-provided map of code symbols and relationships. Neither replaces the
other, and only the topology graph is committed to this repository.

## Consequences

When a skill, agent, workspace, or allowed transition changes, update the graph
and its validator-backed tests in the same change. Do not add a code-symbol
index to the repository to solve agent-routing questions.
