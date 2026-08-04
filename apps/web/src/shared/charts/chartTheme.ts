/**
 * Sergeant Design System — Chart Theme
 *
 * Canonical colour, axis, tick and tooltip tokens for all data-viz in the
 * app (ФІНІК trends, ФІЗРУК progress, Рутина heatmap, Харчування macros).
 *
 * Source of truth: `@sergeant/design-tokens/tokens`. This file re-exports
 * those tokens and adds shared render-side primitives (Tailwind classNames
 * + SVG attrs) so charts across modules share axes, grid lines, ticks and
 * tooltips.
 *
 * Usage:
 *
 *   import { chartAxis, chartGrid, chartTick, chartSeries }
 *     from "@shared/charts/chartTheme";
 *
 *   <text {...chartTick} x={..} y={..}>{label}</text>
 *   <line {...chartGrid.horizontal} x1={..} x2={..} />
 *   <path stroke={chartSeries.finyk.primary} ... />
 *
 * AI-CONTEXT: chart-line colour contract — `chartSeries.*.primary` and
 * `chartGradients.*` are var-backed strings (`"rgb(var(--c-chart-…))"`),
 * NOT static hex from `moduleColors`. That is deliberate: an SVG `fill`/
 * `stroke` attribute takes an inline string, not a Tailwind class, so it
 * can't pick up `.dark`/`html.hc` via className — a static hex freezes
 * the stroke to whichever theme it was authored against (design-audit
 * TH1/TH7). `--c-chart-{module}` (module accents) and `--c-chart-
 * {success,warning,danger,info}` (status accents reused as chart lines,
 * via `chartStatusSeries` below) both flip per theme in
 * `apps/web/src/styles/theme.css`. Never reach for `moduleColors.*` or
 * `statusColors.*` directly in an SVG stroke/fill/stopColor — always go
 * through `chartSeries` / `chartStatusSeries`.
 */

import {
  brandColors,
  chartPalette,
  chartPaletteList,
  moduleColors,
  statusColors,
} from "@sergeant/design-tokens/tokens";

export {
  brandColors,
  chartPalette,
  chartPaletteList,
  moduleColors,
  statusColors,
};

/**
 * Per-module accent tokens — prefer this over hardcoded hex in charts.
 *
 * `primary` is var-backed (`rgb(var(--c-chart-{module}))`) so SVG line/
 * area colours flip with `.dark`/`html.hc` (see the module doc above).
 * `secondary`/`surface` stay static `moduleColors` hex — nothing currently
 * consumes them as an SVG paint attribute (they back Tailwind-class
 * surfaces, which already resolve through CSS), so they don't need the
 * var-backed treatment yet. If a future chart paints an SVG element with
 * `chartSeries.*.secondary`/`surface`, give it the same `--c-chart-*`
 * treatment as `primary` first.
 */
export const chartSeries = {
  finyk: {
    primary: "rgb(var(--c-chart-finyk))",
    secondary: moduleColors.finyk["secondary"],
    surface: moduleColors.finyk["surface"],
  },
  fizruk: {
    primary: "rgb(var(--c-chart-fizruk))",
    secondary: moduleColors.fizruk["secondary"],
    surface: moduleColors.fizruk["surface"],
  },
  routine: {
    primary: "rgb(var(--c-chart-routine))",
    secondary: moduleColors.routine["secondary"],
    surface: moduleColors.routine["surface"],
  },
  nutrition: {
    primary: "rgb(var(--c-chart-nutrition))",
    secondary: moduleColors.nutrition["secondary"],
    surface: moduleColors.nutrition["surface"],
  },
} as const;

/**
 * Status colours reused as chart LINE colours (1RM lines, goal/threshold
 * lines, cardio pace/distance series) — var-backed (`--c-chart-{status}`
 * in `theme.css`), unlike the plain `statusColors` re-export above (static
 * hex from `tokens.js`, theme-blind — fine for non-chart status UI, wrong
 * for an SVG stroke/fill). Always prefer this over `statusColors.*` inside
 * a chart component.
 */
export const chartStatusSeries = {
  success: "rgb(var(--c-chart-success))",
  warning: "rgb(var(--c-chart-warning))",
  danger: "rgb(var(--c-chart-danger))",
  info: "rgb(var(--c-chart-info))",
} as const;

/** Axis line & label defaults — apply via spread on `<text>` / `<line>`. */
export const chartAxis = {
  /** Primary axis line (x/y baseline). */
  line: {
    className: "stroke-line/60",
    strokeWidth: 1,
  },
  /** Axis label (e.g. "₴ за місяць"). */
  label: {
    className: "fill-muted text-style-caption tabular-nums",
  },
} as const;

/** Grid lines drawn across the plot area. */
export const chartGrid = {
  horizontal: {
    className: "stroke-line/40",
    strokeDasharray: "3 3",
    strokeWidth: 1,
  },
  vertical: {
    className: "stroke-line/30",
    strokeDasharray: "2 4",
    strokeWidth: 1,
  },
} as const;

/** Tick label styling (numbers beside axes). */
export const chartTick = {
  className: "fill-muted text-style-caption tabular-nums",
  textAnchor: "middle" as const,
} as const;

/**
 * Heatmap cell tokens — four monotonic steps per module plus a neutral
 * "empty" and a disabled "future" shade. Values are Tailwind className
 * strings so dark mode resolves through the same CSS variables.
 *
 * Level scale (0 → 3):
 *   0 = no activity, 1 < 34 %, 2 < 67 %, 3 ≥ 67 %
 */
export const chartHeatmap = {
  routine: {
    empty: "bg-panelHi dark:bg-line/25",
    future: "bg-line/15 dark:bg-line/10",
    /**
     * Level scale (0 → 3). Levels 1–3 reference theme-aware CSS classes
     * defined in `apps/web/src/styles/module-surfaces.css` so this module
     * does not carry `dark:` overrides for chart palette pairs (Wave 2b
     * of the dark-mode audit; see `docs/design/archive/dark-mode-audit.md` →
     * "→ chart-palette refactor (chartTheme)").
     */
    levels: [
      "bg-panelHi dark:bg-line/25",
      "bg-routine-heat-l1",
      "bg-routine-heat-l2",
      "bg-routine-heat-l3",
    ] as const,
    ring: "ring-coral-400/80 dark:ring-coral-300/70",
    outline: "outline-coral-400",
  },
} as const;

/**
 * Gradient stops used by area/fill series, keyed by module. Consumers can
 * embed these as `<linearGradient>` stops without re-picking hex codes.
 * `stopColor` derives from `chartSeries.*.primary`, so it's var-backed too
 * (theme-reactive area fills, not just line strokes).
 */
export const chartGradients = {
  finyk: [
    { offset: "0%", stopColor: chartSeries.finyk.primary, stopOpacity: 0.35 },
    { offset: "100%", stopColor: chartSeries.finyk.primary, stopOpacity: 0 },
  ],
  fizruk: [
    { offset: "0%", stopColor: chartSeries.fizruk.primary, stopOpacity: 0.35 },
    { offset: "100%", stopColor: chartSeries.fizruk.primary, stopOpacity: 0 },
  ],
  routine: [
    { offset: "0%", stopColor: chartSeries.routine.primary, stopOpacity: 0.4 },
    { offset: "100%", stopColor: chartSeries.routine.primary, stopOpacity: 0 },
  ],
  nutrition: [
    {
      offset: "0%",
      stopColor: chartSeries.nutrition.primary,
      stopOpacity: 0.4,
    },
    {
      offset: "100%",
      stopColor: chartSeries.nutrition.primary,
      stopOpacity: 0,
    },
  ],
} as const;
