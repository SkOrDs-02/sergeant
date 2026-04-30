---
name: sergeant-design-system
description: "Sergeant project design system rules: Tailwind preset tokens, brand palettes, WCAG-AA -strong companions, module-accent containment, opacity scale, focus-visible, no hex in className. MUST use when writing or reviewing any UI code in apps/web or apps/mobile that involves colors, focus states, Tailwind classes, or brand tokens."
---

# Sergeant Design System — Agent Skill

Project-specific design rules enforced by `packages/eslint-plugin-sergeant-design`. Every UI change in `apps/web` or `apps/mobile` must follow these conventions. Violations break CI.

## Token Architecture

All colours live in `packages/design-tokens/tailwind-preset.js`. The preset defines:

- **Brand families:** `brand`, `accent`, `success`, `warning`, `danger`, `info`
- **Module accents:** `finyk` (emerald), `fizruk` (teal), `routine` (coral), `nutrition` (lime)
- **Semantic surfaces:** `bg-surface`, `text-fg`, `border-border`, `bg-panel`
- **Soft/strong tiers per family:** `bg-{family}-soft`, `text-{family}-strong`, `border-{family}-soft-border`

CSS variables (`--c-{family}-soft`, `--c-{family}-strong`, etc.) swap automatically in dark mode via `apps/web/src/index.css`.

## Hard Rules Checklist (must not break)

### Opacity Scale (Hard Rule #8)

Tailwind only generates `<color>/<N>` when `N` is on the registered scale:

```
0, 5, 8, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100
```

Any other step (`/7`, `/9`, `/12`, `/18`) is silently dropped — the `dark:` override falls through.

```tsx
// ❌ BAD — /12 is not on the scale
<div className="dark:bg-routine/12" />

// ✅ GOOD — /10 and /15 are on the scale
<div className="dark:bg-routine/10" />
```

ESLint: `sergeant-design/valid-tailwind-opacity` (error).

### WCAG-AA Strong Companions (Hard Rule #9)

Saturated brand fills behind `text-white` must use the `-strong` companion (typically -700 step, nutrition uses -800). The base `-500` shades only reach ~2.4–2.8:1 against white.

```tsx
// ❌ BAD — fails WCAG AA
<button className="bg-brand text-white">…</button>

// ✅ GOOD — clears AA (5.2–6.6:1)
<button className="bg-brand-strong text-white">…</button>
```

Exceptions (not flagged): `dark:bg-{family}` (dark surfaces pass), `bg-{family}/N` (soft washes use `text-{family}-strong`), `bg-{family}-{700,800,900}` (explicit dark steps).

ESLint: `sergeant-design/no-low-contrast-text-on-fill` (error).

### No Hex Colors in className (Hard Rule #11)

Raw `<utility>-[#hex]` bypasses the design-system token layer entirely. Dark mode, WCAG-AA promotion, module-accent containment all stop working.

```tsx
// ❌ BAD
<div className="bg-[#10b981] text-[#fff]/50" />

// ✅ GOOD — semantic tokens that adapt per theme
<div className="bg-success-soft text-success-strong" />
```

Need a new shade? Add it to `packages/design-tokens/tailwind-preset.js` with `-soft`/`-strong` companions.

ESLint: `sergeant-design/no-hex-in-classname` (error).

### Module-Accent Containment (Hard Rule #12)

Inside `apps/<app>/src/modules/<X>/`, only `<X>`'s accent utilities may appear. No foreign accents.

```tsx
// apps/web/src/modules/fizruk/pages/PlanCalendar.tsx
// ❌ BAD — coral accent inside a Fizruk page
<button className="focus-visible:ring-routine" />

// ✅ GOOD — module-consistent
<button className="focus-visible:ring-fizruk" />
```

Exempt paths: `src/core/**`, `src/shared/**`, `src/stories/**`, `src/modules/shared/**`, `__tests__/`.

ESLint: `sergeant-design/no-foreign-module-accent` (error).

### No Raw Dark Palette Pairs (Hard Rule #13)

A `className` pairing a raw-palette light utility with a `dark:` raw-palette override must be lifted to semantic tokens.

```tsx
// ❌ BAD — hand-coded light/dark pair
<a className="text-brand-600 dark:text-brand-400">…</a>

// ✅ GOOD — semantic token
<a className="text-brand-strong dark:text-brand">…</a>
```

ESLint: `sergeant-design/no-raw-dark-palette` (error).

### Focus-Visible Over Focus (Hard Rule #14)

Use `focus-visible:` not `focus:` for colour/ring/border utilities. `focus:` fires on pointer clicks too, causing flash.

```tsx
// ❌ BAD — pointer click flashes the ring
<input className="focus:ring-2 focus:ring-brand-500/30" />

// ✅ GOOD — keyboard/assistive-tech only
<input className="focus-visible:ring-2 focus-visible:ring-brand-500/30" />
```

The only legitimate `focus:` utility is `focus:outline-none` (pairs with `focus-visible:ring-*`).

ESLint: `sergeant-design/prefer-focus-visible` (error).

## Module ↔ Accent Mapping

| Module | Accent | Tailwind family |
|--------|--------|-----------------|
| Finyk (фінанси) | Emerald | `finyk` / `emerald` |
| Fizruk (тренування) | Teal | `fizruk` / `teal` |
| Routine (звички) | Coral | `routine` / `coral` |
| Nutrition (харчування) | Lime | `nutrition` / `lime` |

## Quick Reference for Token Usage

| Context | Use | Not |
|---------|-----|-----|
| Background fill + white text | `bg-{family}-strong text-white` | `bg-{family} text-white` |
| Soft wash surface | `bg-{family}-soft text-{family}-strong` | `bg-{family}-500/15 text-{family}-600` |
| Border on cards | `border-{family}-soft-border` | `border-{palette}-200 dark:border-{palette}-800` |
| Focus ring | `focus-visible:ring-{family}` | `focus:ring-{family}` |
| Module page accent | Only matching module's family | Any other module's family |

## Files to Know

- `packages/design-tokens/tailwind-preset.js` — token source of truth
- `packages/design-tokens/tokens.js` — raw token values
- `packages/eslint-plugin-sergeant-design/index.js` — all design lint rules
- `apps/web/src/index.css` — CSS variable definitions (light/dark swap)
- `docs/design/BRANDBOOK.md` — WCAG-AA contrast table
- `docs/design/design-system.md` — full design system documentation
- `docs/design/MODULE-ACCENT.md` — one-accent-one-module principle
