# ADR-0071: Dynamic agent snapshot

- **Status:** Accepted
- **Date:** 2026-06-29
- **Last validated:** 2026-09-04 by @codex
- **Next review:** 2027-03-04
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:** [`tools/agent-snapshot/snapshot.mjs`](../../../tools/agent-snapshot/snapshot.mjs), [`AGENTS.md`](../../../AGENTS.md), [ADR-0081](./0081-repository-simplification.md)

## Decision

The repository provides one zero-dependency snapshot command:

```text
pnpm snapshot
```

`tools/agent-snapshot/snapshot.mjs` writes the current compact context to
`.agents/snapshot.md` and may cache it in `.agents/snapshot.cache.json` for 15
minutes. The command is best-effort: unavailable GitHub/network data is marked
unavailable rather than preventing local work. A pull invalidates the cache.

The snapshot is supporting context, not policy. `AGENTS.md`, skills, governance
rules, and source code remain authoritative. The old `.kilocode/snapshot.md`
path is historical and must not be used in new instructions.

## Consequences

Agents get a repeatable current-state briefing without committing generated
state. Changes to snapshot sections or path must update the script, this ADR,
and the start-here instructions together.
