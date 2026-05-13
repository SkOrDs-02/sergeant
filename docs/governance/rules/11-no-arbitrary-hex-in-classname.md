# Rule 11 — No arbitrary hex colors in `className`

> **Category:** `lint-enforced-convention`
> **Severity:** `blocker`
> **Last validated:** 2026-05-13 by @Skords-01
> **Next review:** 2026-08-11
> **Status:** Active

> Per-rule canonical body for Hard Rule #11. Compact summary lives in [`AGENTS.md § Hard rules`](../../../AGENTS.md#hard-rules-do-not-break) (rendered as a table). The machine-readable registry lives in [`docs/governance/hard-rules.json`](../hard-rules.json). The 3-way sync (AGENTS.md ↔ JSON ↔ this file) is enforced by `pnpm lint:hard-rules-registry`.

## Scope

- `apps/web/src/**`
- `apps/mobile/src/**`

## Enforced by

- **eslint-rule** — sergeant-design/no-hex-in-classname (error)

## Why / What is enforced

Raw `<utility>-[#hex]` values in Tailwind `className` (`bg-[#10b981]`, `text-[#fff]/50`, `border-[#abc]`, `ring-[#1234ab]`) bypass the design-system token layer entirely. Dark-mode adaptation, the WCAG-AA `-strong` promotion from rule #9, the module-accent containment from rule #12, and future palette migrations all stop working for those literals — you get a hard-coded colour that no other system in the repo can reason about.

```tsx
// ❌ BAD — off-palette emerald that dark-mode cannot touch
<div className="bg-[#10b981] text-[#fff]/50" />

// ✅ GOOD — status soft token; both `bg-` and `text-` adapt per theme
// via CSS variables owned by the preset.
<div className="bg-success-soft text-success-strong" />

// ✅ GOOD — page-level surface + foreground; semantic and theme-aware.
<div className="bg-surface text-fg" />
```

The rule covers every colour-aware utility (`bg-`, `text-`, `border-`, `ring-`, `fill-`, `stroke-`, `from-`, `to-`, `via-`, `shadow-`, `outline-`, `divide-`, `placeholder-`, `caret-`, `decoration-`, `accent-`) and validates hex length (3 / 4 / 6 / 8 digits). Non-hex arbitrary values (`bg-[oklch(…)]`, `border-[var(--foo)]`, `bg-[rgb(…)]`) are **intentionally left alone** — they can reference CSS variables owned by the preset and are occasionally necessary for one-off interop.

If you genuinely need a new shade, add it to `packages/design-tokens/tailwind-preset.js` (alongside a `-soft` / `-strong` companion per rule #9) instead of inlining hex at the call-site. Enforced by `sergeant-design/no-hex-in-classname` (`error`).

## Related

- **agents** — #11
