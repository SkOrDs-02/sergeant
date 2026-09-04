# ADR-0093: Cached ESLint and Prettier pipeline

- **Status:** Accepted
- **Date:** 2026-09-02
- **Last validated:** 2026-09-04 by @codex
- **Next review:** 2027-03-04
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:** [ADR-0081](./0081-repository-simplification.md), [`turbo.json`](../../../turbo.json), [`packages/eslint-plugin-sergeant-design/`](../../../packages/eslint-plugin-sergeant-design/), [`scripts/eslint-print-config-diff.mjs`](../../../scripts/eslint-print-config-diff.mjs)

## Decision

ESLint and Prettier remain the supported lint/format stack. Performance work
must preserve the correctness of cache inputs: Turbo tracks root ESLint and
Prettier configuration through `globalDependencies`; workspace lint tasks use
their `.eslintcache` outputs; and the resolved ESLint configuration is checked
as an explicit gate.

The repository does not switch to Biome solely for a benchmark. A replacement
would first need to demonstrate equivalent coverage for the Sergeant
invariants, TypeScript/React semantics, Markdown formatting, and the existing
governance checks.

## Consequences

A cache hit is trustworthy only when every relevant configuration input is
declared. Changes to lint configuration, the custom plugin, or task outputs
must update `turbo.json` and the config-diff evidence together. A red CI run is
an operational signal to investigate, not evidence that this architectural
decision changed.
