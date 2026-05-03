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
} from "./tokens.js";

/** @type {import('tailwindcss').Config} */
const preset = {
  content: [],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"DM Sans Variable"',
          '"DM Sans"',
          "system-ui",
          "-apple-system",
          '"Segoe UI"',
          "sans-serif",
        ],
        display: [
          '"DM Sans Variable"',
          '"DM Sans"',
          "system-ui",
          "-apple-system",
          '"Segoe UI"',
          "sans-serif",
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

        // ═══════════════════════════════════════════════════════════════════
        // BRAND COLORS — Soft & Organic palette with Emerald/Teal accent
        // ═══════════════════════════════════════════════════════════════════
        brand: {
          // Primary emerald accent
          DEFAULT: brandColors.emerald[500],
          light: brandColors.emerald[400],
          dark: brandColors.emerald[600],
          subtle: brandColors.emerald[50],
          // `strong` is the WCAG-AA companion to `DEFAULT` — emerald-700
          // clears 4.5:1 against the cream `bg-bg` and against `text-white`
          // when used as a solid fill. Use `bg-brand-strong text-white` on
          // primary CTAs and `text-brand-strong` for body-sized brand text.
          // See docs/design/brand-palette-wcag-aa-proposal.md.
          strong: brandColors.emerald[700],
          ...brandColors.emerald,
        },
        teal: brandColors.teal,
        cream: brandColors.cream,
        coral: brandColors.coral,
        lime: brandColors.lime,

        // ═══════════════════════════════════════════════════════════════════
        // STATUS COLORS — Consistent semantic meanings
        // Each status has a solid accent (for fills / icons / rings) plus a
        // `-soft` background token that resolves through CSS variables so
        // dark mode works without bespoke dark: overrides, and a `-strong`
        // companion (text-on-cream / fill-with-white) that clears WCAG AA
        // at body sizes. See docs/design/brand-palette-wcag-aa-proposal.md.
        // ═══════════════════════════════════════════════════════════════════
        success: statusColors.success,
        danger: statusColors.danger,
        warning: statusColors.warning,
        info: statusColors.info,
        "success-soft": "rgb(var(--c-success-soft) / <alpha-value>)",
        "warning-soft": "rgb(var(--c-warning-soft) / <alpha-value>)",
        "danger-soft": "rgb(var(--c-danger-soft) / <alpha-value>)",
        "info-soft": "rgb(var(--c-info-soft) / <alpha-value>)",
        // Brand soft tint trio (Wave 1b). Theme-adaptive via `--c-brand-soft*`
        // in `apps/web/src/index.css`. Call-sites that previously wrote
        // `bg-brand-50 dark:bg-brand-500/15` collapse to a single
        // `bg-brand-soft` (see docs/design/dark-mode-audit.md).
        "brand-soft": "rgb(var(--c-brand-soft) / <alpha-value>)",
        "brand-soft-border": "rgb(var(--c-brand-soft-border) / <alpha-value>)",
        "brand-soft-hover": "rgb(var(--c-brand-soft-hover) / <alpha-value>)",
        // WCAG-AA companions: `text-{c}-strong` on cream / soft surfaces,
        // `bg-{c}-strong text-white` on solid fills (Buttons, Badges, Tabs).
        "success-strong": brandColors.emerald[700], // #047857 — 5.23:1 on cream / 5.48:1 on white
        "warning-strong": "#b45309", // amber-700 — 4.83:1 on cream / 5.02:1 on white
        "danger-strong": "#b91c1c", // red-700   — 6.17:1 on cream / 6.47:1 on white
        "info-strong": "#0369a1", // sky-700   — 5.66:1 on cream / 5.93:1 on white

        // ═══════════════════════════════════════════════════════════════════
        // CHART PALETTE — For pie charts, graphs, data visualization
        // ═══════════════════════════════════════════════════════════════════
        chart: chartPalette,

        // ═══════════════════════════════════════════════════════════════════
        // MODULE-SPECIFIC COLORS — Each module has its own personality
        // ═══════════════════════════════════════════════════════════════════

        /** Фінік — Emerald/Teal финансовый трекер */
        finyk: {
          DEFAULT: moduleColors.finyk.primary,
          secondary: moduleColors.finyk.secondary,
          surface: moduleColors.finyk.surface,
          surfaceAlt: moduleColors.finyk.surfaceAlt,
          hover: brandColors.emerald[600],
          strong: brandColors.emerald[700],
          ring: brandColors.emerald[200],
          // `soft` / `soft-border` / `soft-hover` are now theme-adaptive
          // via `--c-finyk-soft*` (Wave 1b). Light values mirror the
          // legacy hex (`emerald[50]` / `[200]` / `[100]`); dark values
          // flip to the `-900` / `-800` family so dark mode stops showing
          // a bright pale fill on the warm-charcoal panel.
          soft: "rgb(var(--c-finyk-soft) / <alpha-value>)",
          "soft-border": "rgb(var(--c-finyk-soft-border) / <alpha-value>)",
          "soft-hover": "rgb(var(--c-finyk-soft-hover) / <alpha-value>)",
        },

        /** Фізрук — Teal fitness tracker */
        fizruk: {
          DEFAULT: moduleColors.fizruk.primary,
          secondary: moduleColors.fizruk.secondary,
          surface: moduleColors.fizruk.surface,
          accent: moduleColors.fizruk.accent,
          hover: brandColors.teal[600],
          strong: brandColors.teal[700],
          ring: brandColors.teal[200],
          // Theme-adaptive soft tint trio (Wave 1b).
          soft: "rgb(var(--c-fizruk-soft) / <alpha-value>)",
          "soft-border": "rgb(var(--c-fizruk-soft-border) / <alpha-value>)",
          "soft-hover": "rgb(var(--c-fizruk-soft-hover) / <alpha-value>)",
          // `tile` + `tile-border` — subtle stat-tile wash on the
          // fizruk hero gradient (Wave 2a). Light=teal-800,
          // dark=white. Apply with the registered opacity scale,
          // typically `bg-fizruk-tile/10` and
          // `border-fizruk-tile-border/15`.
          tile: "rgb(var(--c-fizruk-tile) / <alpha-value>)",
          "tile-border": "rgb(var(--c-fizruk-tile-border) / <alpha-value>)",
        },

        /** Рутина — Soft coral habit tracker */
        routine: {
          DEFAULT: moduleColors.routine.primary,
          secondary: moduleColors.routine.secondary,
          surface: moduleColors.routine.surface,
          // Tint крок між surface (coral-50 #fff5f3) та surfaceAlt (coral-100 #ffe8e3) —
          // використовується для виділення активного дня / виконаного слота в календарі.
          surface2: "#ffeeeb",
          surfaceAlt: moduleColors.routine.surfaceAlt,
          hover: brandColors.coral[600],
          strong: brandColors.coral[700],
          kicker: brandColors.coral[600],
          eyebrow: brandColors.coral[500],
          line: brandColors.coral[200],
          ring: brandColors.coral[300],
          done: brandColors.coral[700],
          nav: brandColors.coral[500],
          // Theme-adaptive soft tint trio (Wave 1b).
          soft: "rgb(var(--c-routine-soft) / <alpha-value>)",
          "soft-border": "rgb(var(--c-routine-soft-border) / <alpha-value>)",
          "soft-hover": "rgb(var(--c-routine-soft-hover) / <alpha-value>)",
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
        },

        // ═══════════════════════════════════════════════════════════════════
        // MODULE DARK-MODE TOKENS — semantic surfaces & borders for dark
        // theme. Each is a standalone CSS variable (see `.dark` block in
        // `apps/web/src/index.css`) decoupled from the live module accent
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
        "streak-glow": "rgb(var(--c-streak-glow) / <alpha-value>)",
        xp: "rgb(var(--c-xp) / <alpha-value>)",
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
      // ═══════════════════════════════════════════════════════════════════
      borderRadius: {
        "2xl": "16px",
        "3xl": "24px",
        "4xl": "32px",
        "5xl": "40px",
        full: "9999px",
      },

      // ═══════════════════════════════════════════════════════════════════
      // BOX SHADOWS — Soft, layered, premium feel
      // ═══════════════════════════════════════════════════════════════════
      boxShadow: {
        soft: "var(--shadow-soft)",
        card: "var(--shadow-card)",
        float: "var(--shadow-float)",
        glow: "0 0 0 3px rgba(16, 185, 129, 0.15)", // emerald glow
        "glow-teal": "0 0 0 3px rgba(20, 184, 166, 0.15)",
        "glow-coral": "0 0 0 3px rgba(249, 112, 102, 0.15)",
        "glow-lime": "0 0 0 3px rgba(146, 204, 23, 0.15)",
        // Destructive hover ring (Button variant="destructive").
        "danger-ring": "var(--shadow-danger-ring)",
        // Elevated cards (hover state)
        cardHover:
          "0 2px 4px rgba(13, 23, 38, 0.06), 0 12px 32px rgba(13, 23, 38, 0.12)",
        // Inner shadows for depth
        inner: "inset 0 2px 4px rgba(0, 0, 0, 0.05)",
        // Celebration glow — warm amber for achievement moments
        "celebration-glow":
          "0 0 24px rgba(251, 191, 36, 0.3), 0 0 8px rgba(251, 191, 36, 0.2)",
        // Streak glow — pulsing coral for active streaks
        "streak-glow":
          "0 0 16px rgba(249, 112, 102, 0.25), 0 0 4px rgba(249, 112, 102, 0.15)",
        // Enhanced focus ring
        "focus-ring":
          "0 0 0 var(--focus-ring-width, 3px) var(--focus-ring-color, rgba(16, 185, 129, 0.4))",
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
        // Page backgrounds — warm cream instead of cold blue
        "page-warm":
          "linear-gradient(180deg, rgb(var(--c-bg)) 0%, rgb(253, 249, 243) 100%)",

        // Hero gradients for each module
        "hero-emerald":
          "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 50%, #a7f3d0 100%)",
        "hero-teal":
          "linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 50%, #99f6e4 100%)",
        "hero-coral":
          "linear-gradient(135deg, #fff5f3 0%, #ffe8e3 50%, #ffd4cb 100%)",
        "hero-lime":
          "linear-gradient(135deg, #f8fee7 0%, #effccb 50%, #dff99d 100%)",

        // Hub hero — warm cream with subtle gradient
        "hub-hero":
          "linear-gradient(150deg, #fdf9f3 0%, #fefdfb 50%, #f0fdfa 100%)",

        // Card gradients (subtle)
        "card-emerald": "linear-gradient(135deg, #ecfdf5 0%, #ffffff 100%)",
        "card-teal": "linear-gradient(135deg, #f0fdfa 0%, #ffffff 100%)",
        "card-coral": "linear-gradient(135deg, #fff5f3 0%, #ffffff 100%)",
        "card-lime": "linear-gradient(135deg, #f8fee7 0%, #ffffff 100%)",

        // Dark-mode overlays for module hero Card variants. Layered on top
        // of `bg-panel` so branded cards keep a faint module tint in dark
        // mode instead of reading as a neutral warm surface.
        "card-finyk-dark": "var(--gradient-card-finyk-dark)",
        "card-fizruk-dark": "var(--gradient-card-fizruk-dark)",
        "card-routine-dark": "var(--gradient-card-routine-dark)",
        "card-nutrition-dark": "var(--gradient-card-nutrition-dark)",

        hero: "linear-gradient(150deg, #fdf9f3 0%, #fefdfb 100%)",
        "hero-g": "linear-gradient(150deg, #f0fdfa 0%, #ffffff 100%)",
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
        15: "60px",
        18: "72px",
        22: "88px",
      },

      // ═══════════════════════════════════════════════════════════════════
      // ANIMATIONS — Smooth, delightful, Duolingo-inspired
      // ═══════════════════════════════════════════════════════════════════
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
        // Entry animations
        "fade-in": "fadeIn 0.2s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        "slide-down": "slideDown 0.3s ease-out",
        "scale-in": "scaleIn 0.2s ease-out",
        // Success/completion
        "check-pop": "checkPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
        "success-pulse": "successPulse 0.6s ease-out",
        // Interaction feedback
        "press-scale": "pressScale 0.15s ease-out",
        "hover-lift": "hoverLift 0.2s ease-out forwards",
        // Loading states
        shimmer: "shimmer 1.5s infinite",
        "pulse-soft": "pulseSoft 2s infinite",
        // Progress ring
        "progress-fill": "progressFill 1s ease-out forwards",
        // Bounce for notifications
        "bounce-in": "bounceIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
        // Stagger enter — children use animation-delay: ${index * 50}ms
        "stagger-in":
          "fadeSlideUp 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) both",
        // Celebration modal animations
        "fade-out": "fadeOut 0.2s ease-out forwards",
        "scale-out": "scaleOut 0.2s ease-out forwards",
        "draw-check": "drawCheck 0.4s ease-out 0.2s forwards",
        // iOS-style "edit mode" wiggle for sortable bento cards. Looped,
        // very subtle (±0.6°) so it signals "I am draggable" without
        // becoming an attention sink. `motion-safe:` variants in
        // consumers handle the reduced-motion case.
        wiggle: "wiggle 0.45s ease-in-out infinite",
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
      // TRANSITIONS — Consistent timing
      // ═══════════════════════════════════════════════════════════════════
      transitionDuration: {
        DEFAULT: "200ms",
        fast: "150ms",
        slow: "300ms",
        slower: "400ms",
      },
      transitionTimingFunction: {
        bounce: "cubic-bezier(0.34, 1.56, 0.64, 1)",
        smooth: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        spring: "cubic-bezier(0.175, 0.885, 0.32, 1.275)",
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
      // Z-INDEX — Layering system
      // ═══════════════════════════════════════════════════════════════════
      zIndex: {
        0: "0",
        10: "10",
        20: "20",
        30: "30",
        40: "40",
        50: "50",
        header: "100",
        modal: "200",
        toast: "300",
        tooltip: "400",
      },
    },
  },
  // ═══════════════════════════════════════════════════════════════════════
  // PLUGINS
  //   1. Semantic typography utilities (`.text-style-*`).
  //   2. Touch-target floors (`.touch-target`, `.touch-target-48`).
  // ═══════════════════════════════════════════════════════════════════════
  //
  // The `.text-style-*` utilities below are the canonical way to apply
  // a typographic role. They bundle font-size, line-height, weight,
  // letter-spacing, and casing into a single class so layouts can't
  // drift on any one axis (e.g. shipping the hero size with the wrong
  // weight). Prefer these over re-deriving the values from the raw
  // `text-xs / text-sm / …` scale whenever a slot has a documented
  // role:
  //
  //   .text-style-hero      — page H1s and hero stat numbers
  //   .text-style-title     — section headings, card titles
  //   .text-style-body      — main body copy
  //   .text-style-label     — form labels, button text
  //   .text-style-caption   — metadata, timestamps, helper text
  //   .text-style-overline  — uppercase section kickers / eyebrows
  //
  // Minimum text size in the design system is 12px (`text-style-caption`);
  // `text-2xs` (10px) is reserved for chart ticks and decorative
  // metadata badges.
  //
  // The `.touch-target*` plugin enforces WCAG 2.5.5 / Apple HIG ≥44×44px
  // on `(pointer: coarse)` — see the inline comment on the plugin for the
  // opt-out / sibling utilities.
  plugins: [
    function semanticTypography({ addUtilities }) {
      addUtilities({
        ".text-style-hero": {
          fontSize: "26px",
          lineHeight: "32px",
          fontWeight: "700",
          letterSpacing: "-0.02em",
        },
        ".text-style-title": {
          fontSize: "20px",
          lineHeight: "28px",
          fontWeight: "600",
          letterSpacing: "-0.01em",
        },
        ".text-style-body": {
          fontSize: "16px",
          lineHeight: "24px",
          fontWeight: "400",
        },
        ".text-style-label": {
          fontSize: "14px",
          lineHeight: "20px",
          fontWeight: "500",
        },
        ".text-style-caption": {
          fontSize: "12px",
          lineHeight: "16px",
          fontWeight: "400",
        },
        ".text-style-overline": {
          fontSize: "12px",
          lineHeight: "16px",
          fontWeight: "600",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
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
    // see the safety-net rule in `apps/web/src/index.css`.
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
