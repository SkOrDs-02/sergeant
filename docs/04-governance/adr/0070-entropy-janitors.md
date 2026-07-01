# ADR-0070: Scheduled Entropy Janitors

- **Status:** Accepted
- **Date:** 2026-06-29
- **Author:** @Skords-01 (Harness Engineering v1)
- **Deciders:** @Skords-01
- **Supersedes:** —

## Context

The Sergeant monorepo accumulates entropy from three sources:

1. **Doc drift** — `path:line` references in `AGENTS.md`, skills, per-rule files
   and runbooks silently rot as code moves. The existing
   `lint:hard-rules-registry` script only catches _registry_ drift, not
   arbitrary prose references. RQ-key symbols change in
   `apps/web/src/shared/lib/api/queryKeys.ts` faster than docs can be updated.
2. **Dead code** — Knip is already wired (`pnpm knip`) but the output lives
   only in a developer's terminal. There is no scheduled run, no issue
   tracking, no weekly diff.
3. **Circular dependencies** — the monorepo enforces architectural layers
   (Hard Rule #3 + new module-ownership rules) but no automated check
   flags cycles between `apps/web`, `apps/server`, `apps/mobile` and the
   shared packages.

We need scheduled agents that **surface** entropy weekly without trying to
**fix** it — janitors report, humans decide.

## Decision

Ship three independent janitors as a single workspace package
`@sergeant/entropy-janitors` at `tools/entropy-janitors/`:

| Janitor      | Mechanism                                            | Output                                               |
| ------------ | ---------------------------------------------------- | ---------------------------------------------------- |
| `doc-drift`  | Built-in ESM file walker + regex reference extractor | GitHub issue with `entropy-janitor/doc-drift` label  |
| `dead-code`  | `knip --reporter json --workspaces`                  | GitHub issue with `entropy-janitor/dead-code` label  |
| `dep-cycles` | Built-in ESM resolver, hand-rolled to avoid new deps | GitHub issue with `entropy-janitor/dep-cycles` label |

- **Schedule:** weekly Monday 06:00 UTC (09:00 Europe/Kyiv) via
  `.github/workflows/entropy-janitors.yml`.
- **Trigger:** `schedule` + `workflow_dispatch` (manual debug).
- **Output channel:** **issues only**, never PRs. The `issues: write`
  permission is requested; `pull-requests: write` is intentionally absent.
- **Debounce:** an issue is only opened when there is at least one finding
  _and_ no open issue with the same title exists. This is enforced by
  `gh issue list --search in:title` before creation.
- **Redaction:** every log line passes through a Pino-style redactor
  (Hard Rule #21) before leaving the process. GitHub PATs, Slack tokens,
  and any field whose name contains `token`/`secret`/`password` are masked.
- **New dependencies:** none. The `dep-cycles` resolver is hand-rolled
  (~200 lines of TypeScript) to satisfy the "no new deps without ADR"
  rule from the harness plan and keep CI time low. Knip is already a
  root `devDependency`.

## Consequences

### Positive

- Weekly visibility into doc-drift, dead code, and circular deps — no
  manual `pnpm knip` runs required.
- Each janitor has a unit-test suite colocated in `src/__tests__/`, so
  refactors of the resolvers are safe.
- Issues (not PRs) keep humans in the loop; reduces CI cost and avoids
  the "auto-PR noise" trap flagged in the NxCode article that motivated
  this work.

### Negative

- Adds ~$0.50/week of CI cost (3 jobs × ~3 min × ubuntu).
- Without a debounce, weekly issues would pile up; the
  `gh issue list --search in:title` check is a soft debounce — it does
  not collapse two distinct drift types into one issue.
- The hand-rolled `dep-cycles` resolver covers only relative imports
  (`.ts`/`.tsx`/`.js` etc.). Workspace aliases (`@sergeant/...`) are
  intentionally skipped — those packages are out of scope for cycle
  detection because their boundary is enforced by `pnpm-workspace.yaml`.

### Neutral

- Adds four new scripts at the root: `janitors:doc-drift`,
  `janitors:dead-code`, `janitors:dep-cycles`, `janitors:all`.
- Does **not** wire janitors into `pnpm check` — they are too slow for
  a per-PR gate (per the plan §1.4).

## Alternatives considered

1. **Knip-only** — would have covered dead-code but not doc-drift or
   dep-cycles. Rejected as insufficient.
2. **Manual weekly audit** — the current state of the art. Scales linearly
   with repo size; not sustainable past 200 packages.
3. **Custom ESLint rule for doc-drift** — possible but tightly coupled to
   ESLint's plugin lifecycle. A standalone scanner is easier to evolve and
   test in isolation.
4. **One mega-janitor** — would mix three different output shapes and
   three different label namespaces. Rejected for clarity.
5. **Adding `madge` and `dependency-cruiser`** — would have given a more
   battle-tested dep-cycles scan but introduces two new production
   dependencies. Held back by the "no new deps without ADR" rule; the
   hand-rolled resolver covers the same surface for our use case.

## Follow-ups

- Track per-janitor false-positive rate in a follow-up ADR after 4 weeks
  of production data; consider an `ignorePatterns` allowlist if noise
  > 10% of weekly findings.
- Wire janitor issue labels into the agent snapshot (§2) so future agent
  sessions can preload context about open entropy issues.
- Consider promoting `dep-cycles` to a hard-rule lint check once the
  hand-rolled resolver has a track record.

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                   | Title                                                                                    | Merged     |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------- |
| [#90](https://github.com/Skords-01/Sergeant/pull/90) | fix(docs): browser-journey execution log 2026-07-01 + renumber harness ADRs to 0070–0072 | 2026-07-01 |

_Auto-derived from `docs/04-governance/pr-ledger/index.json`. Top 1 most recent PRs touching this file._

<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
