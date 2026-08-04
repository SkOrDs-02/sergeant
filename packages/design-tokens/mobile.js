/**
 * Mobile spacing / radius / colour constants for `apps/mobile`.
 *
 * Single source of truth for the React Native theme — re-exported by
 * `apps/mobile/src/theme.ts`. Keeps mobile-specific scalar tokens in the
 * shared design-tokens package so future cross-app work (e.g. a Capacitor
 * shell variant) can consume the same values.
 *
 * AI-NOTE: must stay `.js` + `.d.ts` (see AGENTS.md anti-pattern #2 / #720).
 */

/**
 * @type {Readonly<{
 *   bg: string;
 *   surface: string;
 *   border: string;
 *   text: string;
 *   textMuted: string;
 *   accent: string;
 *   success: string;
 *   warning: string;
 *   danger: string;
 *   info: string;
 *   accentStrong: string;
 *   successStrong: string;
 *   warningStrong: string;
 *   dangerStrong: string;
 *   infoStrong: string;
 * }>}
 *
 * AI-NOTE: `accent` must match web `--c-accent`
 * (#0f766e, teal-700; 2026-07: was #10b981 emerald-500) so that Sergeant's
 * brand accent is identical cross-platform. Keep `success` / `warning` /
 * `danger` / `info` aligned with `statusColors` in `./tokens.js` (these
 * stay emerald/amber/red/sky — the 2026-07 rebrand only moved the brand
 * accent + finyk module hue to teal, not status semantics).
 *
 * AI-CONTEXT: `*Strong` companions mirror the web `*-strong` Tailwind
 * tokens introduced in PR #854 / docs/design/brand-palette-wcag-aa-proposal.md.
 * The mobile theme is light+dark (via `ColorSchemeBridge`, wired through
 * `darkMode: "class"` in `apps/mobile/tailwind.config.js`) — `apps/mobile/
 * global.css` carries a full `:root` / `.dark` pair, same as web. These
 * JS-exported `colors.*` fields stay static (a single light-tier hex per
 * key) — StyleSheet-based consumers that need to react to the active
 * scheme should prefer the NativeWind `bg-{c}` / `text-{c}` utilities
 * (theme-aware via the CSS vars in `apps/mobile/global.css`) over
 * `colors.*`. `*Strong` is the on-cream / on-white companion for fills
 * under `text-white`.
 *
 * NativeWind utilities `bg-{c}-strong` / `text-{c}-strong` are already
 * available via `tailwind-preset.js` — these JS exports cover the
 * StyleSheet-based consumers (`StyleSheet.create({ color: colors.* })`)
 * that don't go through NativeWind's class-name interop.
 */
export const colors = Object.freeze({
  bg: "#0b0d10",
  surface: "#13161b",
  border: "#1f242c",
  text: "#f2f4f7",
  textMuted: "#8a94a6",
  accent: "#0f766e", // teal-700 (2026-07: was #10b981 emerald-500)
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  info: "#0ea5e9",
  // WCAG-AA companions for light surfaces (see AI-CONTEXT above).
  // teal-800 / emerald-700 / amber-700 / red-700 / sky-700.
  accentStrong: "#115e59", // teal-800 (2026-07: was #047857 emerald-700)
  successStrong: "#047857",
  warningStrong: "#b45309",
  dangerStrong: "#b91c1c",
  infoStrong: "#0369a1",
});

/** @type {Readonly<{ xs: number; sm: number; md: number; lg: number; xl: number; xxl: number; }>} */
export const spacing = Object.freeze({
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
});

/** @type {Readonly<{ sm: number; md: number; lg: number; xl: number; }>} */
export const radius = Object.freeze({
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
});

/**
 * Module-specific accent colors for StyleSheet-based consumers that
 * can't go through NativeWind class-name interop. Matches
 * `moduleColors` in `./tokens.js` — single source of truth.
 *
 * Usage: `StyleSheet.create({ color: moduleColors.finyk.primary })`
 * NativeWind consumers: use `text-finyk`, `bg-routine`, etc. instead.
 */
export { moduleColors } from "./tokens.js";
