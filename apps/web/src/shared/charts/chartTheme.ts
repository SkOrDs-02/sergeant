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

/** Per-module accent tokens — prefer this over hardcoded hex in charts. */
export const chartSeries = {
  finyk: {
    primary: moduleColors.finyk.primary,
    secondary: moduleColors.finyk.secondary,
    surface: moduleColors.finyk.surface,
  },
  fizruk: {
    primary: moduleColors.fizruk.primary,
    secondary: moduleColors.fizruk.secondary,
    surface: moduleColors.fizruk.surface,
  },
  routine: {
    primary: moduleColors.routine.primary,
    secondary: moduleColors.routine.secondary,
    surface: moduleColors.routine.surface,
  },
  nutrition: {
    primary: moduleColors.nutrition.primary,
    secondary: moduleColors.nutrition.secondary,
    surface: moduleColors.nutrition.surface,
  },
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
    className: "fill-muted text-meta tabular-nums",
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
  className: "fill-muted text-micro tabular-nums",
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
     * of the dark-mode audit; see `docs/design/dark-mode-audit.md` →
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
