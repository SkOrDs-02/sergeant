# Harness versioning

> **Last touched:** 2026-06-29 by @Skords-01. **Next review:** 2026-09-27.
> **Status:** Active
> **Owns:** [.kilo/harness-versions.json](../../../../.kilo/harness-versions.json), [`.github/workflows/harness-a-b.yml`](../../../../.github/workflows/harness-a-b.yml), [`scripts/ci-bump-harness-version.mjs`](../../../../scripts/ci-bump-harness-version.mjs).
> **Decided by:** [ADR-0068](../adr/0068-harness-versioning.md).

## Scope

The "harness" is the set of files that every AI agent reads before touching code:

- `AGENTS.md` (root policy)
- `.agents/skills/**/*.md` (per-surface specialist skills)
- `docs/04-governance/governance/rules/**` (Hard Rules)
- `packages/eslint-plugin-sergeant-design/**` (mechanical design enforcement)
- `.husky/**` (pre-commit gates)
- `.kilocode/snapshot.md` (post-§2 dynamic context)

A change to any of these is a _harness change_ and must bump the registry.

## Schema

The registry lives at `.kilo/harness-versions.json`:

```json
{
  "schemaVersion": 1,
  "current": "0.1.0",
  "versions": {
    "0.1.0": {
      "releasedAt": "YYYY-MM-DD",
      "changes": ["..."],
      "agentsTestedWith": ["model-id"],
      "passRateBaseline": null
    }
  },
  "abExperiments": {}
}
```

Fields:

- `schemaVersion` — bump only on backward-incompatible layout changes (e.g. moving `versions` under a top-level array). Currently `1`.
- `current` — pointer that agents read at session start. Always present in `versions`.
- `versions.<x.y.z>` — append-only map; never delete a historical entry.
  - `releasedAt` — ISO date (`YYYY-MM-DD`).
  - `changes` — short bullets, 1 line each, suitable for an agent to re-read on a version mismatch.
  - `agentsTestedWith` — list of model identifiers the harness was exercised under. Empty until a benchmark run.
  - `passRateBaseline` — numeric or `null`; set once the §3 follow-up benchmark lands.
- `abExperiments` — registry of running A/B experiments; empty `{}` until a treatment is added.

## Bump matrix

| Touched surface                                       | Bump    | Why                                                   |
| ----------------------------------------------------- | ------- | ----------------------------------------------------- |
| `AGENTS.md`                                           | `minor` | new content the agent must re-read                    |
| `.agents/skills/<new-skill>/SKILL.md` (new)           | `minor` | adds a routing option                                 |
| `.agents/skills/<existing>/SKILL.md` (edit)           | `minor` | content drift, agent must re-read                     |
| `docs/04-governance/governance/rules/<N>-*.md`        | `major` | Hard Rule changed; can break prior agent reasoning    |
| `packages/eslint-plugin-sergeant-design/**`           | `minor` | new mechanical enforcement, agent may need to re-read |
| `eslint-plugin-sergeant-design` rules **disabled**    | `major` | a previously enforced rule stops firing               |
| `.husky/**`                                           | `minor` | new gate; agent must respect new failure modes        |
| `docs/04-governance/governance/harness-versioning.md` | `patch` | this doc's own typos/links                            |
| Only `Last touched` / freshness dates                 | `patch` | no semantic change                                    |
| Comment-only or whitespace-only edits                 | `patch` | no semantic change                                    |

The bumper is conservative: a `major` triggers any time a Hard Rule file is in the diff, regardless of any `minor` / `patch` signals. Hard Rule changes are explicitly loud events.

## How to bump

```bash
# from repo root, with origin/main up to date
node scripts/ci-bump-harness-version.mjs
git add .kilo/harness-versions.json
git commit -m "chore(agents): bump harness to <next>"
```

The script reads `git diff --name-only origin/main...HEAD` (falling back to `HEAD~1...HEAD` if no `origin/main` is reachable) and writes the new version into the registry. It is **not** wired into CI in this iteration — bump manually so a reviewer can sanity-check the diff. Wiring it into a required status check is a follow-up once the workflow has been stable for one minor cycle.

If you need to override the detected bump (e.g. you are touching a rule file but the change is a comment fix), edit the registry by hand and note the override in the PR description.

## A/B evaluation

`.github/workflows/harness-a-b.yml` runs weekly Sunday 00:00 UTC and on `workflow_dispatch`. It checks out two refs in a matrix (`main` as the control, `experimental/loop-detect` as a placeholder treatment) and uploads an artifact per cohort with the harness version it ran against. The benchmark step is currently gated `if: false` — it lights up once the golden-task suite ships (follow-up tracked in ADR-0068 §Open Questions).

To start a new experiment:

1. Add an entry to `abExperiments` in the registry (`minor` bump).
2. Branch from `main` to `experimental/<short-name>`.
3. Update the workflow's `matrix.ref` to include the new branch.
4. Drop the `if: false` gate on the benchmark step once the suite exists.
5. Record outcomes in the experiment entry (`status: "draft" | "running" | "concluded"`, `cohort` results).

## Reading the registry

For an agent at session start:

```js
import { readFileSync } from "node:fs";
const { current, versions } = JSON.parse(
  readFileSync(".kilo/harness-versions.json", "utf8"),
);
const entry = versions[current];
// if `current` differs from the version noted in the previous session summary,
// re-read the changelog (`entry.changes`) and adjust before editing.
```

This is the same read path used by `sergeant-start-here` once §3.4 lands.
