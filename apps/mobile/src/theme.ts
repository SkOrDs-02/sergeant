/**
 * Mobile theme — re-exports design tokens + provides semantic aliases
 * for charts, SVG fills, and native components that can't use Tailwind.
 *
 * Usage:
 *   import { colors, chartColors, moduleTheme } from "@/theme";
 *   <Circle stroke={chartColors.routine.l3} />
 *   <View style={{ backgroundColor: moduleTheme.finyk.surface }} />
 */
export {
  colors,
  spacing,
  radius,
  type MobileColor,
  type MobileSpacing,
  type MobileRadius,
} from "@sergeant/design-tokens/mobile";

import {
  brandColors,
  moduleColors,
  statusColors,
  chartPalette,
  chartPaletteList,
} from "@sergeant/design-tokens/tokens";

// Re-export for convenience
export {
  brandColors,
  moduleColors,
  statusColors,
  chartPalette,
  chartPaletteList,
};

/**
 * Semantic chart colors for each module.
 * Use these instead of hardcoding hex values in SVG components.
 */
export const chartColors = {
  /** Routine module heatmap levels */
  routine: {
    future: brandColors.cream[300], // #f5ead8 — disabled/future
    empty: brandColors.cream[200], // #faf3e8 — neutral
    l1: brandColors.coral[200], // #ffd4cb — weak
    l2: brandColors.coral[400], // #ff8c78 — medium
    l3: brandColors.coral[500], // #f97066 — strong
    strokeToday: brandColors.coral[700], // #c23a3a
    strokeSelected: brandColors.coral[900], // #862e2e
  },
  /** Nutrition module macro rings */
  nutrition: {
    kcal: "#f97316", // orange-500 — calories
    protein: brandColors.emerald[500], // #10b981 — protein
    carbs: "#3b82f6", // blue-500 — carbohydrates
    fat: "#eab308", // yellow-500 — fat
    track: brandColors.cream[300], // #f5ead8 — background track
  },
  /** Fizruk module charts */
  fizruk: {
    primary: moduleColors.fizruk.primary,
    secondary: moduleColors.fizruk.secondary,
    accent: moduleColors.fizruk.accent,
    track: brandColors.cream[300],
  },
  /** Finyk module charts */
  finyk: {
    income: brandColors.emerald[500], // #10b981
    expense: brandColors.coral[500], // #f97066
    balance: brandColors.teal[500], // #14b8a6
    track: brandColors.cream[300],
  },
  /** General chart palette for pie/donut charts */
  palette: chartPaletteList,
} as const;

/**
 * Module-specific theme surfaces.
 * Use for backgrounds, cards, and overlays in each module.
 */
export const moduleTheme = {
  finyk: {
    surface: moduleColors.finyk.surface,
    surfaceAlt: moduleColors.finyk.surfaceAlt,
    accent: moduleColors.finyk.primary,
    accentMuted: moduleColors.finyk.secondary,
  },
  fizruk: {
    surface: moduleColors.fizruk.surface,
    accent: moduleColors.fizruk.primary,
    accentMuted: moduleColors.fizruk.secondary,
    cta: moduleColors.fizruk.accent,
  },
  routine: {
    surface: moduleColors.routine.surface,
    surfaceAlt: moduleColors.routine.surfaceAlt,
    accent: moduleColors.routine.primary,
    accentMuted: moduleColors.routine.secondary,
  },
  nutrition: {
    surface: moduleColors.nutrition.surface,
    surfaceAlt: moduleColors.nutrition.surfaceAlt,
    accent: moduleColors.nutrition.primary,
    accentMuted: moduleColors.nutrition.secondary,
  },
} as const;

/**
 * Semantic status colors for alerts, badges, and indicators.
 */
export const semanticColors = {
  success: statusColors.success,
  warning: statusColors.warning,
  danger: statusColors.danger,
  info: statusColors.info,
  // Additional semantic aliases
  positive: statusColors.success,
  negative: statusColors.danger,
  neutral: brandColors.cream[400],
} as const;

/**
 * Dark mode aware colors - use these for components that need
 * to work in both light and dark themes.
 */
export const adaptiveColors = {
  text: {
    primary: "#1c1917", // stone-900
    secondary: "#57534e", // stone-600
    muted: "#a8a29e", // stone-400
    inverse: "#fafaf9", // stone-50
  },
  background: {
    primary: brandColors.cream[50],
    secondary: brandColors.cream[100],
    tertiary: brandColors.cream[200],
  },
  border: {
    light: brandColors.cream[200],
    medium: brandColors.cream[300],
    strong: brandColors.cream[400],
  },
} as const;
