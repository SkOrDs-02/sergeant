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

`eslint.baseline.js` tracks violations that existed before a rule was enabled. Reducing this count is the primary debt-reduction metric for lint-enforced rules.

```bash
pnpm lint          # run ESLint across all packages
pnpm lint --fix    # auto-fix fixable violations
```

The baseline contains 25 rule entries: 6 enforced as errors, 9 disabled (legacy react-hooks v7 suppressions queued for cleanup), remainder as warnings.

To close a baseline violation:

1. Fix the violation in the source code.
2. Remove the specific entry from `eslint.baseline.js`.
3. Run `pnpm lint` — it must stay green.
4. Do not remove baseline entries without fixing the underlying code — that silently re-enables the violation elsewhere.

The 9 disabled react-hooks v7 rules (`set-state-in-effect`, `preserve-manual-memoization`, `purity`, etc.) represent an active cleanup initiative. When working in a file that triggers one, fix it as part of the change.

### 2. Dead code (Knip)

```bash
pnpm knip          # find unused exports, files, and deps across all workspaces
```

Knip covers all 5 apps and `packages/`. Setting `ignoreExportsUsedInFile: true` suppresses same-file re-exports as false positives.

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

### 3. Module size (Hard Rule #18 — `active-initiative`)

Hard Rule #18 sets `max-lines: 600` for `apps/web` TS/TSX files as an `active-initiative` ESLint rule.

When a file exceeds 600 lines, decompose by extracting a focused concern — a custom hook, a utility function, or a sub-component — into a sibling file within the same feature folder. Do not move shared logic to `apps/web/src/shared/` unless it truly belongs there; verify boundary with `sergeant-monorepo-boundaries` first.

Do not decompose files solely to pass the lint gate. Decompose when the extraction creates a coherent, independently named unit.

### 4. TypeScript strictness (Hard Rule #19 — `active-initiative`)

Hard Rule #19 requires `noUncheckedIndexedAccess: true` across the monorepo. Existing violations are tracked. When working in a file, fix unguarded index access:

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
| `lint-enforced-convention` with active baseline entries | High | Tracked; clear fix path |
| Module size violations in high-churn files | Medium | Files touched > 2× per sprint per `git log` |
| Disabled react-hooks v7 rules | Medium | Enables real-time feedback once fixed |
| `@deprecated` symbols past `@removeBy` date | Medium | Clean up during related feature work |
| Low-churn files over 600 lines | Low | Decompose only when already editing the file |

## Separate PRs for separate classes of debt

Do not mix dead-code deletion, baseline reduction, and module decomposition in one PR. These are different risk profiles and different reviewers need to reason about them independently. Keep them as separate PRs.

## What NOT to do

- Do not refactor a file just because it is large — touch it when already changing behavior there.
- Do not remove `eslint-baseline.js` entries without fixing the underlying code.
- Do not delete Knip findings without verifying lifecycle markers (Hard Rule #10).
- Do not move logic to `packages/shared/` without a `sergeant-monorepo-boundaries` check.
- Do not create a single "cleanup PR" that mixes all three debt classes.

## Playbooks

- `docs/00-start/playbooks/cleanup-dead-code.md` — step-by-step dead code removal with lifecycle marker guards.
- Skill catalog: `docs/00-start/agents/agent-skills-catalog.md`.
