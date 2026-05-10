# Rule 13 — No raw-palette light/dark `className` pairs

> **Category:** `lint-enforced-convention`
> **Severity:** `blocker`
> **Last validated:** 2026-05-09 by @Skords-01
> **Next review:** 2026-08-07
> **Status:** Active

> Per-rule canonical body for Hard Rule #13. Compact summary lives in [`AGENTS.md § Hard rules`](../../../AGENTS.md#hard-rules-do-not-break) (rendered as a table). The machine-readable registry lives in [`docs/governance/hard-rules.json`](../hard-rules.json). The 3-way sync (AGENTS.md ↔ JSON ↔ this file) is enforced by `pnpm lint:hard-rules-registry`.

## Scope

- `apps/web/src/**`
- `apps/mobile/src/**`

## Enforced by

- **eslint-rule** — sergeant-design/no-raw-dark-palette (error)

## Why / What is enforced

A `className` that pairs a raw-palette light utility with a `dark:` raw-palette override encodes both themes by hand at the call-site. The next palette migration (or the next opacity-step renaming — bug [#814](https://github.com/Skords-01/Sergeant/pull/814)) silently drops one half and the surrounding override falls through to the wrong colour. Lift the (light, dark) pair into the design-system token layer (`bg-success-soft`, `bg-finyk-surface`, `text-brand-strong`, `border-routine-soft-border`, …) so the preset owns the swap and the call-site keeps zero `dark:` palette overrides. The full migration history (Wave 1b → 2a → 2b → 2c) lives in [`docs/design/dark-mode-audit.md`](../../design/dark-mode-audit.md).

```tsx
// ❌ BAD — both halves are raw `brand-*` palette steps; the next
// emerald retune silently drops one of them.
<a className="text-brand-600 dark:text-brand-400">…</a>

// ✅ GOOD — `text-brand-strong` is the WCAG-AA companion (no numeric
// step), `dark:text-brand` is the saturated DEFAULT for dark panels.
<a className="text-brand-strong dark:text-brand">…</a>

// ❌ BAD — paired raw-palette borders on a hero card.
<Card className="border border-teal-200/50 dark:border-teal-800/30 …" />

// ✅ GOOD — `border-fizruk-soft-border` is theme-adaptive via
// `--c-fizruk-soft-border` (light = teal-200-ish, dark = teal-900-ish).
<Card className="border border-fizruk-soft-border/50 …" />
```

The rule fires only when **both** halves are present on the same className value:

- a bare `<utility>-<PALETTE>-<SHADE>[/<opacity>]`, AND
- a `dark:<utility>-<PALETTE>-<SHADE>[/<opacity>]`,

where `<utility> ∈ { bg, text, border }` and `<PALETTE>` is one of the 24 raw Tailwind families (`gray`, `slate`, `zinc`, `neutral`, `stone`, `red`, `orange`, `amber`, `yellow`, `lime`, `green`, `emerald`, `teal`, `cyan`, `sky`, `blue`, `indigo`, `violet`, `purple`, `fuchsia`, `pink`, `rose`, plus Sergeant's `brand` / `coral` aliases — both are theme-inert raw palettes despite the brand-y names). `<SHADE>` is a numeric step (`50`, `100`, …, `950`), so semantic suffixes (`brand-soft`, `brand-strong`, `routine-soft-border`) are NOT flagged.

What the rule **never** flags (these stay):

- `dark:bg-white/10`, `dark:bg-black/40`, `dark:border-white/15` — bare-colour glass washes.
- Dark-side-only "patches" where the light side is already semantic (`bg-success-soft text-success-strong dark:text-emerald-100`) — these document gaps in the WCAG-AA `-strong` companion scale on dark panels (rule #9).
- Semantic tokens that happen to carry a `dark:` prefix (`dark:bg-surface`, `dark:text-fg`, `dark:border-border`).

Enforced by `sergeant-design/no-raw-dark-palette` (`error`), scoped to `apps/web/**/*.{ts,tsx,js,jsx}` — the semantic replacements (`bg-{family}-soft`, `border-{module}-soft-border`, …) resolve through `--c-{family}-soft*` CSS variables that live only in `apps/web/src/index.css`. NativeWind (`apps/mobile`) renders classNames into React Native inline styles and does not consume those CSS variables, so the rule does not apply there. Promoted from absent → `error` in PR [#1155](https://github.com/Skords-01/Sergeant/pull/1155) once the audit's inventory hit zero (Wave 2a + 2b in PR [#1153](https://github.com/Skords-01/Sergeant/pull/1153), Wave 1b in [#1149](https://github.com/Skords-01/Sergeant/pull/1149)) and the 40 additional paired call-sites surfaced by the rule were migrated to the canonical Wave 1b shape. Refined in [#1157](https://github.com/Skords-01/Sergeant/pull/1157) to skip variant-prefixed dark utilities (`lg:dark:bg-amber-500/15`, `hover:dark:text-coral-300`, …) — those carry an extra breakpoint or state condition that the rule's bare-pair contract does not model.

## Related

- **agents** — #13
