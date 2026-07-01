# ADR-0072: Harness versioning and A/B evaluation

> **Last touched:** 2026-07-01 by @claude. **Next review:** 2026-09-29.
> **Status:** Accepted

- **Status:** Accepted
- **Date:** 2026-06-29
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`docs/04-governance/governance/harness-versioning.md`](../governance/harness-versioning.md) — operational rules and bump matrix
  - [`.kilo/harness-versions.json`](../../../.kilo/harness-versions.json) — version registry
  - [`.github/workflows/harness-a-b.yml`](../../../.github/workflows/harness-a-b.yml) — A/B eval workflow
  - [`scripts/ci-bump-harness-version.mjs`](../../../scripts/ci-bump-harness-version.mjs) — local PR-time bumper
  - [`docs/04-governance/adr/0067-engagement-mechanism-standardization.md`](./0067-engagement-mechanism-standardization.md) — прецедент централізованого реєстру
  - [`docs/04-governance/adr/0021-memory-bank.md`](./0021-memory-bank.md) — прецедент персистентного cross-session state

---

## Context and Problem Statement

The "harness" — the sum of `AGENTS.md`, `.agents/skills/**`, the Hard Rules registry, `eslint-plugin-sergeant-design`, pre-commit hooks, and (post §2) `.kilocode/snapshot.md` — controls how every AI agent in this monorepo reads, edits, and validates code. It changes at a different cadence than product code and under different incentives, yet until now had no:

- shared identity ("which harness version was this agent trained on?");
- changelog ("what changed between session A and session B?");
- A/B harness experiments (treat a control cohort with the current config and a treatment cohort with a candidate — measure pass-rate, drift, or time-to-PR).

Without versioning, every change to `AGENTS.md` is invisible at review time, and there is no rollback lever short of a git revert. The NxCode article _"Harness-инженерия: Полное руководство"_ (2026-03-01) flags this explicitly: _"Оснастка должна развиваться вместе с моделью. Пересматривайте компоненты при каждом крупном обновлении моделей."_

## Decision

Introduce a minimal, append-only harness version registry plus a weekly A/B workflow stub:

1. **Registry file:** `.kilo/harness-versions.json` (committed, in-repo, NOT in global Kilo config — this is policy, not a tool setting). Schema:
   ```json
   {
     "schemaVersion": 1,
     "current": "0.1.0",
     "versions": { "0.1.0": { "releasedAt": "...", "changes": [...], "agentsTestedWith": [], "passRateBaseline": null } },
     "abExperiments": {}
   }
   ```
2. **Bump policy** (see governance doc for the full matrix):
   - **major** — any Hard Rule file changes (rules under `docs/04-governance/governance/rules/`) or any breaking edit to AGENTS.md that invalidates a prior reading.
   - **minor** — new skill, new AGENTS.md section, or a behavioral change to `eslint-plugin-sergeant-design`.
   - **patch** — typo, link fix, `Last touched` refresh, docstring-only edit.
3. **PR-time bumper:** `scripts/ci-bump-harness-version.mjs` detects touched surfaces from `git diff --name-only origin/main...HEAD` and rewrites the registry in place. Run locally before opening a PR; not a CI gate in this iteration (to avoid surprise lock-step rebases).
4. **A/B workflow stub:** `.github/workflows/harness-a-b.yml` runs weekly Sunday 00:00 UTC (and on `workflow_dispatch`) with a `matrix.ref` of `[main, experimental/loop-detect]`. The benchmark step is gated `if: false` until the golden-task suite ships; the workflow ships artifacts and the harness version it ran against so future agents can correlate sessions.
5. **AGENTS.md "Harness version" section:** links to the registry, the governance doc, and this ADR, and tells future agents to re-read the governance doc when the registered version differs from the previous session's summary.

## Consequences

**Positive:**

- Every harness change is reviewable in a diff (registry + per-rule file + AGENTS.md block) instead of being a silent edit to one giant file.
- Agents can answer _"which harness version am I running under?"_ without grepping commit history.
- Weekly A/B run produces a comparable artifact per cohort even before the benchmark suite exists; the scaffold is in place.
- A future change to `eslint-plugin-sergeant-design` or a new Hard Rule is a _visible event_ (bump) rather than a quiet drift.

**Negative:**

- One more file to keep in sync; if a contributor bypasses the bumper the registry goes stale. Mitigation: monthly `lint` reminder in a follow-up janitor (out of scope for this ADR).
- A/B workflow currently uploads empty artifacts; without the benchmark suite the `bench-*.json` is always absent. Acceptable as scaffold — the workflow name and matrix are stable, only the inner step is gated.
- Initial version is `0.1.0` (not `1.0.0`) — explicitly pre-stable. Bumping to `1.0.0` is a deliberate act, signalling that the harness has a known-stable baseline and that future major bumps require a governance review (tracked as follow-up in `versions`).

**Neutral:**

- `abExperiments` starts as `{}`. Adding an experiment is itself a minor harness bump.
- The bumper only reads `git diff origin/main...HEAD`. If the repo diverges (e.g. local-only commit), `git diff HEAD~1...HEAD` is the fallback. No remote push required.

## Alternatives Considered

- **Tag-based versioning (git tag only, no JSON file).** Rejected: hard for agents to discover at runtime; forces a `git describe` and assumes the agent runs in a git checkout with tags fetched.
- **Per-component version (separate `AGENTS.md` version, separate `eslint-plugin` version).** Rejected: the harness is treated as one coherent change set in practice — a Hard Rule change usually touches AGENTS.md and (often) an ESLint rule. Independent versions would create a dependency graph we cannot easily test.
- **MCP server that returns `current` on demand.** Rejected: requires a live server, fails offline, and adds an operational surface for what is ultimately a static fact.

## Open Questions / Follow-ups

- Golden-task benchmark suite for `pnpm harness:bench` — separate ADR once at least 10 reproducible harness-sensitive tasks exist.
- Promote `0.1.0` → `1.0.0` after the first 3 minor bumps land without a rollback (signal of stability).
- `lint:harness-version-freshness` — janitor that opens an issue if the registry's `current` lags behind the most recent bump-worthy commit by more than 7 days. Tracked in `docs/90-work/tech-debt/agents.md` (follow-up).
