# Rule 14 — Visible focus indicators must use `focus-visible:`, not `focus:`

> **Category:** `lint-enforced-convention`
> **Severity:** `blocker`
> **Last validated:** 2026-05-13 by @Skords-01
> **Next review:** 2026-08-11
> **Status:** Active

> Per-rule canonical body for Hard Rule #14. Compact summary lives in [`AGENTS.md § Hard rules`](../../../AGENTS.md#hard-rules-do-not-break) (rendered as a table). The machine-readable registry lives in [`docs/governance/hard-rules.json`](../hard-rules.json). The 3-way sync (AGENTS.md ↔ JSON ↔ this file) is enforced by `pnpm lint:hard-rules-registry`.

## Scope

- `apps/web/src/**`

## Enforced by

- **eslint-rule** — sergeant-design/prefer-focus-visible (error)

## Why / What is enforced

> Why a hard rule? `focus:ring-*` and `focus:bg-*` fire on every focus event — including a pointer click, which produces a flashing ring on every mouse interaction with a button or input. `focus-visible:` is the modern primitive that only fires when the user is navigating with the keyboard or assistive tech. Sergeant's design-system contract (`docs/design/design-system.md`) explicitly lists `focus-visible:ring-2 ring-brand-500/45 ring-offset-2 ring-offset-surface` as the canonical focus indicator and notes "**Focus — `focus-visible:ring-brand-500/30`, а не `focus:`, аби pointer-клік не блимав кільцем**". Every `focus:` colour utility shipped to date predates that rule and is a regression that needs to be migrated.

```tsx
// ❌ BAD — pointer click on the input flashes the brand ring
<input className="focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/30" />

// ✅ GOOD — only keyboard / assistive-tech focus paints the ring;
//          pointer click leaves the input untouched
<input className="focus:outline-none focus-visible:border-brand-400 focus-visible:ring-2 focus-visible:ring-brand-500/30" />

// ❌ BAD — paired raw `focus:` rules duplicate `focus-visible:` (legacy
//          fallback for pre-2022 browsers); modern targets don't need them
<input className="focus-visible:border-brand-400 focus:border-brand-400" />

// ✅ GOOD — `focus-visible:` is supported by Chrome 86+, Safari 15.4+,
//          Firefox 85+; the legacy fallback is dead weight
<input className="focus-visible:border-brand-400" />
```

The single legitimate `focus:` utility is **`focus:outline-none`** — the canonical reset that pairs with `focus-visible:ring-*` so the user-agent outline doesn't double up with the design-system ring.

What the rule **never** flags (these stay):

- `focus:outline-none`, `focus:outline-hidden`, `focus:outline-transparent` — outline resets that pair with `focus-visible:ring-*`.
- `focus:not-sr-only`, `focus:fixed`, `focus:px-4`, `focus:rounded-xl`, … — non-colour layout / sizing utilities. Skip-links use these legitimately to promote a sr-only element to a visible pinned pill on focus, and that's intentional UX.
- `focus:text-sm`, `focus:text-base`, `focus:text-mini`, `focus:text-center`, … — `text-` size / alignment / transform tails that aren't colours.
- `focus:font-semibold` and other typography utilities outside the colour/border/ring/shadow set.
- `lg:focus:bg-panel`, `hover:focus:text-brand-strong`, `dark:focus:border-brand-400`, `group-focus:bg-panel`, `peer-focus:ring-2`, `focus-within:bg-panel`, `focus-visible:ring-brand-500/45` — variant-prefixed `focus:` and the unrelated `:focus-visible` / `:focus-within` / `:group-focus` / `:peer-focus` pseudo-classes.

Enforced by `sergeant-design/prefer-focus-visible` (`error`), scoped to `apps/web/**/*.{ts,tsx,js,jsx}` — React Native (`apps/mobile`, NativeWind) doesn't expose a `:focus-visible` pseudo-class equivalent; mobile uses `onFocus` handlers and the ring concept is web-only. Promoted from absent → `error` in PR [#1158](https://github.com/Skords-01/Sergeant/pull/1158) once the existing 14 paired `focus:` colour utilities (in `Input`, `Select`, `SkipLink`, `InputDialog`, `AssistantCataloguePage`) were migrated to `focus-visible:`.

## Related

- **agents** — #14
