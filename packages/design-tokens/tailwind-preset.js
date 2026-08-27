/**
 * Shared Tailwind preset for Sergeant web + mobile.
 *
 * Contains theme.extend only — universally-safe tokens (colors, radii,
 * spacing, font sizes, animations, etc.). Web-specific plugins
 * (e.g. tailwindcss-animate, @tailwindcss/forms) MUST stay in the
 * consumer config, not here.
 *
 * Consumers must provide their own `content` globs and any platform-
 * specific `presets` (e.g. `nativewind/preset` in mobile, which must
 * come first in the presets array so token overrides win).
 */

import {
  brandColors,
  chartPalette,
  moduleColors,
  statusColors,
  statusStrongHex,
  zTier,
} from "./tokens.js";

/**
 * `"#rrggbb"` → `"R G B"` — форма, яку потребує `rgb(var(--x, R G B))`.
 *
 * AI-CONTEXT: fallback у `var()` тут не косметика. Пресет споживають дві
 * платформи, і мобільний `global.css` визначає лише частину змінних; без
 * другого аргументу невизначена змінна віддала б `rgb( / 1)`, тобто
 * прозорий текст. Fallback лишає значення тим самим, що й до змінних.
 */
const hexToRgbTriple = (hex) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(" ");

/**
 * Маска відривної перфорації — спільна для `.edge-perf` і `.edge-stub`.
 *
 * AI-CONTEXT: винесена в константу навмисно. Дві копії того самого
 * repeating-градієнта розійшлися б при першій же правці кроку, а
 * побачити розбіжність можна було б лише на стику двох поверхонь —
 * тобто в останню чергу. Крок задається змінною `--edge-perf`, тож
 * утиліта, яка її перевизначить, змінить і зубці, і відступ разом.
 */
const EDGE_PERF_MASK =
  "repeating-linear-gradient(90deg,#000 0 calc(var(--edge-perf)*2),#0000 calc(var(--edge-perf)*2) calc(var(--edge-perf)*3)) 0 100%/100% var(--edge-perf) no-repeat," +
  "linear-gradient(#000 0 0) 0 0/100% calc(100% - var(--edge-perf)) no-repeat";

/** @type {import('tailwindcss').Config} */
const preset = {
  content: [],
  theme: {
    extend: {
      fontFamily: {
        // Sergeant v2 redesign (2026-05) — Manrope as primary; DM Sans
        // Variable retained as fallback during PR-2..PR-8 rollout. The
        // PR-8 polish pass decides whether to retire DM Sans entirely
        // based on `pnpm size-limit` measurement. Fallback metrics live
        // in `apps/web/src/styles/theme.css` (Manrope Fallback @font-face).
        sans: [
          '"Manrope Variable"',
          '"Manrope"',
          '"Manrope Fallback"',
          '"DM Sans Variable"',
          '"DM Sans"',
          "system-ui",
          "-apple-system",
          '"Segoe UI"',
          "sans-serif",
        ],
        // Display ramp — same family, semantically used for hero/H1/H2
        // stacks (weight 800 in v2 type ramp).
        display: [
          '"Manrope Variable"',
          '"Manrope"',
          '"Manrope Fallback"',
          '"DM Sans Variable"',
          '"DM Sans"',
          "system-ui",
          "-apple-system",
          '"Segoe UI"',
          "sans-serif",
        ],
        // Mono — JetBrains Mono Variable for technical values (large
        // hero numbers, money, code blocks). Variable so a single woff2
        // covers weight 100..800 without per-weight files.
        mono: [
          '"JetBrains Mono Variable"',
          '"JetBrains Mono"',
          "ui-monospace",
          "SFMono-Regular",
          '"SF Mono"',
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      colors: {
        // ═══════════════════════════════════════════════════════════════════
        // SEMANTIC UI COLORS — CSS variables for automatic dark mode support
        // ═══════════════════════════════════════════════════════════════════
        bg: "rgb(var(--c-bg) / <alpha-value>)",
        panel: "rgb(var(--c-panel) / <alpha-value>)",
        panelHi: "rgb(var(--c-panel-hi) / <alpha-value>)",
        line: "rgb(var(--c-line) / <alpha-value>)",
        text: "rgb(var(--c-text) / <alpha-value>)",
        muted: "rgb(var(--c-muted) / <alpha-value>)",
        subtle: "rgb(var(--c-subtle) / <alpha-value>)",
        primary: "rgb(var(--c-primary) / <alpha-value>)",

        // ─── Semantic aliases (preferred in new code) ──────────────────────
        // Map 1:1 to the existing tokens above; dark mode "just works" because
        // they resolve through the same CSS variables.
        //
        // Naming contract:
        //   surface / surface-muted / surface-strong — background surfaces
        //   fg / fg-muted / fg-subtle               — text / icon foregrounds
        //   border / border-strong                  — dividers & outlines
        //   accent                                  — brand accent (focus/CTA)
        surface: "rgb(var(--c-panel) / <alpha-value>)",
        "surface-muted": "rgb(var(--c-panel-hi) / <alpha-value>)",
        "surface-strong": "rgb(var(--c-bg) / <alpha-value>)",
        fg: "rgb(var(--c-text) / <alpha-value>)",
        "fg-muted": "rgb(var(--c-muted) / <alpha-value>)",
        "fg-subtle": "rgb(var(--c-subtle) / <alpha-value>)",
        border: "rgb(var(--c-border) / <alpha-value>)",
        "border-strong": "rgb(var(--c-border-strong) / <alpha-value>)",
        accent: "rgb(var(--c-accent) / <alpha-value>)",
        ring: "rgb(var(--c-accent) / <alpha-value>)",

        // ─── Semantic A11y / states tokens ────────────────────────────────
        // Decoupled from the raw `brand-*` / `line` palettes so primitives
        // never spell out a colour family for a keyboard-focus ring,
        // `::selection` wash, caret, scrollbar, or divider. Backed by CSS
        // variables in `apps/web/src/styles/theme.css` (light + dark) and
        // mirrored in `apps/mobile/global.css`. WCAG 2.4.11 / 1.4.11 —
        // the ring tokens are tuned to ≥3:1 against the neighbour surface
        // in both themes (light: emerald-500 on cream; dark: emerald-400
        // on warm-charcoal panel).
        //
        // Canonical focus pattern (Hard Rule #14 — `focus-visible:`, not
        // `focus:`):
        //   focus-visible:ring-2 ring-focus/45 ring-offset-2 ring-offset-bg
        //
        // Use `ring-focus-strong` (no /alpha) for high-contrast focus on
        // busy surfaces (e.g. hero cards) where the soft ring would be
        // lost in the gradient.
        focus: "rgb(var(--c-ring) / <alpha-value>)",
        "focus-strong": "rgb(var(--c-ring-strong) / <alpha-value>)",
        "focus-offset": "rgb(var(--c-ring-offset) / <alpha-value>)",
        // Selection — paired with the `::selection` rule in
        // `apps/web/src/styles/base.css`. `bg-selection` / `text-selection`
        // are exposed for one-off custom selection states (e.g. mock
        // selection in a tutorial / overlay).
        selection: "rgb(var(--c-selection-bg) / <alpha-value>)",
        "selection-fg": "rgb(var(--c-selection-fg) / <alpha-value>)",
        // Caret — apply via `caret-brand` on inputs / textareas.
        caret: "rgb(var(--c-caret) / <alpha-value>)",
        // Divider trio — `divider` is the default split between rows;
        // `-weak` is a feather hairline inside a single-surface group;
        // `-strong` is the prominent split between major sections.
        // Prefer over generic `border-line` / `border-border` when the
        // intent is "separator", not "outline".
        divider: "rgb(var(--c-divider) / <alpha-value>)",
        "divider-weak": "rgb(var(--c-divider-weak) / <alpha-value>)",
        "divider-strong": "rgb(var(--c-divider-strong) / <alpha-value>)",
        // Scrollbar thumb/track tokens — usually applied by the global
        // `::-webkit-scrollbar` rule in `apps/web/src/styles/base.css`,
        // but exposed here for custom scroll regions that need a tinted
        // thumb (e.g. a sidebar over a coloured surface).
        "scrollbar-thumb": "rgb(var(--c-scrollbar-thumb) / <alpha-value>)",
        "scrollbar-thumb-hover":
          "rgb(var(--c-scrollbar-thumb-hover) / <alpha-value>)",
        "scrollbar-track": "rgb(var(--c-scrollbar-track) / <alpha-value>)",

        // Ambient module accent — picks up the current module's brand
        // color from `--module-accent-rgb` published by
        // `ModuleAccentProvider` / `ModuleShell`. Inside a module, use
        // `bg-module-accent/10`, `text-module-accent`, `border-module-accent-strong`
        // etc. — no hardcoded `bg-finyk` / `bg-fizruk` per surface.
        // The `-strong` variant is the WCAG-AA companion for solid
        // fills behind `text-white`. Outside the provider both vars
        // are undefined and the utility falls back to `rgb()` with
        // empty channels (effectively transparent); only use inside a
        // module subtree. See docs/design/module-accent.md.
        "module-accent": "rgb(var(--module-accent-rgb) / <alpha-value>)",
        "module-accent-strong":
          "rgb(var(--module-accent-strong-rgb) / <alpha-value>)",

        // Hero-surface text — «Чорнило» v3.1 § 3. Content nested inside a
        // `prominence="hero"` Card sits on a saturated module gradient in
        // BOTH themes (light: the new `--hero-grad-*` anchor; dark: the
        // `--hero-ink-*` near-black fill from § 2) — the surface is always
        // dark enough to need light text, so this is one flat colour with
        // no `.dark` flip. `text-hero-ink/75` is the eyebrow/muted tier.
        "hero-ink": "#fdf9f3",

        // ═══════════════════════════════════════════════════════════════════
        // BRAND COLORS — Neutral hub chrome (warm stone)
        //
        // 2026-07 design-audit M1: `brand` is the HUB / shell identity and is
        // deliberately NEUTRAL — a warm-stone ramp with no module hue. The
        // four modules own the colour (finyk teal · fizruk cyan · routine
        // rose · nutrition lime); the shell stays quiet so exactly one accent
        // reads per screen. Previously `brand` aliased teal, making the hub
        // indistinguishable from finyk and effectively a fifth accent — that
        // weakened module-accent containment (Hard Rule #12).
        //
        // Keyboard focus is a SEPARATE concern: it stays teal via `--c-ring`
        // (see theme.css § A11Y), so decoupling `brand` from teal does not
        // dull the focus indicator.
        //
        // WCAG-AA: stone-700 (#44403c) clears ~8.5:1 on cream for text/icons;
        // `strong` ��� stone-800 (#292524, ~14:1 with text-white) for solid
        // fills; white on stone-700 ≈ 9.6:1.
        // ═══════════════════════════════════════════════════════════════════
        brand: {
          DEFAULT: brandColors.stone[700], // #44403c — hub text/icons on cream
          light: brandColors.stone[500], // #78716c
          dark: brandColors.stone[800], // #292524
          subtle: brandColors.stone[100], // #f5f5f4
          // `strong` — WCAG-AAA companion for solid fills (text-white on top).
          strong: brandColors.stone[800], // #292524 — ~14:1 with text-white
          ...brandColors.stone,
        },
        // Still available for finyk module surfaces and explicit `teal-*`
        // call-sites; `brand` no longer aliases it.
        teal: brandColors.teal,
        stone: brandColors.stone,
        // Sergeant v2 fizruk accent palette (introduced 2026-05 redesign).
        // Use `cyan-700` / `cyan-800` instead of `teal-500` / `teal-700`
        // for fizruk module surfaces — see docs/design/redesign-v2.md.
        cyan: brandColors.cyan,
        cream: brandColors.cream,
        rose: brandColors.rose,
        lime: brandColors.lime,

        // ═══════════════════════════════════════════════════════════════════
        // STATUS COLORS — Consistent semantic meanings
        // Each status has a solid accent (for fills / icons / rings) plus a
        // `-soft` background token that resolves through CSS variables so
        // dark mode works without bespoke dark: overrides, and a `-strong`
        // companion (text-on-cream / fill-with-white) that clears WCAG AA
        // at body sizes. See docs/design/brand-palette-wcag-aa-proposal.md.
        // ═══════════════════════════════════════════════════════════════════
        // AI-CONTEXT (2026-08-21): чотири базові статуси читаються через
        // `--c-{status}`, а не як літерал. Змінні існували в theme.css від
        // початку (і `html.hc` навіть перекидав їх на тир -800), але жодна
        // з них НЕ доїжджала в утиліту — пресет віддавав статичний -500 у
        // будь-якій темі. Тобто режим високого контрасту мовчки не діяв на
        // `text-danger`, а темна тема не мала способу підняти тир узагалі.
        // Fallback лишає -500 там, де змінних немає (мобільний preset).
        success: `rgb(var(--c-success, ${hexToRgbTriple(statusColors.success)}) / <alpha-value>)`,
        danger: `rgb(var(--c-danger, ${hexToRgbTriple(statusColors.danger)}) / <alpha-value>)`,
        warning: `rgb(var(--c-warning, ${hexToRgbTriple(statusColors.warning)}) / <alpha-value>)`,
        info: `rgb(var(--c-info, ${hexToRgbTriple(statusColors.info)}) / <alpha-value>)`,
        "success-soft": "rgb(var(--c-success-soft) / <alpha-value>)",
        "warning-soft": "rgb(var(--c-warning-soft) / <alpha-value>)",
        "danger-soft": "rgb(var(--c-danger-soft) / <alpha-value>)",
        "info-soft": "rgb(var(--c-info-soft) / <alpha-value>)",
        // `-soft-fg` — theme-aware FOREGROUND ink for status soft fills
        // (soft Badges/Banners). Mirrors the brand/module `-soft-fg`
        // contract: a single utility resolves to a deep ink on the pale
        // light/HC `-soft` surface and a bright `-300/-200` accent on the
        // deep dark `-soft` surface. Replaces the static `text-{c}-strong`
        // (emerald-700/amber-700/…) whose fixed hex went sub-AA once HC
        // bumped the `-soft` surface a step darker. Backed by
        // `--c-{c}-soft-fg` in theme.css (light/dark/HC).
        "success-soft-fg": "rgb(var(--c-success-soft-fg) / <alpha-value>)",
        "warning-soft-fg": "rgb(var(--c-warning-soft-fg) / <alpha-value>)",
        "danger-soft-fg": "rgb(var(--c-danger-soft-fg) / <alpha-value>)",
        "info-soft-fg": "rgb(var(--c-info-soft-fg) / <alpha-value>)",
        // Brand soft tint trio (Wave 1b). Theme-adaptive via `--c-brand-soft*`
        // in `apps/web/src/styles/theme.css`. Call-sites that previously wrote
        // `bg-brand-50 dark:bg-brand-500/15` collapse to a single
        // `bg-brand-soft` (see docs/design/dark-mode-audit.md).
        "brand-soft": "rgb(var(--c-brand-soft) / <alpha-value>)",
        "brand-soft-border": "rgb(var(--c-brand-soft-border) / <alpha-value>)",
        "brand-soft-hover": "rgb(var(--c-brand-soft-hover) / <alpha-value>)",
        // Theme-aware FOREGROUND ink for brand soft-tinted controls (soft
        // Tabs/Badges/Buttons on `bg-brand-soft`). Mirrors the module
        // `-soft-fg` contract: deep ink on the pale light/HC surface, bright
        // accent on the deep dark surface. Backed by `--c-brand-soft-fg`.
        "brand-soft-fg": "rgb(var(--c-brand-soft-fg) / <alpha-value>)",
        // WCAG-AA companions: `bg-{c}-strong text-white` on solid fills
        // (Buttons, Badges, Tabs). Значення — з `statusStrongHex`, а не
        // літералами тут: літерали не мали гейта й розійшлися з фактом
        // (див. AI-CONTEXT біля мапи в `tokens.js`).
        //
        // AI-DANGER: 2026-08-21 — це ЗАЛИВКА, і вона однакова в обох
        // темах. Текстовий бік `-strong` живе окремо, у `textColor` нижче,
        // і в темній темі віддає інший тир. Не «зводь» їх назад в одне
        // значення: заливці під `text-white` потрібна люмінантність ≤0.183,
        // тексту на чорнилі — ≥0.20, і спільного числа між ними не існує.
        "success-strong": statusStrongHex.success, // #065f46 — 6.44:1 на #ecebe7 / 7.68:1 на білому
        "warning-strong": statusStrongHex.warning, // #92400e — 5.94:1 на #ecebe7 / 7.09:1 на білому
        "danger-strong": statusStrongHex.danger, // #991b1b — 6.97:1 на #ecebe7 / 8.31:1 на білому
        "info-strong": statusStrongHex.info, // #075985 — 6.34:1 на #ecebe7 / 7.56:1 на білому

        // ═══════════════════════════════════════════════════════════════════
        // CHART PALETTE — For pie charts, graphs, data visualization
        // ═══════════════════════════════════════════════════════════════════
        chart: chartPalette,

        // Chart-series tokens — semantic per-module tokens for bar charts
        // AND heatmap/progress fills (`bg-chart-{module}`). Backed by the
        // `--c-chart-{module}` CSS vars in `apps/web/src/styles/theme.css`,
        // which flip per theme (light -800 tier ≥5:1 on cream; dark -400
        // tier; HC -800/-300) — see the theme.css comment above those vars.
        // The static fallback (light-tier hex, same values as before
        // 2026-08 design-audit T8) keeps consumers that don't define the
        // vars (e.g. a future bare-preset usage) rendering the light tier
        // as before, instead of silently going transparent.
        "chart-finyk": "rgb(var(--c-chart-finyk, 17 94 89) / <alpha-value>)", // teal-800 — 5.12:1 (2026-07: was emerald-700)
        "chart-fizruk": "rgb(var(--c-chart-fizruk, 21 94 117) / <alpha-value>)", // cyan-800 — 7.5:1 (v2 redesign: was teal-700 5.22:1)
        "chart-routine":
          "rgb(var(--c-chart-routine, 172 76 100) / <alpha-value>)", // rose-700 — 5.06:1
        "chart-nutrition":
          "rgb(var(--c-chart-nutrition, 70 98 18) / <alpha-value>)", // lime-800 — 6.64:1

        // ═══════════════════════════════════════════════════════════════════
        // MODULE-SPECIFIC COLORS — Each module has its own personality
        // ═══════════════════════════════════════════════════════════════════

        /** Фінік — Teal фінансовий трекер (2026-07: was emerald). */
        finyk: {
          DEFAULT: moduleColors.finyk.primary,
          secondary: moduleColors.finyk.secondary,
          surface: moduleColors.finyk.surface,
          surfaceAlt: moduleColors.finyk.surfaceAlt,
          hover: brandColors.teal[600], // 2026-07: was emerald-600
          // teal-800 — WCAG-AA companion under `text-white`; matches
          // `moduleAccentRgb.finyk.strong` + `chart-finyk` (2026-07: was
          // emerald-700, which left `bg-finyk-strong` off-hue from the
          // already-migrated teal DEFAULT).
          strong: brandColors.teal[800],
          ring: brandColors.teal[200], // 2026-07: was emerald-200
          // Dark-mode subtitle companion. The DEFAULT teal clears AA for
          // full-opacity dark text on `--c-panel`, but the de-emphasised
          // `/70` subtitle slot dips sub-AA for normal text. `text-finyk-300`
          // (teal-300) is the lighter tier used ONLY in the `dark:` `/70`
          // subtitle slot. Mirrors the `fizruk-300` precedent; do NOT use it
          // for full-opacity finyk text — the DEFAULT already passes AA.
          // (2026-07: was emerald-300.)
          300: brandColors.teal[300],
          // `soft` / `soft-border` / `soft-hover` are now theme-adaptive
          // via `--c-finyk-soft*` (Wave 1b). Light values are the teal
          // `-50` / `-200` / `-100` tiers; dark values flip to the
          // `-900` / `-800` family so dark mode stops showing a bright
          // pale fill on the warm-charcoal panel. (2026-07: was emerald.)
          soft: "rgb(var(--c-finyk-soft) / <alpha-value>)",
          "soft-border": "rgb(var(--c-finyk-soft-border) / <alpha-value>)",
          "soft-hover": "rgb(var(--c-finyk-soft-hover) / <alpha-value>)",
          // Theme-aware foreground for soft-fill controls (`Button`
          // `finyk-soft`). Light = teal-800 ink; dark = teal-300 so
          // text clears WCAG AA on `bg-finyk/15` over the dark panel.
          // Backed by `--c-finyk-soft-fg` (light/dark/HC in theme.css).
          "soft-fg": "rgb(var(--c-finyk-soft-fg) / <alpha-value>)",
        },

        /** Фізрук — Cyan fitness tracker (v2 redesign 2026-05; was teal). */
        fizruk: {
          DEFAULT: moduleColors.fizruk.primary,
          secondary: moduleColors.fizruk.secondary,
          surface: moduleColors.fizruk.surface,
          accent: moduleColors.fizruk.accent,
          hover: brandColors.cyan[600],
          strong: brandColors.cyan[800],
          ring: brandColors.cyan[200],
          // Dark-mode text companion. The v2 redesign moved fizruk's DEFAULT
          // accent to cyan-700 (#0e7490) to disambiguate from finyk emerald,
          // but cyan-700 is too dark to read as text on the warm-charcoal dark
          // panel (≈3.1:1 full / ≈2.2:1 at /70 — both sub-AA). `text-fizruk-300`
          // (cyan-300) is the light tier used only in `dark:` text slots, the
          // same shape as `success`'s `dark:text-brand-300` (≥11:1 on
          // `--c-panel`). The other modules keep their bright DEFAULT for dark
          // text (emerald / rose / lime-500 already clear AA); only cyan-700
          // needed a dedicated lighter dark-text step.
          300: brandColors.cyan[300],
          // Theme-adaptive soft tint trio (Wave 1b).
          soft: "rgb(var(--c-fizruk-soft) / <alpha-value>)",
          "soft-border": "rgb(var(--c-fizruk-soft-border) / <alpha-value>)",
          "soft-hover": "rgb(var(--c-fizruk-soft-hover) / <alpha-value>)",
          // Theme-aware foreground for soft-fill controls (`Button`
          // `fizruk-soft`). Light = cyan-800 ink; dark = cyan-300 so text
          // clears WCAG AA on `bg-fizruk/15` over the dark panel/hero (the
          // prior cyan-700 ink measured ~1.77:1). Backed by
          // `--c-fizruk-soft-fg`.
          "soft-fg": "rgb(var(--c-fizruk-soft-fg) / <alpha-value>)",
          // `tile` + `tile-border` — subtle stat-tile wash on the
          // fizruk hero gradient (Wave 2a). Light=teal-800,
          // dark=white. Apply with the registered opacity scale,
          // typically `bg-fizruk-tile/10` and
          // `border-fizruk-tile-border/15`.
          tile: "rgb(var(--c-fizruk-tile) / <alpha-value>)",
          "tile-border": "rgb(var(--c-fizruk-tile-border) / <alpha-value>)",
        },

        /** Рутина — Soft rose habit tracker */
        routine: {
          DEFAULT: moduleColors.routine.primary,
          secondary: moduleColors.routine.secondary,
          surface: moduleColors.routine.surface,
          // Tint крок між surface (rose-50 #fff5f6) та surfaceAlt (rose-100 #ffe7eb) —
          // використовується для виділення активного дня / виконаного слота в календарі.
          // AI-CONTEXT (2026-08-07): було `#ffeeeb` — персиковий відтінок
          // коралової епохи, який після заміни рампи лишився сиротою: він не
          // лежить між rose-50 і rose-100, а тягне в інший тон. Тепер це
          // рівно середина двох сусідніх тирів.
          surface2: "#ffeef0",
          surfaceAlt: moduleColors.routine.surfaceAlt,
          hover: brandColors.rose[600],
          // AI-CONTEXT (2026-08-07): `-800`, як і решта трьох модулів. На
          // `-700` `text-routine-strong` давав 4.43 на фоні сторінки — нижче
          // AA (див. `moduleAccentRgb` у tokens.js).
          strong: brandColors.rose[800],
          kicker: brandColors.rose[600],
          eyebrow: brandColors.rose[500],
          line: brandColors.rose[200],
          ring: brandColors.rose[300],
          done: brandColors.rose[700],
          nav: brandColors.rose[500],
          // Dark-mode subtitle companion — same rationale as `finyk.300`.
          // rose-500/70 ≈ 3.6:1 (sub-AA for normal text); rose-300/70 ≈
          // 5.5:1. Used ONLY in the `dark:` `/70` subtitle slot — the DEFAULT
          // rose-500 already clears AA for full-opacity dark text.
          300: brandColors.rose[300],
          // Theme-adaptive soft tint trio (Wave 1b).
          soft: "rgb(var(--c-routine-soft) / <alpha-value>)",
          "soft-border": "rgb(var(--c-routine-soft-border) / <alpha-value>)",
          "soft-hover": "rgb(var(--c-routine-soft-hover) / <alpha-value>)",
          // Theme-aware foreground for soft-fill controls (`Button`
          // `routine-soft`). Light = rose-700 ink; dark = rose-300 so text
          // clears WCAG AA on `bg-routine/15` over the dark panel. Backed by
          // `--c-routine-soft-fg`.
          "soft-fg": "rgb(var(--c-routine-soft-fg) / <alpha-value>)",
        },

        /** Харчування — Fresh lime nutrition tracker */
        nutrition: {
          DEFAULT: moduleColors.nutrition.primary,
          secondary: moduleColors.nutrition.secondary,
          surface: moduleColors.nutrition.surface,
          surfaceAlt: moduleColors.nutrition.surfaceAlt,
          hover: brandColors.lime[600],
          strong: brandColors.lime[800],
          ring: brandColors.lime[200],
          // Theme-adaptive soft tint trio (Wave 1b).
          soft: "rgb(var(--c-nutrition-soft) / <alpha-value>)",
          "soft-border": "rgb(var(--c-nutrition-soft-border) / <alpha-value>)",
          "soft-hover": "rgb(var(--c-nutrition-soft-hover) / <alpha-value>)",
          // Theme-aware foreground for soft-fill controls (`Button`
          // `nutrition-soft`). Light = lime-800 ink; dark = lime-300 so text
          // clears WCAG AA on `bg-nutrition/15` over the dark panel. Backed
          // by `--c-nutrition-soft-fg`.
          "soft-fg": "rgb(var(--c-nutrition-soft-fg) / <alpha-value>)",
        },

        // ═══════════════════════════════════════════════════════════════════
        // MODULE DARK-MODE TOKENS — semantic surfaces & borders for dark
        // theme. Each is a standalone CSS variable (see `.dark` block in
        // `apps/web/src/styles/theme.css`) decoupled from the live module accent
        // (`finyk`, `routine`, …) so that opacity tints applied in dark
        // mode don't silently drift if the primary accent is retuned.
        //
        // Use them with the `dark:` variant + an opacity step on the
        // registered scale (8 / 10 / 15 / 20 / 25 / 30 / 40 / …):
        //
        //   dark:bg-routine-surface-dark/10
        //   dark:hover:bg-routine-surface-dark/25
        //   dark:border-routine-border-dark/30
        //   dark:ring-routine-border-dark/40
        //
        // AI-CONTEXT: Replaces the older `dark:bg-routine/10` /
        // `dark:border-finyk/30` pattern. The named token makes the
        // design intent explicit and survives accent retuning.
        // ═══════════════════════════════════════════════════════════════════
        "finyk-surface-dark":
          "rgb(var(--c-finyk-surface-dark) / <alpha-value>)",
        "finyk-border-dark": "rgb(var(--c-finyk-border-dark) / <alpha-value>)",
        "fizruk-surface-dark":
          "rgb(var(--c-fizruk-surface-dark) / <alpha-value>)",
        "fizruk-border-dark":
          "rgb(var(--c-fizruk-border-dark) / <alpha-value>)",
        "routine-surface-dark":
          "rgb(var(--c-routine-surface-dark) / <alpha-value>)",
        "routine-border-dark":
          "rgb(var(--c-routine-border-dark) / <alpha-value>)",
        "nutrition-surface-dark":
          "rgb(var(--c-nutrition-surface-dark) / <alpha-value>)",
        "nutrition-border-dark":
          "rgb(var(--c-nutrition-border-dark) / <alpha-value>)",

        // ─── Celebration / Gamification ──────────────────────────────────
        celebration: "rgb(var(--c-celebration) / <alpha-value>)",
        // Драбина «жару» серії — тем-залежні щаблі (див. theme.css).
        // Компонент мапить серію на щабель, тему вирішує CSS.
        "streak-3": "rgb(var(--c-streak-tier-3) / <alpha-value>)",
        "streak-7": "rgb(var(--c-streak-tier-7) / <alpha-value>)",
        "streak-14": "rgb(var(--c-streak-tier-14) / <alpha-value>)",
        "streak-30": "rgb(var(--c-streak-tier-30) / <alpha-value>)",
        "streak-60": "rgb(var(--c-streak-tier-60) / <alpha-value>)",
        "streak-100": "rgb(var(--c-streak-tier-100) / <alpha-value>)",

        // ═══════════════════════════════════════════════════════════════════
        // SERGEANT v2 REDESIGN TOKENS (introduced 2026-05)
        //
        // Coexists with the legacy `bg` / `panel` / `text` / `muted` / `line`
        // semantic tokens above. The v2 set introduces:
        //
        //   `ink`, `ink-strong`     — display & body ink tokens for the v2
        //                             type ramp (Manrope-bound in PR-2).
        //   `surface-glass*`        — translucent floating-glass surfaces
        //                             used by v2 Card / Sheet / nav. Alpha
        //                             is baked in by design intent; these
        //                             utilities do NOT support the opacity
        //                             modifier syntax (Hard Rule #8 — alpha
        //                             must be on the registered scale).
        //   `line-v2`, `line-strong-v2` — hairline / divider tokens tuned
        //                             for the glass surfaces.
        //
        // Backed by CSS variables in `apps/web/src/styles/theme.css` (light
        // + dark + HC) — see docs/design/redesign-v2.md.
        // ═══════════════════════════════════════════════════════════════════
        // Solid v2 ink tokens — triplets, support opacity modifier
        // (`text-ink/80`, `bg-ink-strong`, etc.).
        ink: "rgb(var(--c-ink) / <alpha-value>)",
        "ink-strong": "rgb(var(--c-ink-strong) / <alpha-value>)",
        "muted-v2": "rgb(var(--c-muted-v2) / <alpha-value>)",
        "subtle-v2": "rgb(var(--c-subtle-v2) / <alpha-value>)",
        // Background base — v2 mesh-gradient surface uses this as fallback.
        "bg-base": "rgb(var(--c-bg-base) / <alpha-value>)",
        // Alpha-baked tokens — glass surfaces & hairlines. These do NOT
        // support the Tailwind opacity modifier (e.g. `bg-surface-glass/95`
        // is invalid). Alpha is encoded in the CSS variable itself, tuned
        // per theme (light glass = 0.82, dark glass = 0.06, HC = 1.0).
        "surface-glass": "var(--surface-glass)",
        "surface-strong-glass": "var(--surface-strong-glass)",
        "surface-soft-glass": "var(--surface-soft-glass)",
        "surface-line": "var(--surface-line)",
        "line-v2": "var(--line-v2)",
        "line-strong-v2": "var(--line-strong-v2)",
      },

      // ═══════════════════════════════════════════════════════════════════
      // TEXT COLOR — тема-залежний чорнильний тир для `text-{status}-strong`
      // ═══════════════════════════════════════════════════════════════════
      // AI-CONTEXT (2026-08-21, репорт тестера «червоні літери в темній
      // темі погано видно»): `-strong` несе ДВІ ролі — заливку під
      // `text-white` і текст на поверхні сторінки. У світлій темі одне
      // значення (тир -800) обслуговує обидві. У «Чорнилі» — ні: та сама
      // red-800 на картці #1b1613 дає 1.9:1, тобто текст помилки форми
      // практично невидимий.
      //
      // Tailwind дозволяє розвести ролі без жодної правки в call-site-ах:
      // `colors` лишається джерелом для `bg-`/`border-`, а цей блок
      // перекриває РІВНО утиліту `text-`. Тому всі 376 місць
      // `text-{status}-strong` стають тема-залежними, а ~20 заливок
      // `bg-{status}-strong text-white` лишаються з вивіреним тиром -800.
      //
      // Чому не ручні `dark:`-пари: саме вони й були механізмом раніше —
      // і мовчки пропустили третину місць (125 із 175 `text-danger-strong`
      // мали пару, решта малювала темно-червоне по темному). Пара в
      // className не має гейта; змінна має — `theme.softContrast.test.ts`.
      //
      // Самі значення тира живуть у `statusInkHex` (tokens.js) і
      // дзеркаляться в `--c-{status}-ink` у `apps/web/src/styles/theme.css`
      // — так само, як `inkTheme` дзеркалиться в `--c-bg`/`--c-text`.
      // Тут лишається fallback на світлий тир: платформа без цих змінних
      // (мобільний `global.css`) рендерить рівно те, що й раніше.
      textColor: {
        "success-strong": `rgb(var(--c-success-ink, ${hexToRgbTriple(statusStrongHex.success)}) / <alpha-value>)`,
        "warning-strong": `rgb(var(--c-warning-ink, ${hexToRgbTriple(statusStrongHex.warning)}) / <alpha-value>)`,
        "danger-strong": `rgb(var(--c-danger-ink, ${hexToRgbTriple(statusStrongHex.danger)}) / <alpha-value>)`,
        "info-strong": `rgb(var(--c-info-ink, ${hexToRgbTriple(statusStrongHex.info)}) / <alpha-value>)`,
      },

      // ═══════════════════════════════════════════════════════════════════
      // OPACITY — module/status tint scale
      // ═══════════════════════════════════════════════════════════════════
      // AI-CONTEXT: Tailwind's default opacity scale steps in 5-pt
      // increments (5, 10, 15…), so `<color>/8` is otherwise undefined.
      // The Sergeant palette uses an 8 % wash as the canonical "barely
      // there" tint over panel surfaces (e.g. dark-mode module bento
      // tiles, primary/danger row highlights). Keep this entry — many
      // call sites depend on it.
      opacity: {
        8: "0.08",
      },

      // ═══════════════════════════════════════════════════════════════════
      // BORDER RADIUS — 3 semantic tiers (see docs/design/radius-rhythm.md)
      //
      //   CONTROL  (12 px, rounded-xl)   — buttons, inputs, badges, chips,
      //                                    icon-buttons, segmented controls
      //   CARD     (16 px, rounded-2xl)  — cards, panels, list items,
      //                                    dropdowns, sticky banners
      //   HERO     (24 px, rounded-3xl)  — modals, sheets, hero cards,
      //                                    module bento tiles
      //
      //   PILL     (9999 px, rounded-full) — FAB, avatars, status dots, tags
      //   SWATCH   (2 px, rounded-sm)      — heatmap cells, chart legend dots
      //
      // 4xl / 5xl exist for one-off illustration surfaces (onboarding
      // hero blob); they are NOT part of the regular rhythm.
      //
      // Forbidden in new code:
      //   `rounded-lg` (8 px)  — sits between CONTROL and CARD with no role
      //   `rounded-md` (6 px)  — folded into CONTROL; reach for `rounded-xl`
      //   `rounded` / `rounded-DEFAULT` (4 px) — no semantic slot at all
      //
      // Lint: see `eslint-plugin-sergeant-design`. The design-system audit
      // sweeps remaining call sites incrementally — when touching a file
      // you usually want `rounded-xl` for ≤ 40 px controls and `rounded-2xl`
      // for surfaces ≥ 48 px tall.
      // ════��══════════════════════════════════════════════════════════════
      borderRadius: {
        "2xl": "16px",
        "3xl": "24px",
        "4xl": "32px",
        "5xl": "40px",
        full: "9999px",
        // 2026-07 design-audit: the parallel Sergeant v2 radius namespace
        // (`r-md`/`r-lg`/`r-xl`/`r-2xl`, 12/14/18/24 px) was removed. It
        // duplicated the CONTROL/CARD/HERO rhythm, introduced off-rhythm
        // 14/18 px values, and its `rounded-r-*` classes shadowed
        // Tailwind's native per-corner `rounded-r-{size}` utilities. All
        // call sites were migrated onto the canonical scale above /
        // `rounded-xl`. See docs/05-design/design/radius-rhythm.md.
      },

      // ══════════���════════════════════════════════════════════════════════
      // BOX SHADOWS — Semantic elevation scale e0..e5
      //
      // The `e0..e5` scale is the canonical elevation contract — see
      // `elevation` token in `./tokens.js` for the per-level light/dark
      // recipe. CSS variables `--shadow-e0..--shadow-e5` are defined in
      // `apps/web/src/styles/theme.css` and flip with `.dark`, so call
      // sites use a single `shadow-eN` utility — never `dark:shadow-*`.
      //
      // Legacy aliases (`soft` / `card` / `float`) are preserved as
      // pointers into the new scale so existing call sites keep
      // working unchanged: `shadow-card === shadow-e1`,
      // `shadow-float === shadow-e3`, `shadow-soft === shadow-e4`.
      // New code should prefer `shadow-eN` for the explicit semantic
      // level. See docs/design/design-system.md § 4.
      // ═══════════════════════════════════════════════════════════════════
      boxShadow: {
        // Semantic elevation scale (preferred for new code).
        e0: "var(--shadow-e0)",
        e1: "var(--shadow-e1)",
        e2: "var(--shadow-e2)",
        e3: "var(--shadow-e3)",
        e4: "var(--shadow-e4)",
        e5: "var(--shadow-e5)",
        // Legacy aliases — kept for back-compat, mapped 1:1 to the new
        // scale via the same CSS vars (so a theme tweak to `--shadow-eN`
        // propagates to every consumer regardless of which name they
        // import).
        soft: "var(--shadow-e4)",
        card: "var(--shadow-e1)",
        float: "var(--shadow-e3)",
        // 2026-07 design-audit: was a hard-coded emerald `rgba(16,185,129)`,
        // an orphan from before the hub decoupled from emerald. Now driven
        // by the focus-ring color var so it tracks the active accent/theme
        // instead of pinning a colour the shell no longer uses.
        glow: "0 0 0 3px var(--focus-ring-color, rgba(20, 184, 166, 0.15))",
        "glow-teal": "0 0 0 3px rgba(20, 184, 166, 0.15)",
        "glow-cyan": "0 0 0 3px rgba(14, 116, 144, 0.15)",
        "glow-rose": "0 0 0 3px rgba(235, 118, 145, 0.15)",
        "glow-lime": "0 0 0 3px rgba(146, 204, 23, 0.15)",
        // «Чорнило» accent glow — a luminescent tier-400 halo for solid
        // accent controls (module Buttons, spec § 4: glow 24px/35%),
        // replacing the drop shadow under the dark ink direction. Applied
        // `dark:`-only so the light default keeps its shadow.
        // `glow-accent-emerald` (the pre-teal-migration orphan) removed
        // 2026-08 design-audit T10 — zero consumers.
        "glow-accent-teal": "0 0 24px rgba(45, 212, 191, 0.35)", // teal-400 — finyk accent glow (2026-07)
        "glow-accent-cyan": "0 0 24px rgba(34, 211, 238, 0.35)",
        "glow-accent-rose": "0 0 24px rgba(246, 141, 164, 0.35)",
        "glow-accent-lime": "0 0 24px rgba(176, 230, 54, 0.35)",
        // «Чорнило» hero inset-glow — a luminescent tier-400 halo inside
        // the card edge (spec § 3: depth = glow, not down-shadow). 40px
        // blur / 8% alpha; theme-invariant (the halo colour is the module
        // accent, it does not flip with the surface). Applied `dark:`-only
        // by Card hero surfaces so the light default is untouched.
        // `glow-inset-emerald` (the pre-teal-migration orphan) removed
        // 2026-08 design-audit T10 — zero consumers.
        "glow-inset-teal": "inset 0 0 40px rgba(45, 212, 191, 0.08)", // teal-400 — finyk hero (2026-07)
        "glow-inset-cyan": "inset 0 0 40px rgba(34, 211, 238, 0.08)",
        "glow-inset-rose": "inset 0 0 40px rgba(246, 141, 164, 0.08)",
        "glow-inset-lime": "inset 0 0 40px rgba(176, 230, 54, 0.08)",
        // «Чорнило» hero light glow (spec § 3 point 2) — a soft downward
        // colour shadow, not a halo. Colour = the light-tier
        // `--c-{module}-accent` hex baked in (box-shadow colour can't take
        // a CSS-var opacity modifier). Replaces the generic `shadow-card`
        // on the hero surface; dark keeps its own `glow-inset-*` override.
        "hero-finyk": "0 8px 20px rgba(17, 94, 89, 0.22)", // teal-800 — matches --c-finyk-accent (2026-07: was emerald-700)
        "hero-fizruk": "0 8px 20px rgba(14, 116, 144, 0.22)",
        "hero-routine": "0 8px 20px rgba(194, 58, 58, 0.22)",
        "hero-nutrition": "0 8px 20px rgba(86, 124, 15, 0.22)",
        // «Чорнило» FAB glow (spec § 4: FAB = module accent + glow
        // 24px/40%) — `glow-fab-rose` removed 2026-08 design-audit T10
        // (zero consumers; `FloatingActionButton` uses the theme-aware
        // `shadow-fab` token instead).
        // Destructive hover ring (Button variant="destructive").
        "danger-ring": "var(--shadow-danger-ring)",
        // Inner shadows for depth
        inner: "inset 0 2px 4px rgba(0, 0, 0, 0.05)",
        // `cardHover` / `celebration-glow` / `streak-glow` removed 2026-08
        // design-audit T10 — zero consumers (hover-lift uses `shadow-float`;
        // celebration/streak visuals use the `animate-celebration-pop` /
        // `animate-streak-glow` keyframes in animations.css instead).
        // Enhanced focus ring. The var is set per-theme in theme.css; the
        // fallback is only a last resort. 2026-07 design-audit: fallback
        // aligned to teal (the shell's live accent) — was an orphan emerald.
        "focus-ring":
          "0 0 0 var(--focus-ring-width, 3px) var(--focus-ring-color, rgba(20, 184, 166, 0.4))",

        // ═══════════════════════════════════════════════════════════════════
        // SERGEANT v2 REDESIGN SHADOWS (introduced 2026-05)
        //
        // Glass-surface shadow recipes — paired with `surface-glass*`
        // colors above. Each adds an inset top highlight (so the surface
        // reads as a translucent floating element) plus an outer drop
        // shadow tuned for the v2 ambient mesh background.
        //
        //   card-v2 — default v2 Card / panel
        //   pill    — AIPill, floating tags, pill-shaped chips
        //   nav     — HubBottomNav glass pill, AIPill backdrop
        //   fab     — module FAB (per-module accent glow baked in)
        //
        // Backed by CSS variables in `apps/web/src/styles/theme.css` (light
        // + dark + HC overrides). See docs/design/redesign-v2.md § Shadows.
        // ═══════════════════════════════════════════════════════════════════
        "card-v2": "var(--shadow-card-v2)",
        pill: "var(--shadow-pill)",
        nav: "var(--shadow-nav)",
        fab: "var(--shadow-fab)",
      },

      // ═══════════════════════════════════════════════════════════════════
      // DROP SHADOWS — SVG/icon glows for module bottom-nav active state.
      // Backed by CSS variables so a token change cascades everywhere.
      // ═══════════════════════════════════════════════════════════════════
      dropShadow: {
        "module-nav-finyk": "var(--shadow-finyk-nav)",
        "module-nav-fizruk": "var(--shadow-fizruk-nav)",
        "module-nav-routine": "var(--shadow-routine-nav)",
        "module-nav-nutrition": "var(--shadow-nutrition-nav)",
      },

      // ═══════════════════════════════════════════════════════════════════
      // GRADIENTS — Warm, organic, inviting
      // ═══════════════════════════════════════════════════════════════════
      backgroundImage: {
        // `page-warm` / `hero-emerald` (pre-teal-migration orphans) removed
        // 2026-08 design-audit T10 — zero consumers.
        // Hero gradients for each module
        "hero-teal":
          "linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 50%, #99f6e4 100%)",
        // Fizruk pastel hero header (F5 teal→cyan sweep) — same 3-stop
        // structure as `hero-teal`, re-hued to the module's `cyan` scale.
        "hero-cyan":
          "linear-gradient(135deg, #ecfeff 0%, #cffafe 50%, #a5f3fc 100%)",
        "hero-rose":
          "linear-gradient(135deg, #fff5f6 0%, #ffe7eb 50%, #fed3db 100%)",
        "hero-lime":
          "linear-gradient(135deg, #f8fee7 0%, #effccb 50%, #dff99d 100%)",

        // Hub hero — warm cream with subtle gradient
        "hub-hero":
          "linear-gradient(150deg, #fdf9f3 0%, #fefdfb 50%, #f0fdfa 100%)",

        // Card gradients (subtle). `card-emerald` (pre-teal-migration
        // orphan) removed 2026-08 design-audit T10 — zero consumers.
        "card-teal": "linear-gradient(135deg, #f0fdfa 0%, #ffffff 100%)",
        "card-rose": "linear-gradient(135deg, #fff5f6 0%, #ffffff 100%)",
        "card-lime": "linear-gradient(135deg, #f8fee7 0%, #ffffff 100%)",

        // Dark-mode overlays for module hero Card variants. Layered on top
        // of `bg-panel` so branded cards keep a faint module tint in dark
        // mode instead of reading as a neutral warm surface.
        "card-finyk-dark": "var(--gradient-card-finyk-dark)",
        "card-fizruk-dark": "var(--gradient-card-fizruk-dark)",
        "card-routine-dark": "var(--gradient-card-routine-dark)",
        "card-nutrition-dark": "var(--gradient-card-nutrition-dark)",

        // Hero-ink gradients (dark) — «Чорнило» v3.1 § 2. CSS vars defined
        // in theme.css `.dark`. Module hero Card variant fill; identity
        // carried by the accent border/glow, not fill saturation.
        "hero-ink-finyk": "var(--hero-ink-finyk)",
        "hero-ink-fizruk": "var(--hero-ink-fizruk)",
        "hero-ink-routine": "var(--hero-ink-routine)",
        "hero-ink-nutrition": "var(--hero-ink-nutrition)",

        // Module hero gradients — CSS vars defined in theme.css:705-708.
        // Used by PR-E..PR-H module page headers (bg-hero-grad-* utility).
        "hero-grad-finyk": "var(--hero-grad-finyk)",
        "hero-grad-fizruk": "var(--hero-grad-fizruk)",
        "hero-grad-routine": "var(--hero-grad-routine)",
        "hero-grad-nutrition": "var(--hero-grad-nutrition)",

        hero: "linear-gradient(150deg, #fdf9f3 0%, #fefdfb 100%)",
        // `hero-g` (pre-teal-migration orphan) removed 2026-08
        // design-audit T10 — zero consumers.
        "routine-hero":
          "linear-gradient(135deg, #fff5f3 0%, #ffe8e3 45%, rgba(255, 212, 203, 0.65) 100%)",

        // Pulse effects for status
        "pulse-ok":
          "linear-gradient(135deg, rgba(16, 185, 129, 0.07) 0%, transparent 70%)",
        "pulse-w":
          "linear-gradient(135deg, rgba(245, 158, 11, 0.07) 0%, transparent 70%)",
        "pulse-b":
          "linear-gradient(135deg, rgba(239, 68, 68, 0.07) 0%, transparent 70%)",
      },

      // ═══════════════════════════════════════════════════════════════════
      // TYPOGRAPHY — Readable, friendly, clear hierarchy
      // ═══════════════════════════════════════════════════════════════════
      // ─── Type-size scale ────────────────────────────────────────────────
      // Floor: `text-2xs` (10px). `text-3xs` (9px) was retired — it
      // never met readable-body contrast and we had no auditable use
      // case for sub-10px outside chart axis ticks. Use one of the
      // semantic `.text-style-*` utilities (defined in `plugins`)
      // whenever a slot has a documented role (hero, title, body,
      // label, caption, overline) — fall back to the raw scale only
      // for one-off measurements.
      fontSize: {
        "2xs": ["10px", { lineHeight: "14px" }],
        xs: ["12px", { lineHeight: "16px" }],
        sm: ["14px", { lineHeight: "20px" }],
        base: ["16px", { lineHeight: "24px" }],
        lg: ["18px", { lineHeight: "28px" }],
        xl: ["20px", { lineHeight: "28px" }],
        "2xl": ["24px", { lineHeight: "32px" }],
        // `hero`: hero-section H1s and hero stat numbers (slightly larger
        // than 2xl for the page-greeting / headline-stat slot).
        hero: ["26px", { lineHeight: "32px" }],
        "3xl": ["30px", { lineHeight: "36px" }],
        "4xl": ["36px", { lineHeight: "40px" }],
        "5xl": ["48px", { lineHeight: "1" }],
      },

      // ═══════════════════════════════════════════════════════════════════
      // SPACING — Consistent rhythm
      // ═══════════════════════════════════════════════════════════════════
      spacing: {
        4.5: "18px",
        13: "52px",
        // `nav` / `nav-touch` — ModuleBottomNav heights. `nav` is the
        // default desktop height; `nav-touch` applies on coarse-pointer
        // (touch) devices for the larger tap-target floor.
        nav: "60px",
        "nav-touch": "64px",
        // `sheet-handle` — the drag-indicator pill inside Sheet.
        // Named so it can be tokenized and audited independently.
        "sheet-handle": "5px",
        15: "60px",
        18: "72px",
        22: "88px",
      },

      // ═══════════════════════════════════════════════════════════════════
      // ANIMATIONS — Smooth, delightful, Duolingo-inspired
      // ═══════════════════════════���═══════════════════════════════════════
      //
      // ANIMATION BUDGET — 3 tiers, max 2 concurrent on-screen:
      //
      //   AMBIENT   — background, looped: shimmer, pulse-soft, wiggle
      //               → Always gated by motion-safe:, reduced to opacity-only in prefers-reduced-motion
      //   RESPONSE  — user-initiated, one-shot: fade-in, slide-up, scale-in, press-scale, hover-lift
      //               → 150–300ms, ease-out. Fires once per interaction.
      //   CELEBRATE — milestone, rare: check-pop, bounce-in, success-pulse, confetti
      //               → Only for: first entry, streak ≥7, weekly goal hit. NOT every checkbox.
      //
      // RULE: A screen should never run more than 1 AMBIENT + 1 RESPONSE simultaneously.
      // Stagger animations count as 1 RESPONSE regardless of child count.
      animation: {
        // Entry animations (RESPONSE tier)
        "fade-in":
          "fadeIn var(--motion-duration-fast) var(--motion-ease-decelerate)",
        "slide-up":
          "slideUp var(--motion-duration-slow) var(--motion-ease-decelerate)",
        "slide-down":
          "slideDown var(--motion-duration-slow) var(--motion-ease-decelerate)",
        "scale-in":
          "scaleIn var(--motion-duration-base) var(--motion-ease-decelerate)",
        // Success / completion (CELEBRATE tier)
        "check-pop":
          "checkPop var(--motion-duration-slower) var(--motion-ease-overshoot)",
        "success-pulse":
          "successPulse var(--motion-duration-slowest) var(--motion-ease-decelerate)",
        // Interaction feedback (RESPONSE tier)
        "press-scale":
          "pressScale var(--motion-duration-fast) var(--motion-ease-decelerate)",
        "hover-lift":
          "hoverLift var(--motion-duration-fast) var(--motion-ease-decelerate) forwards",
        // Loading states (AMBIENT tier — infinite loops)
        shimmer: "shimmer var(--motion-duration-loop) infinite",
        "pulse-soft": "pulseSoft var(--motion-duration-loop-glow) infinite",
        // Progress ring (RESPONSE tier)
        "progress-fill":
          "progressFill var(--motion-duration-loop-spin) var(--motion-ease-decelerate) forwards",
        // Bounce for notifications (CELEBRATE tier)
        "bounce-in":
          "bounceIn var(--motion-duration-slower) var(--motion-ease-overshoot)",
        // Stagger enter — children use animation-delay: index × 30 ms,
        // capped at 150 ms total (Hard Rule #17).
        "stagger-in":
          "fadeSlideUp var(--motion-duration-slow) var(--motion-ease-standard) both",
        // Modal / sheet exits (RESPONSE tier)
        "fade-out":
          "fadeOut var(--motion-duration-fast) var(--motion-ease-accelerate) forwards",
        "scale-out":
          "scaleOut var(--motion-duration-fast) var(--motion-ease-accelerate) forwards",
        "draw-check":
          "drawCheck var(--motion-duration-slower) var(--motion-ease-decelerate) 0.2s forwards",
        // iOS-style "edit mode" wiggle for sortable bento cards. AMBIENT
        // tier — gated by `motion-safe:` in consumers so the
        // reduced-motion strategy pauses it.
        wiggle:
          "wiggle var(--motion-duration-slower) var(--motion-ease-standard) infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideDown: {
          "0%": { opacity: "0", transform: "translateY(-12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        checkPop: {
          "0%": { transform: "scale(0)" },
          "50%": { transform: "scale(1.2)" },
          "100%": { transform: "scale(1)" },
        },
        successPulse: {
          "0%": { boxShadow: "0 0 0 0 rgba(16, 185, 129, 0.4)" },
          "70%": { boxShadow: "0 0 0 10px rgba(16, 185, 129, 0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(16, 185, 129, 0)" },
        },
        pressScale: {
          "0%": { transform: "scale(1)" },
          "50%": { transform: "scale(0.97)" },
          "100%": { transform: "scale(1)" },
        },
        hoverLift: {
          "0%": { transform: "translateY(0)", boxShadow: "var(--shadow-card)" },
          "100%": {
            transform: "translateY(-2px)",
            boxShadow: "var(--shadow-float)",
          },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        progressFill: {
          "0%": { strokeDashoffset: "100" },
          "100%": { strokeDashoffset: "var(--progress-offset, 0)" },
        },
        fadeOut: {
          "0%": { opacity: "1" },
          "100%": { opacity: "0" },
        },
        scaleOut: {
          "0%": { opacity: "1", transform: "scale(1)" },
          "100%": { opacity: "0", transform: "scale(0.95)" },
        },
        drawCheck: {
          "0%": { strokeDashoffset: "24" },
          "100%": { strokeDashoffset: "0" },
        },
        bounceIn: {
          "0%": { opacity: "0", transform: "scale(0.3)" },
          "50%": { transform: "scale(1.05)" },
          "70%": { transform: "scale(0.9)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        fadeSlideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        wiggle: {
          "0%, 100%": { transform: "rotate(-0.6deg)" },
          "50%": { transform: "rotate(0.6deg)" },
        },
      },

      // ═══════════════════════════════════════════════════════════════════
      // TRANSITIONS — Consistent timing.
      // Hard Rule #17 motion tokens — single source of truth lives in
      // `apps/web/src/styles/theme.css` (CSS custom properties); these
      // mappings forward them through Tailwind so authors write
      // `duration-base ease-standard` instead of raw `duration-[220ms]`
      // or inline `cubic-bezier(...)`. Raw timing values in `className`
      // are forbidden (e.g. `duration-[230ms]` is a Hard Rule #17 violation).
      // ═══════════════════════════════════════════════════════════════════
      transitionDuration: {
        DEFAULT: "var(--motion-duration-base)",
        instant: "var(--motion-duration-instant)", // 75ms — micro-feedback
        fast: "var(--motion-duration-fast)", // 150ms — exit / dismissal
        base: "var(--motion-duration-base)", // 220ms — default enter
        slow: "var(--motion-duration-slow)", // 320ms — sheet / list reveal
        slower: "var(--motion-duration-slower)", // 480ms — CELEBRATE pop
        slowest: "var(--motion-duration-slowest)", // 680ms — CELEBRATE burst
      },
      transitionTimingFunction: {
        standard: "var(--motion-ease-standard)",
        emphasized: "var(--motion-ease-emphasized)",
        accelerate: "var(--motion-ease-accelerate)",
        decelerate: "var(--motion-ease-decelerate)",
        overshoot: "var(--motion-ease-overshoot)",
        // Legacy aliases — alias to canonical tokens. Do not introduce
        // new usages; prefer the names above.
        bounce: "var(--motion-ease-overshoot)",
        smooth: "var(--motion-ease-standard)",
        spring: "var(--motion-ease-overshoot)",
      },

      // ═══════════════════════════════════════════════════════════════════
      // BACKDROP BLUR — Glass effects
      // ═══════════════════════════════════════════════════════════════════
      backdropBlur: {
        xs: "2px",
        sm: "4px",
        DEFAULT: "8px",
        md: "12px",
        lg: "16px",
        xl: "24px",
        "2xl": "40px",
      },

      // ═══════════════════════════════════════════════════════════════════
      // MIN HEIGHT — Touch-target token (WCAG 2.5.5 / Apple HIG ≥44×44px)
      //
      // `min-h-touch-target` (44px) is the universal floor for any
      // interactive element on coarse pointers. Pair with the
      // `[data-touch-target]` attribute in `apps/web/src/styles/mobile.css` if you
      // want the floor applied conditionally (only on `(pointer: coarse)`).
      // The Tailwind utility version (this key) always applies the floor,
      // regardless of pointer.
      //
      // Adopted by Sergeant v2 redesign Phase 0 (T6) — closes the FAB
      // action items + KeyboardAccessory chip + Fizruk exercise-type
      // pill-segmented control inconsistencies.
      // ═══════════════════════════════════════════════════════════════════
      minHeight: {
        "touch-target": "44px",
      },

      // ═══════════════════════════════════════════════════════════════════
      // Z-INDEX — Semantic stacking tier (paired with elevation scale)
      //
      // Authoring rule: an element at elevation `eN` must use the
      // matching `z-*` tier. e0/e1/e2 → `z-base`, e3 → `z-dropdown`,
      // e4 → `z-modal`, e5 → `z-toast`. Mismatched pairs are how
      // popovers slide under modals and toasts get hidden by drawers.
      // See docs/design/design-system.md § 4 and `zTier` in tokens.js.
      //
      // Legacy numeric scale (`z-100`/`200`/`300`/`400` and the
      // `z-header`/`modal`/`toast`/`tooltip` aliases) is preserved so
      // existing call sites keep working unchanged.
      // ═══════════════════════════════════════════════════════════════════
      zIndex: {
        // Raw numeric scale (legacy — kept for back-compat).
        0: "0",
        10: "10",
        20: "20",
        30: "30",
        40: "40",
        50: "50",
        100: "100",
        150: "150",
        200: "200",
        300: "300",
        400: "400",
        500: "500",
        // Semantic tier — preferred for new code.
        base: zTier.base,
        dropdown: zTier.dropdown,
        sticky: zTier.sticky,
        overlay: zTier.overlay,
        modal: zTier.modal,
        toast: zTier.toast,
        // Legacy tier aliases (kept so existing `z-header` / `z-modal`
        // / `z-toast` / `z-tooltip` call sites keep working). `header`
        // is an alias of `sticky`; `tooltip` is an alias of `toast`
        // (highest non-modal tier — preserves the historical order).
        header: zTier.sticky,
        tooltip: "400",
      },
    },
  },
  // ═══════════════════════════════════════════════════════════════════════
  // PLUGINS
  //   1. Semantic typography utilities (`.text-style-*`).
  //   2. Tabular numerics helper (`.tnum`).
  //   3. Touch-target floors (`.touch-target`, `.touch-target-48`).
  // ═══════════════════════════════════════════════════════════════════════
  //
  // The `.text-style-*` utilities below are the canonical way to apply
  // a typographic role. They bundle font-size (fluid via `clamp()`),
  // line-height, weight, letter-spacing, and casing into a single class
  // so layouts can't drift on any one axis. Prefer these over re-deriving
  // the values from the raw `text-xs / text-sm / …` scale whenever a slot
  // has a documented role.
  //
  // Eight canonical roles (D8-sweep, дизайн-аудит цикл 5). Шкала була
  // інвентарною — 12 слотів, де кілька пар відрізнялись лише на крок
  // розміру, тож однакова роль отримувала різне втілення залежно від
  // того, хто писав екран. Тепер вона модульна: роль ≠ розмір, і кожна
  // роль має рівно одне втілення.
  //
  //   .text-style-display    — найбільше число / heading екрана (40→64px)
  //   .text-style-headline   — page H1, hero-стат               (26→36px)
  //   .text-style-title      — заголовок секції / картки        (18→22px)
  //   .text-style-body       — основний текст                   (15→16px)
  //   .text-style-label      — мітки, кнопки, вторинний текст   (13→14px)
  //   .text-style-caption    — мета, таймстемпи                 (12px floor)
  //   .text-style-overline   — кікери (службовий рядок)         (12px floor)
  //   .text-style-code       — mono-дані, inline-код            (13→14px)
  //
  // ── Роль + `font-*` на ОДНОМУ вузлі: хто виграє ──────────────────────
  //
  // AI-CONTEXT (2026-08-06, перевірено на зібраному CSS, не з голови).
  // Ролі реєструються через `addUtilities`, тобто живуть у тому самому
  // шарі, що й core-утиліти Tailwind, і мають ту саму специфічність —
  // один клас. За правилом каскаду виграє той, що НИЖЧЕ у файлі.
  //
  // Замір у `apps/server/dist/assets/index-*.css`:
  //   .text-style-caption — офсет 177815
  //   .font-semibold      — офсет 180546   ← нижче, отже виграє
  //
  // Тобто `text-style-caption font-semibold` дає 600, а не 400. Роль
  // програє явній вазі, і це передбачувано, а не «як пощастить».
  //
  // Практичний висновок для проходів типографіки: конкуренція ваги — НЕ
  // причина лишати сирий `text-xs`. Причини лишати сирий розмір рівно
  // дві: (1) це розмір КОНТРОЛА, вирівняний із сусіднім полем чи
  // гліфом; (2) потрібен саме `line-height` від `text-xs` (1rem), бо
  // роль дає 1.4 — це єдина реальна різниця між ними на 12px.
  //
  // AI-DANGER: перевірку привʼязано до порядку в білді. Якщо Tailwind
  // колись почне сортувати утиліти інакше або ролі переїдуть у
  // `addComponents` (шар components завжди програє utilities), висновок
  // перевернеться — і мовчки. Переміряй, перш ніж спиратись.
  //
  // Злиті в цьому проході (кількість вживань → куди):
  //   hero 20 → headline (значення були ідентичні — чистий дубль)
  //   display-hero 13 → display (роль узяла розмір частотнішого)
  //   title-lg 2, subtitle 7 → title
  //   body-lg 3 → body
  //   body-sm 25, body-strong 1 → label
  //
  // Fluid clamp() formula targets the 320→1280px viewport range so the
  // scale grows smoothly from compact mobile to comfortable desktop while
  // respecting the **12px floor** (Hard Rule #16): no slot drops below
  // `caption` / `overline`.
  //
  // Minimum text size in the design system is 12px; `text-2xs` (10px)
  // is reserved for chart ticks and decorative metadata badges and is
  // NOT a `text-style-*` slot.
  //
  // The `.tnum` utility toggles `font-variant-numeric: tabular-nums` on
  // numeric columns / stats so digits stay column-aligned regardless of
  // the surrounding text-style. Sibling to `.tabular-nums` defined in
  // `apps/web/src/styles/base.css` (kept for back-compat).
  //
  // The `.touch-target*` plugin enforces WCAG 2.5.5 / Apple HIG ≥44×44px
  // on `(pointer: coarse)` — see the inline comment on the plugin for the
  // opt-out / sibling utilities.
  plugins: [
    function semanticTypography({ addUtilities }) {
      addUtilities({
        // D8-sweep (цикл 5): `display` і `display-hero` були двома
        // «найбільшими числами екрана». Роль лишилась одна й узяла
        // значення частотнішого втілення (display-hero, 11 вживань проти 2).
        // AI-CONTEXT: трекінг −0.012em, а не −0.03em, і це калібрування під
        // кирилицю, а не послаблення прийому. Відʼємний трекінг на великому
        // кеглі правильний, але −0.03em підбиралось під латиницю. Кирилиця
        // має помітно більше вертикальних штрихів на слово (ш, щ, и, ц, п),
        // тож те саме стиснення закриває просвіти між ними сильніше й дає
        // «частокіл» — слово читається по штриху, а не за силуетом.
        //
        // Рішення власника 2026-08-05 на матеріалі
        // `mockups/product/display-tracking.html`. Зміна глобальна, але не
        // широка за наслідками: з 19 місць із цією роллю лише 4 містять
        // слова (IntroSlide, ResetPasswordPage, VerifyEmailPage,
        // LegalDocumentView) — решта числа, де різниця майже невидима.
        ".text-style-display": {
          fontSize: "clamp(2.5rem, 2rem + 2.5vw, 4rem)",
          lineHeight: "1",
          fontWeight: "800",
          letterSpacing: "-0.012em",
        },
        // v2 hero display — Manrope-800 weight, tight leading.
        // Slot: Finyk balance reveal, Expensa amount hero (Phase 6.2),
        // Workout Win celebration headline (Phase 4.4 W2).
        // Separate from `.text-style-display` so existing display call-sites
        // keep their 700 weight; this opts you into the 800 hero look.
        ".text-style-headline": {
          fontSize: "clamp(1.625rem, 1.446rem + 0.893vw, 2.25rem)",
          lineHeight: "1.15",
          fontWeight: "700",
          letterSpacing: "-0.02em",
        },
        // Back-compat alias — `.text-style-hero` was the prior name for
        // the page-H1 / hero-stat slot. New code should reach for
        // `.text-style-headline`; existing call-sites keep working.
        ".text-style-title": {
          fontSize: "clamp(1.125rem, 1.054rem + 0.357vw, 1.375rem)",
          lineHeight: "1.3",
          fontWeight: "600",
          letterSpacing: "-0.01em",
        },
        ".text-style-body": {
          fontSize: "clamp(0.9375rem, 0.920rem + 0.089vw, 1rem)",
          lineHeight: "1.55",
          fontWeight: "400",
        },
        ".text-style-label": {
          fontSize: "clamp(0.8125rem, 0.795rem + 0.089vw, 0.875rem)",
          lineHeight: "1.4",
          fontWeight: "500",
          letterSpacing: "0.005em",
        },
        // Size-variant of `label` (НЕ девʼята роль — як bold у body). 16px
        // фіксовано, та сама вага/трекінг. Призначення: великий CTA
        // (Button lg/xl), де просадка до 13.9px послаблювала moment-of-value
        // ієрархію. Дозволено ЛИШЕ компонентам, не сторінковому коду
        // (цикл 6 acceptance §2). Канон 8 ролей не порушено.
        ".text-style-label-lg": {
          fontSize: "1rem",
          lineHeight: "1.4",
          fontWeight: "500",
          letterSpacing: "0.005em",
        },
        // 12px floor — Hard Rule #16. Fixed (non-fluid) so the floor
        // never drifts below readability on any viewport.
        ".text-style-caption": {
          fontSize: "0.75rem",
          lineHeight: "1.4",
          fontWeight: "400",
          letterSpacing: "0.005em",
        },
        // AI-CONTEXT: без `textTransform: uppercase` і без широкого
        // трекінгу — рішення власника 2026-08-06 на матеріалі
        // `mockups/product/kickers.html` (правило 4 типографіки тексту).
        //
        // Капс робив рівно одну роботу — казав «це службовий рядок», — і
        // платив за неї читабельністю. У кирилиці платня більша, ніж у
        // латиниці: слово впізнають по силуету, а у верхньому регістрі
        // кирилиця майже не має виносних, тож силует стає суцільним
        // прямокутником. Трекінг `0.08em` додавався саме заради капсу
        // (розрідити суцільний рядок) і без нього шкодить — розмиває межі
        // слів. Роль службового рядка тепер несуть колір і 2px смужка
        // (`SectionHeading`), а не форма літер.
        //
        // Імʼя `overline` лишили навмисно: перейменування зачепило б 15
        // call-site-ів заради синоніма, а «overline» у типографіці — це
        // рядок НАД заголовком, не «великі літери». Капс у це імʼя вклали
        // ми самі.
        ".text-style-overline": {
          fontSize: "0.75rem",
          lineHeight: "1.4",
          fontWeight: "600",
          letterSpacing: "0.005em",
        },
        ".text-style-code": {
          fontSize: "clamp(0.8125rem, 0.795rem + 0.089vw, 0.875rem)",
          lineHeight: "1.5",
          fontWeight: "500",
          fontFamily:
            'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
        },
        ".tnum": {
          fontVariantNumeric: "tabular-nums",
        },

        // ─── Край і зріз — власний матеріал (П3) ──────────────────────
        //
        // AI-CONTEXT: рішення власника 2026-08-06 на матеріалі
        // `mockups/product/own-material-variants.html`. Із шести
        // кандидатів обрано край, і не з естетики: це єдиний, що бʼє по
        // ВИМІРЯНОМУ атрактору §3.2 анти-слоп-стратегії — 723 входження
        // `rounded-2xl|3xl|full`, найбільше число в усьому розділі.
        // Решта пунктів там описові, цей арифметичний.
        //
        // Логіка проста: поверхня перестає бути «карткою з бібліотеки» і
        // стає ДОКУМЕНТОМ. Радіуса немає зовсім, зверху — товста
        // друкарська лінійка, знизу — перфорація відривного талона.
        // Форму видно з відстані, на якій фактури ще не розібрати; саме
        // тому край сильніший за папір, хоч і дорожчий за увагою.
        //
        // AI-DANGER: `mask` тут НЕ декоративна — вона й вирізає
        // перфорацію. Тому фон має бути на самому елементі, а не на
        // батьківському: маска ріже те, що намальоване цим вузлом.
        // Тінь так само не працює (її обріже маска) — глибина для цієї
        // поверхні виражається лінійкою зверху, а не підйомом.
        // Утиліти РОЗДІЛЕНІ навмисно. У стосі документів (список
        // транзакцій, згрупований по днях) лінійка належить першій
        // картці групи, а перфорація — останній. Якби це був один клас,
        // кожен рядок отримав би обидва, і матеріал перетворився б на
        // візерунок — тобто на декор, а декор копіюється.
        //
        // AI-CONTEXT: яку утиліту брати — питання не смаку, а місця
        // поверхні в документі:
        //   `rule` — те, що ПОЧИНАЄТЬСЯ (hero-картка вгорі екрана,
        //            перша поверхня групи);
        //   `perf` — те, що ЗАКІНЧУЄТЬСЯ (остання картка дня, відрив);
        //   `stub` — самодостатній аркуш поза стосом.
        // Саме тому hero отримали `rule`, а не `stub`: перфорація на
        // початку екрана обіцяє відрив, якого не буде.
        //
        // Друкарська лінійка: «тут починається документ».
        ".edge-rule": {
          borderTopLeftRadius: "0",
          borderTopRightRadius: "0",
          borderTopWidth: "2px",
          borderTopStyle: "solid",
          boxShadow: "none",
        },
        // Відривний низ.
        ".edge-perf": {
          borderBottomLeftRadius: "0",
          borderBottomRightRadius: "0",
          "--edge-perf": "7px",
          paddingBottom: "calc(var(--edge-perf) + 0.25rem)",
          WebkitMask: EDGE_PERF_MASK,
          mask: EDGE_PERF_MASK,
        },
        // Обидва разом — для окремої картки поза стосом.
        ".edge-stub": {
          borderRadius: "0",
          borderTopWidth: "2px",
          borderTopStyle: "solid",
          boxShadow: "none",
          "--edge-perf": "7px",
          paddingBottom: "calc(var(--edge-perf) + 0.25rem)",
          WebkitMask: EDGE_PERF_MASK,
          mask: EDGE_PERF_MASK,
        },
        // ─────────────────────────────────────────────────────────────
        // Підйом для МАСКОВАНОГО краю. Ставиться на БАТЬКА `.edge-perf`
        // / `.edge-stub`, ніколи на сам вузол із маскою.
        //
        // AI-DANGER: «просто підмінити `box-shadow` на `filter:
        // drop-shadow()` на тому самому вузлі» НЕ працює. Заміряно
        // 2026-08-06 у headless Chromium, а не виведено з голови:
        // рендерили перфоровану картку на білому тлі й читали яскравість
        // пікселя під нижнім краєм (0 = чорне, 255 = біле).
        //
        //   filter + mask на ОДНОМУ вузлі → 255 / 255  (тіні немає)
        //   box-shadow + mask (контроль)  → 255 / 255  (тіні немає)
        //   filter на БАТЬКУ, mask на дитині → 125 під зубцем,
        //                                      225 під проміжком
        //
        // Причина — порядок рендеру: фільтр застосовується ДО маски,
        // тож маска зрізає й саму тінь. Лише коли фільтр на рівень вище,
        // він бачить уже виготовлену маскою альфу — і тінь виходить
        // рваною, тобто документ відкидає тінь по своїх зубцях.
        //
        // Внутрішнього підсвічування (`inset` у `--shadow-eN`) тут немає
        // і бути не може: `drop-shadow()` малює лише зовні. Для цього
        // матеріалу верхню межу тримає 2px друкарська лінійка — та сама
        // роль, виражена не світлом, а фарбою.
        ".edge-lift": {
          filter: "var(--drop-e1)",
          transition: "filter 200ms",
        },
        ".edge-lift-interactive": {
          filter: "var(--drop-e1)",
          transition: "filter 200ms",
          "&:hover": { filter: "var(--drop-e2)" },
        },
      });
    },
    // ═══════════════════════════════════════════════════════════════════════
    // TOUCH TARGETS — WCAG 2.5.5 / Apple HIG ≥44×44px on coarse pointers
    //
    // `.touch-target`     — 44×44 floor on `(pointer: coarse)` (default).
    // `.touch-target-48`  — 48×48 floor for primary nav / FAB-class targets.
    //
    // Both are no-ops on `(pointer: fine)` — desktop keeps its compact
    // sizing. Use as a min sizing utility on interactive elements that
    // are visually smaller than 44px on touch (icon buttons, chips,
    // small toggles). The `Button` component already enforces the floor
    // for `xs` / `sm` / `iconOnly`, so prefer `touch-target` only for
    // bespoke interactive elements outside the `Button` shell.
    //
    // To intentionally render a smaller target (e.g. heatmap cells, dense
    // data grids), opt out by setting `data-compact` on the element —
    // see the safety-net rule in `apps/web/src/styles/mobile.css`.
    // ═══════════════════════════════════════════════════════════════════════
    function touchTargets({ addUtilities }) {
      addUtilities({
        ".touch-target": {
          "@media (pointer: coarse)": {
            minHeight: "44px",
            minWidth: "44px",
          },
        },
        ".touch-target-48": {
          "@media (pointer: coarse)": {
            minHeight: "48px",
            minWidth: "48px",
          },
        },
      });
    },
  ],
};

export default preset;
