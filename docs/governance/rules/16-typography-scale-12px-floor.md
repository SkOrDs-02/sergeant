# Rule 16 — Typography scale — semantic styles + 12px floor

> **Category:** `lint-enforced-convention`
> **Severity:** `blocker`
> **Last validated:** 2026-05-09 by @Skords-01
> **Next review:** 2026-08-07
> **Status:** Active

> Per-rule canonical body for Hard Rule #16. Compact summary lives in [`AGENTS.md § Hard rules`](../../../AGENTS.md#hard-rules-do-not-break) (rendered as a table). The machine-readable registry lives in [`docs/governance/hard-rules.json`](../hard-rules.json). The 3-way sync (AGENTS.md ↔ JSON ↔ this file) is enforced by `pnpm lint:hard-rules-registry`.

## Scope

- `apps/web/src/**`
- `packages/design-tokens/**`

## Enforced by

- **convention** — packages/design-tokens/tailwind-preset.js → plugins.semanticTypography (.text-style-\* utilities are the canonical type slots)
- **doc** — docs/design/design-system.md § Типографічна шкала

## Why / What is enforced

> Why a hard rule? Drift on the type scale is invisible until it isn't. Two PRs landed `text-3xs` (9px) on touch targets despite Hard Rule #4-style review (`docs/audits/2026-04-28-ux-ui-audit.md` § Typography utilities неконсистентні). Codifying the floor and the named-style contract closes the gap.

**Use one of the semantic `.text-style-*` utilities whenever a slot has a documented role.** The utilities live in `packages/design-tokens/tailwind-preset.js → plugins.semanticTypography` and bundle font-size, line-height, weight, letter-spacing, and casing so layouts can't drift on any single axis (e.g. shipping the hero size with the wrong weight).

| Utility                | Contract                       | Slot                              |
| ---------------------- | ------------------------------ | --------------------------------- |
| `.text-style-hero`     | 26 / 32 / 700 / -0.02em        | Page H1, hero stat number         |
| `.text-style-title`    | 20 / 28 / 600 / -0.01em        | Section heading, card title       |
| `.text-style-body`     | 16 / 24 / 400                  | Main body copy                    |
| `.text-style-label`    | 14 / 20 / 500                  | Form label, button text           |
| `.text-style-caption`  | 12 / 16 / 400                  | Helper text, metadata, timestamps |
| `.text-style-overline` | 12 / 16 / 600 / 0.06em / UPPER | Section kicker / eyebrow          |

**Floor: 12px (`text-style-caption` / `text-xs`).** `text-3xs` (9px) is removed from the scale; `text-2xs` (10px) is reserved for chart axis ticks and decorative metadata badges (timestamps, badge counts) — never primary content. Anything a user has to read to take an action MUST clear 12px.

**What this rule blocks:**

- New `text-3xs` classes (the token no longer resolves and Tailwind silently drops the class).
- `text-2xs` on primary body copy or button labels — bump to `text-xs` / `.text-style-caption`.
- Bespoke `text-* font-* tracking-* uppercase` combos that re-implement an existing `.text-style-*` utility. Reach for the named utility instead so future retunes propagate from one place.

The `.text-style-overline` utility is the canonical way to render kickers; module-headers that need `text-brand-700` may keep the hand-rolled span (with the existing `// eslint-disable-next-line sergeant-design/no-eyebrow-drift` justification) until SectionHeading exposes a brand-tinted variant.

## Related

- **doc** — docs/audits/2026-04-28-ux-ui-audit.md
- **agents** — #16
