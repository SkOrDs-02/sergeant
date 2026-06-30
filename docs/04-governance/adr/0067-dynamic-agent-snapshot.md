# ADR-0067: Dynamic agent snapshot for harness context

- **Status:** Proposed
- **Date:** 2026-06-29
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`docs/00-start/agents/agent-skills-catalog.md`](../../00-start/agents/agent-skills-catalog.md)
  - [`docs/04-governance/hard-rules.md`](../hard-rules.md) (Hard Rule #21 — pino redaction; followed)

---

## Context and Problem Statement

Sergeant gives every agent strong **static context** (AGENTS.md, hard rules,
skills, routing catalog) but no **dynamic context** at session start. Per
NxCode's harness-engineering survey (2026-03-01): "anything an agent cannot
reach from its context window effectively does not exist."

Today, an agent opening a session does not know:

- whether `main` is green or red right now;
- whether the latest PR stayed inside the bundle / Lighthouse budgets;
- whether the entropy-janitor cron has open issues about the touched surface;
- which Hard Rules last drifted (and which to re-read);
- which TODO-dated initiatives are about to expire.

## Considered Options

1. **Node script writing local markdown** (chosen). One zero-dep `.mjs`
   file under `tools/agent-snapshot/` that shells out to `gh`/`git` and
   writes `.kilocode/snapshot.md`.
2. **MCP server** returning the same payload as tool calls. Rejected: heavier
   surface area; requires harness-side wiring that does not yet exist.
3. **Pre-commit hook** that prints the snapshot on every commit. Rejected:
   wrong invocation moment — agents need it before reading code, not on save.
4. **GitHub Action posting snapshot to PR comments**. Rejected: out-of-band
   from the agent's prompt; loses live freshness.

## Decision

Add `tools/agent-snapshot/snapshot.mjs` (single-file Node script, zero
runtime deps), invoked as `pnpm snapshot`. It produces a small markdown
report with **8 sections** (repo / CI / budgets / open entropy-janitor
issues / recent PR-ledger entries / hard-rule drift / initiative deadlines
/ agent hints) and writes to `.kilocode/snapshot.md` by default. Wired
into [`sergeant-start-here`](../../../.agents/skills/sergeant-start-here/SKILL.md)
as §0.1 "Dynamic context", to be run before any specialist skill loads.

Cache at `.kilocode/snapshot.cache.json` (15-min TTL, file-mtime based);
force-refresh via `--refresh`; auto-refresh on recent `git pull`
(heuristic: `.git/FETCH_HEAD` mtime < 60s).

Each section **must degrade gracefully**: any `gh` / network / fs failure
becomes `[unavailable: <reason>]`, never an exception that aborts the
rest of the report. Output capped at `<50 KB` (truncation drops the
richest sections first, never truncates a single entry mid-line).

## Rationale

A standalone Node script is the smallest unit that (a) runs identically
on a developer machine and on CI, (b) writes a stable file shape that
agents can ingest, and (c) needs no harness-side wiring. Adopting the
8-section layout from §2.3 of the source plan matches what each
agent-loadable skill already factors into its decisions
(`sergeant-deploy-and-observability` reads CI + budgets;
`sergeant-tech-debt` reads entropy issues; etc.).

Zero runtime dependencies avoids bumping the bundle budget (this script
runs outside the app) and keeps the file self-contained — the `agent`
namespace in `tools/` is otherwise empty, so we are not introducing a
new package.

The graceful `[unavailable: ...]` fallback is the same shape used
elsewhere in the repo (`pnpm licenses:check`, the pr-ledger checks) and
ensures an agent working in a sandboxed or offline environment still
gets the static sections.

## Consequences

### Positive

- Agents can see CI failure before opening a PR — fewer "fix one thing,
  break another" loops.
- Bundle-budget drift surface to agents **before** they push a small JS
  bump that tips `apps/web` over 1.2 MB.
- Open entropy-janitor issues are surfaced in the same report that
  triggers `sergeant-tech-debt` — closes the loop between §1 Janitors
  and §2 Snapshot.
- Zero runtime dep → no `pnpm check` overhead, no license audit cost.

### Negative

- One more CLI surface to keep stable; breaking changes require bumping
  consumers (currently: just the start-here skill).
- Heuristics (e.g. suggested-skill-by-branch-name) are cheap, not
  authoritative — agents that rely on `pnpm agent:route` first will get
  better routing.

### Neutral

- Snapshot cache lives under `.kilocode/` (gitignored at repo level);
  per-machine, not committed.

## Compliance

- Hard Rule #21 (pino redaction): script never reads Pino destinations
  and never echoes sensitive fields; output is filtered to public bundle
  sizes + non-PII metadata only.
- Hard Rule #26 (pr-ledger update on merge): a placeholder ledger entry
  is appended in the same PR; the `update-pr-backlinks` CI job will
  replace it with the real PR number at merge time.

## Links

- Source plan: `E:\Temp\kilo\harness-plan.md` §2 (Dynamic Snapshot)

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                   | Title                                                                                                                | Merged     |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------- |
| [#73](https://github.com/Skords-01/Sergeant/pull/73) | feat(agents): add dynamic agent snapshot for harness context                                                         | 2026-06-30 |
| [#0](https://github.com/Skords-01/Sergeant/pull/0)   | feat(tools): add dynamic agent snapshot for harness context (placeholder — replaced by update-pr-backlinks on merge) | 2026-06-29 |

_Auto-derived from `docs/04-governance/pr-ledger/index.json`. Top 2 most recent PRs touching this file._

<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
