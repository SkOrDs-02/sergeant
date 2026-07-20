---
name: sergeant-tech-debt
description: Use when reducing technical debt, cleaning dead code with Knip, lowering ESLint baseline violations, or tackling Hard Rule #18 (module-size) refactor sprints in Sergeant; UA: технічний борг, dead code, рефакторинг.
lang: en
lang-reason: Agent-runtime SKILL — body kept EN to maximize tool-calling stability across LLM providers (Anthropic, OpenAI, etc.) whose attention bias toward English persists in tool-routing decisions even when prompts are bilingual. The bilingual trigger phrase lives in `description:` so UA-only chat routing still resolves the right SKILL.
---

# Technical Debt у Sergeant

Technical debt in Sergeant has a taxonomy: the 26 hard rules define what "correct" looks like, and `eslint-baseline.js` + Knip + module-size metrics track how far current code deviates from that standard. Use these tools — not intuition — to prioritize debt work.

## Debt inventory tools

### 1. ESLint baseline (`eslint.baseline.js`)

`eslint.baseline.js` is the shared flat-config slice consumed by the root `eslint.config.js` (stack-pulse PR-31 phase-1 extraction) — it holds the monorepo-wide rule set, not a list of grandfathered violations.

```bash
pnpm lint          # run ESLint across all packages
pnpm lint --fix    # auto-fix fixable violations
```

All react-hooks v7 rules (`set-state-in-effect`, `preserve-manual-memoization`, `purity`, `refs`, `immutability`, `static-components`, `use-memo`) are enforced as `error` — Initiative 0021 closed 2026-07-10 (PR #177) after clearing the monorepo. Do not downgrade a rule in `eslint.baseline.js` to silence a finding; fix the code. If a rule genuinely needs a scoped exception, use a file-scoped override with an inline justification.

### 2. Dead code (Knip)

```bash
pnpm knip          # find unused exports, files, and deps across all workspaces
```

Knip covers all 4 apps and `packages/`. Setting `ignoreExportsUsedInFile: true` suppresses same-file re-exports as false positives.

Before deleting a Knip finding, apply lifecycle marker guards per `docs/00-start/playbooks/cleanup-dead-code.md`:

| Marker | Action |
|---|---|
| `@scaffolded` | DO NOT delete — intentional infrastructure |
| `@deprecated` + `@removeBy <date>`, date not yet reached | Defer until the date; do not delete early |
| Added < 90 days ago, no marker | Add `@deprecated` + `@removeBy` marker; do not delete |
| No marker, no consumers, untouched > 12 months | Safe to delete after full monorepo grep |

Full monorepo verification before any deletion:

```bash
grep -rn "<symbol>" --include="*.{ts,tsx,js,jsx,mjs,cjs,json,md}" .
```

### 3. Module size (Hard Rule #18 — `lint-enforced-convention`)

Hard Rule #18 sets `max-lines: 600` for `apps/web` TS/TSX files as a permanent lint-enforced ESLint rule (promoted after initiative 0001 closed; allowlist removed).

When a file exceeds 600 lines, decompose by extracting a focused concern — a custom hook, a utility function, or a sub-component — into a sibling file within the same feature folder. Do not move shared logic to `apps/web/src/shared/` unless it truly belongs there; verify boundary with `sergeant-monorepo-boundaries` first.

Do not decompose files solely to pass the lint gate. Decompose when the extraction creates a coherent, independently named unit.

### 4. TypeScript strictness (Hard Rule #19 — `lint-enforced-convention`)

Hard Rule #19 requires `noUncheckedIndexedAccess: true` across the monorepo (permanent since initiative 0012 closed). When working in a file, fix unguarded index access:

```typescript
// Incorrect — may throw at runtime if items is empty
const first = items[0].name;

// Correct — handles undefined safely
const first = items[0]?.name ?? "default";
```

## Prioritization

| Type | Priority | Signal |
|---|---|---|
| `blocker-invariant` Hard Rule violations (#1–#7, #20, #21) | Highest | Data loss or outage risk |
| `lint-enforced-convention` violations | High | Tracked; clear fix path |
| Module size violations in high-churn files | Medium | Files touched > 2× per sprint per `git log` |
| `@deprecated` symbols past `@removeBy` date | Medium | Clean up during related feature work |
| Low-churn files over 600 lines | Low | Decompose only when already editing the file |

## Separate PRs for separate classes of debt

Do not mix dead-code deletion, lint-rule cleanup, and module decomposition in one PR. These are different risk profiles and different reviewers need to reason about them independently. Keep them as separate PRs.

## What NOT to do

- Do not refactor a file just because it is large — touch it when already changing behavior there.
- Do not downgrade or disable rules in `eslint.baseline.js` to silence findings — fix the underlying code.
- Do not delete Knip findings without verifying lifecycle markers (Hard Rule #10).
- Do not move logic to `packages/shared/` without a `sergeant-monorepo-boundaries` check.
- Do not create a single "cleanup PR" that mixes all three debt classes.

## Scheduled janitors

Three weekly janitors (Monday 06:00 UTC, `Europe/Kyiv` 09:00) live in
`tools/entropy-janitors/` and surface entropy as **issues** — never PRs —
via `.github/workflows/entropy-janitors.yml`:

| Janitor | What it catches | Local invocation |
|---|---|---|
| `doc-drift` | Broken `path:line` references in docs, missing RQ-key symbols in `queryKeys.ts` | `pnpm janitors:doc-drift` |
| `dead-code` | Unused files / exports / dependencies (Knip wrapper, JSON mode) | `pnpm janitors:dead-code` |
| `dep-cycles` | Circular dependencies in `apps/` and `packages/` | `pnpm janitors:dep-cycles` |

When an agent session opens an issue with label
`entropy-janitor/<type>`, treat it as a debt inventory signal:

1. Read the issue body — every finding has `path:line` and a short
   rationale.
2. Apply the existing lifecycle-marker table above (Knip, doc-drift,
   dep-cycles) before deleting anything.
3. If the finding is a false positive, document it in
   `docs/04-governance/governance/entropy-janitors/README.md` (per-janitor
   `ignorePatterns`) so the next run does not re-open the issue.
4. Open **one** cleanup PR per janitor type — never mix the three classes
   in a single PR (same rule as ESLint baseline / module size).

The hand-rolled `dep-cycles` resolver covers only relative imports
(`.ts`/`.tsx`/`.js`/`.mjs`). Workspace aliases (`@sergeant/...`) are
intentionally out of scope — the package boundary is enforced by
`pnpm-workspace.yaml` and `pnpm install` already.

## Playbooks

- `docs/00-start/playbooks/cleanup-dead-code.md` — step-by-step dead code removal with lifecycle marker guards.
- Skill catalog: `docs/00-start/agents/agent-skills-catalog.md`.
