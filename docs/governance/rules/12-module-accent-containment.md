# Rule 12 — Module-accent containment — no foreign accents inside a module subtree

> **Category:** `lint-enforced-convention`
> **Severity:** `blocker`
> **Last validated:** 2026-05-09 by @Skords-01
> **Next review:** 2026-08-07
> **Status:** Active

> Per-rule canonical body for Hard Rule #12. Compact summary lives in [`AGENTS.md § Hard rules`](../../../AGENTS.md#hard-rules-do-not-break) (rendered as a table). The machine-readable registry lives in [`docs/governance/hard-rules.json`](../hard-rules.json). The 3-way sync (AGENTS.md ↔ JSON ↔ this file) is enforced by `pnpm lint:hard-rules-registry`.

## Scope

- `apps/web/src/modules/finyk/**`
- `apps/web/src/modules/fizruk/**`
- `apps/web/src/modules/nutrition/**`
- `apps/web/src/modules/routine/**`

## Enforced by

- **eslint-rule** — sergeant-design/no-foreign-module-accent (error)

## Why / What is enforced

Sergeant's four module accents (`finyk`/emerald, `fizruk`/teal, `routine`/coral, `nutrition`/lime) are deliberately close in saturation. A fizruk screen that accidentally renders a coral `ring-routine` reads to the user as "Рутина" — it's a semantic design bug, not a stylistic choice. Inside the `apps/<app>/src/modules/<X>/` subtree, only `<X>`'s accent utilities (`bg-<X>-surface`, `text-<X>-strong`, `ring-<X>`, `bg-<X>-500/15`, …) may appear.

```tsx
// apps/web/src/modules/fizruk/pages/PlanCalendar.tsx
// ❌ BAD — coral focus ring inside a Fizruk page
<button className="focus-visible:ring-routine" />

// ✅ GOOD — module-consistent focus ring
<button className="focus-visible:ring-fizruk" />
```

The rule handles variant prefixes (`dark:`, `hover:`, `lg:`), shade suffixes (`-500`, `-soft`, `-strong`), and opacity suffixes (`/15`) transparently. Cross-module shells remain **exempt** so the Hub / HubChat / shared widgets can still reference every accent:

- `apps/*/src/core/**`, `apps/*/src/shared/**`, `apps/*/src/stories/**`
- `apps/*/src/modules/shared/**` (non-canonical module folder — a cross-module utility, not an accent owner)
- `__tests__/*.{ts,tsx,mjs}` — test fixtures naturally reference all four for coverage.

Enforced by `sergeant-design/no-foreign-module-accent` (`error`). See `docs/design/module-accent.md` for the "one accent = one module" design principle.

## Related

- **agents** — #12
