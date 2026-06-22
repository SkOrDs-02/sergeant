# Rule 17 — Animation budget — max 2 concurrent, 3 tiers

> **Category:** `lint-enforced-convention`
> **Severity:** `blocker`
> **Last validated:** 2026-05-13 by @Skords-01
> **Next review:** 2026-08-11
> **Status:** Active

> Per-rule canonical body for Hard Rule #17. Compact summary lives in [`AGENTS.md § Hard rules`](../../../../AGENTS.md#hard-rules-do-not-break) (rendered as a table). The machine-readable registry lives in [`docs/04-governance/governance/hard-rules.json`](../hard-rules.json). The 3-way sync (AGENTS.md ↔ JSON ↔ this file) is enforced by `pnpm lint:hard-rules-registry`.

## Scope

- `apps/web/src/**`
- `packages/design-tokens/**`

## Enforced by

- **convention** — AGENTS.md § Hard rules #17 (AMBIENT/RESPONSE/CELEBRATE tiers; max 1 AMBIENT + 1 RESPONSE simultaneously; stagger ≤ 30 ms × N capped at 150 ms; CELEBRATE only on milestones 7/30/100/365)
- **doc** — docs/05-design/design/design-system/05-motion-offline-error.md § 14. Motion & Animation

## Why / What is enforced

> Why a hard rule? Unconstrained animations create visual noise and harm users with vestibular disorders. Past audits found confetti firing on every checkbox tick and stagger delays compounding to 350 ms+, both violating the WCAG 2.3 (Animation from Interactions) guideline.

Three animation tiers — every animation in the codebase belongs to exactly one:

| Tier          | Examples                                                       | Constraint                                                                                            |
| ------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **AMBIENT**   | `shimmer`, `pulse-soft`, `wiggle`                              | Looped; always behind `motion-safe:`; `prefers-reduced-motion` collapses to opacity-only              |
| **RESPONSE**  | `fade-in`, `slide-up`, `scale-in`, `press-scale`, `hover-lift` | One-shot, 150–300 ms, `ease-out`; fires once per user action                                          |
| **CELEBRATE** | `check-pop`, `bounce-in`, `success-pulse`, confetti burst      | Milestones only: first entry, streak 7/30/100/365, weekly goal hit. **Not** every checkbox completion |

Rules:

- Max **1 AMBIENT + 1 RESPONSE** running simultaneously on screen.
- A stagger group counts as **1 RESPONSE** regardless of child count.
- Stagger timing: **max 30 ms between children**, total delay cap **≤ 150 ms** (`Math.min(index * 30, 150)`).
- Never wrap a component that has its own internal entry animation in `StaggerChild` (double-animation).
- `showConfetti` on `AnimatedCheckbox` / `HabitCheckbox` must only be `true` at streak milestones (7, 30, 100, 365) — never on every tick.

## Related

- **external** — https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html
- **agents** — #17

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                       | Title                                                                            | Merged     |
| -------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------- |
| [#3536](https://github.com/Skords-01/Sergeant/pull/3536) | docs(docs): doc-layer wave 2 — genre contract, monolith splits, hardening matrix | 2026-06-12 |

_Auto-derived from `docs/04-governance/pr-ledger/index.json`. Top 1 most recent PRs touching this file._

<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
