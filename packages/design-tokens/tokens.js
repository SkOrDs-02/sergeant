/**
 * Sergeant Design Tokens — raw visual values.
 *
 * Design Philosophy:
 * - Warm, friendly, approachable colors inspired by Duolingo/Yazio/Monobank
 * - Soft pastels with rich saturated accents
 * - Each color has semantic meaning in the app context
 *
 * These tokens are the single source of truth for web + mobile.
 * Consumers:
 *   - Tailwind preset (web + mobile) in ./tailwind-preset.js
 *   - Non-Tailwind code (e.g. native status bar color) via
 *     `import { brandColors } from "@sergeant/design-tokens/tokens"`.
 */

/** Primary Brand Colors */
export const brandColors = {
  // Primary accent — Emerald/Teal spectrum
  emerald: {
    50: "#ecfdf5",
    100: "#d1fae5",
    200: "#a7f3d0",
    300: "#6ee7b7",
    400: "#34d399",
    500: "#10b981",
    600: "#059669",
    700: "#047857",
    800: "#065f46",
    900: "#064e3b",
  },
  teal: {
    50: "#f0fdfa",
    100: "#ccfbf1",
    200: "#99f6e4",
    300: "#5eead4",
    400: "#2dd4bf",
    500: "#14b8a6",
    600: "#0d9488",
    700: "#0f766e",
    800: "#115e59",
    900: "#134e4a",
  },
  // Warm cream backgrounds (replacing cold blue-gray)
  cream: {
    50: "#fefdfb",
    100: "#fdf9f3",
    200: "#faf3e8",
    300: "#f5ead8",
    400: "#eedcc4",
    500: "#e4ccab",
  },
  // Soft coral for Routine module
  coral: {
    50: "#fff5f3",
    100: "#ffe8e3",
    200: "#ffd4cb",
    300: "#ffb4a6",
    400: "#ff8c78",
    500: "#f97066",
    600: "#e64d4d",
    700: "#c23a3a",
    800: "#a13333",
    900: "#862e2e",
  },
  // Fresh lime for Nutrition module
  lime: {
    50: "#f8fee7",
    100: "#effccb",
    200: "#dff99d",
    300: "#c8f264",
    400: "#b0e636",
    500: "#92cc17",
    600: "#71a30d",
    700: "#567c0f",
    800: "#466212",
    900: "#3b5314",
  },
};

/**
 * Chart segments palette — soft organic colors for pie charts.
 * Harmonious, balanced, not too saturated.
 */
export const chartPalette = {
  1: "#10b981", // emerald-500 (primary)
  2: "#14b8a6", // teal-500
  3: "#f97066", // coral-500
  4: "#92cc17", // lime-500
  5: "#60a5fa", // blue-400 (soft)
  6: "#a78bfa", // violet-400 (soft)
  7: "#fbbf24", // amber-400 (warm)
  8: "#f472b6", // pink-400 (soft)
};

export const chartPaletteList = Object.values(chartPalette);

/**
 * Module-specific accent colors. Each module has its own personality.
 */
export const moduleColors = {
  finyk: {
    primary: "#10b981", // emerald-500
    secondary: "#14b8a6", // teal-500
    surface: "#ecfdf5", // emerald-50
    surfaceAlt: "#f0fdfa", // teal-50
  },
  fizruk: {
    primary: "#14b8a6", // teal-500
    secondary: "#0d9488", // teal-600
    surface: "#f0fdfa", // teal-50
    accent: "#c8f264", // lime-300 (CTA highlight)
  },
  routine: {
    primary: "#f97066", // coral-500
    secondary: "#ff8c78", // coral-400
    surface: "#fff5f3", // coral-50
    surfaceAlt: "#ffe8e3", // coral-100
  },
  nutrition: {
    primary: "#92cc17", // lime-500
    secondary: "#b0e636", // lime-400
    surface: "#f8fee7", // lime-50
    surfaceAlt: "#effccb", // lime-100
  },
};

/**
 * Module-accent RGB triplets for the `--module-accent-rgb` and
 * `--module-accent-strong-rgb` CSS variables exposed by
 * `ModuleAccentProvider`. Kept here (not in the React component) so
 * the triplets stay in lockstep with `moduleColors.primary` and
 * `brandColors.{emerald,teal,coral,lime}[700|800]` — the single source
 * of truth for Sergeant module branding.
 *
 * Shape: "R G B" (space-separated, no commas) so the value is directly
 * usable inside `rgb(…)` + Tailwind arbitrary values:
 *
 *   className="bg-[rgb(var(--module-accent-rgb)/0.1)]"
 *   className="bg-[rgb(var(--module-accent-strong-rgb))] text-white"
 *
 * The `strong` triplet is the WCAG-AA companion shade (`-700` for most
 * modules; `-800` for nutrition/lime where `-700` still regresses on
 * white). It matches the `bg-{module}-strong` Tailwind utility.
 */
export const moduleAccentRgb = {
  finyk: { default: "16 185 129", strong: "4 120 87" }, // emerald-500 / -700
  fizruk: { default: "20 184 166", strong: "15 118 110" }, // teal-500 / -700
  routine: { default: "249 112 102", strong: "194 58 58" }, // coral-500 / -700
  nutrition: { default: "146 204 23", strong: "70 98 18" }, // lime-500 / -800
};

/** Status/semantic colors — consistent across app. */
export const statusColors = {
  success: "#10b981", // emerald-500
  warning: "#f59e0b", // amber-500
  danger: "#ef4444", // red-500
  info: "#0ea5e9", // sky-500
};

/**
 * Status colors as a flat hex map — alias of `statusColors` for inline
 * SVG / canvas / native status-bar call sites that can't consume the
 * Tailwind `text-success` / `bg-danger` utilities (body-highlighter,
 * raw `<path stroke>` attrs, etc.). Same values as `statusColors`;
 * exposed under `statusHex` so web-only code uses one consistent name
 * across `@shared/lib/themeHex`, chart series and mobile status bar.
 */
export const statusHex = {
  success: statusColors.success,
  warning: statusColors.warning,
  danger: statusColors.danger,
  info: statusColors.info,
};

/**
 * Elevation scale — semantic, layered shadows for the entire surface
 * stack. Each level pairs a `light` and `dark` recipe; consumers read
 * the corresponding CSS variable (`--shadow-e0…--shadow-e5`) so the
 * shadow flips automatically when `.dark` is toggled — never use
 * `dark:shadow-*` Tailwind variants (Hard Rule #13).
 *
 * Semantics (level → typical role → matching z-index tier):
 *   e0  flat        no shadow — page background / sections / inputs    z-base
 *   e1  raised      default `Card`, list rows, panels                  z-base
 *   e2  interactive hover lift on cards / buttons / pressables         z-base
 *   e3  overlay     popovers, dropdowns, menus, segmented hover        z-dropdown
 *   e4  modal       Modal panels, Sheets, drawers                      z-modal
 *   e5  toast       Toasts, snackbars, top-most ephemeral surfaces     z-toast
 *
 * Why two themes:
 *   In light mode the shadow is the dominant depth cue (soft warm
 *   umber with a faint inset top highlight to mimic a physical
 *   surface). In dark mode the surface itself can't get darker than
 *   the background, so we lean on a *stronger* shadow + a brighter
 *   inset top edge to read a level up. Same level → same perceived
 *   prominence across themes.
 *
 * Authoring rule:
 *   Always pick the smallest level that conveys the role. Don't reach
 *   for `e4` on a card just because it should "pop"; that's how the
 *   UI started looking flat and amateur — every surface used the same
 *   muddy `shadow-card`. The pairing with z-index tier is intentional:
 *   if you bump elevation, you bump the z-tier too (and vice versa).
 */
export const elevation = {
  e0: {
    light: "none",
    dark: "none",
  },
  e1: {
    light:
      "0 1px 2px rgba(28, 25, 23, 0.04), 0 2px 6px rgba(28, 25, 23, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.9)",
    dark: "0 1px 2px rgba(0, 0, 0, 0.30), 0 2px 6px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.03)",
  },
  e2: {
    light:
      "0 1px 3px rgba(28, 25, 23, 0.06), 0 6px 16px rgba(28, 25, 23, 0.10), inset 0 1px 0 rgba(255, 255, 255, 0.9)",
    dark: "0 2px 4px rgba(0, 0, 0, 0.35), 0 8px 20px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.04)",
  },
  e3: {
    light:
      "0 2px 8px rgba(28, 25, 23, 0.08), 0 12px 24px rgba(28, 25, 23, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.85)",
    dark: "0 3px 10px rgba(0, 0, 0, 0.40), 0 14px 30px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
  },
  e4: {
    light:
      "0 4px 16px rgba(28, 25, 23, 0.10), 0 24px 48px rgba(28, 25, 23, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.85)",
    dark: "0 6px 18px rgba(0, 0, 0, 0.45), 0 28px 56px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.06)",
  },
  e5: {
    light:
      "0 8px 24px rgba(28, 25, 23, 0.12), 0 32px 64px rgba(28, 25, 23, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.85)",
    dark: "0 10px 28px rgba(0, 0, 0, 0.50), 0 36px 72px rgba(0, 0, 0, 0.70), inset 0 1px 0 rgba(255, 255, 255, 0.07)",
  },
};

/**
 * Z-index tier — semantic stacking levels that must move in lockstep
 * with the elevation scale. Authoring rule: an element at elevation
 * `eN` belongs in the matching `z-*` tier (e0/e1/e2 → base, e3 →
 * dropdown, e4 → modal, e5 → toast). Mismatched pairs are how
 * popovers end up under modals and toasts get hidden by drawers.
 *
 * Numeric values are spaced so future intermediate tiers can be
 * inserted without renumbering. `sticky` sits above `dropdown`
 * because a sticky header should still cover a body-level popover.
 *
 *   z-base       0    — page content, cards, buttons, e0..e2 surfaces
 *   z-dropdown  50    — popovers, tooltips, menus, e3 surfaces
 *   z-sticky   100    — sticky headers, sticky table headers
 *   z-overlay  150    — non-modal overlays, scrims behind a modal
 *   z-modal    200    — Modal, Sheet, drawer (e4 surfaces)
 *   z-toast    300    — Toasts, snackbars (e5 surfaces; always on top)
 */
export const zTier = {
  base: "0",
  dropdown: "50",
  sticky: "100",
  overlay: "150",
  modal: "200",
  toast: "300",
};

/**
 * Chart hex tokens — semantic names for inline-styled chart primitives
 * that accept a raw `"#rrggbb"` string (SVG `fill` / `stroke`, canvas
 * contexts, `style={{ color }}`). Each key maps to exactly one design
 * intent so callers never reach for raw Tailwind hex values.
 *
 *   primary / forecast — default budget trend stroke
 *   limit              — "over budget" marker line (red-500)
 *   neutral            — the "Інше" bucket in category donuts (slate-400)
 *
 * Macro ring colors (kcal / protein / fat / carbs) live here too so the
 * Nutrition dashboard matches the mobile ring colors via a single
 * source of truth.
 */
export const chartHex = {
  primary: "#6366f1", // indigo-500 — budget trend default
  limit: statusColors.danger, // #ef4444 — over-budget / limit line
  neutral: "#94a3b8", // slate-400 — "Other" slice / unused category
  kcal: "#f97316", // orange-500
  protein: "#3b82f6", // blue-500
  fat: "#eab308", // yellow-500
  carbs: "#22c55e", // green-500
};
