# Rule 8 — Tailwind colour-opacity steps must be on the registered scale

> **Category:** `lint-enforced-convention`
> **Severity:** `blocker`
> **Last validated:** 2026-05-13 by @Skords-01
> **Next review:** 2026-08-11
> **Status:** Active

> Per-rule canonical body for Hard Rule #8. Compact summary lives in [`AGENTS.md § Hard rules`](../../../AGENTS.md#hard-rules-do-not-break) (rendered as a table). The machine-readable registry lives in [`docs/governance/hard-rules.json`](../hard-rules.json). The 3-way sync (AGENTS.md ↔ JSON ↔ this file) is enforced by `pnpm lint:hard-rules-registry`.

## Scope

- `apps/web/src/**`
- `packages/design-tokens/**`

## Enforced by

- **eslint-rule** — sergeant-design/valid-tailwind-opacity (error)

## Why / What is enforced

Tailwind only generates the utility `<color>/<N>` when `N` exists in `theme.opacity`. The Sergeant preset (`packages/design-tokens/tailwind-preset.js`) registers:

```
0, 5, 8, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100
```

(Default Tailwind v3 scale steps in 5-pt increments; the explicit `8` is Sergeant's "barely there" 8 % wash on panel surfaces — used for dark-mode module bento tiles, primary/danger row highlights, and Routine surface tints.)

Any other step (`/7`, `/9`, `/12`, `/18`, …) is **silently dropped** — Tailwind emits no class, the surrounding `dark:` / `hover:` / `focus:` variant falls through to the previous declaration, and you typically only notice because dark mode looks wrong (this is exactly bug [#814](https://github.com/Skords-01/Sergeant/pull/814)).

```tsx
// ❌ BAD — `/12` is not on the scale; the `dark:` override silently
// falls through to the light-mode background.
<div className="bg-routine-surface/40 dark:bg-routine/12" />

// ✅ GOOD — `/10` and `/15` are on the scale.
<div className="bg-routine-surface/40 dark:bg-routine/10" />
```

Enforced by `sergeant-design/valid-tailwind-opacity` (`error`). To add a new step, extend the `opacity` map in the preset **and** the `ALLOWED_TAILWIND_OPACITY_STEPS` constant in `packages/eslint-plugin-sergeant-design/index.js` — they must stay in sync.

## Related

- **pr** — #814
- **agents** — #8
