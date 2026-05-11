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
 * AI-NOTE: `accent` must match web `statusColors.success` / `--c-accent`
 * (#10b981, emerald-500) so that Sergeant's brand accent is identical
 * cross-platform. Keep `success` / `warning` / `danger` / `info` aligned
 * with `statusColors` in `./tokens.js`.
 *
 * AI-CONTEXT: `*Strong` companions mirror the web `*-strong` Tailwind
 * tokens introduced in PR #854 / docs/design/brand-palette-wcag-aa-proposal.md.
 * On the current *dark-only* mobile theme the saturated `*` shades already
 * clear WCAG AA against `bg` / `surface` (emerald-500 ≈ 5.4:1, amber-500
 * ≈ 8.3:1, etc.) — `*Strong` is **not** required there, and using it on
 * dark surfaces would actually regress contrast (emerald-700 ≈ 2.0:1 on
 * `#13161b`). The fields are exported now so RN primitives can adopt the
 * same naming the web uses, and so when mobile gains a *light* theme
 * (`darkMode: "class"` is already wired in `apps/mobile/tailwind.config.js`)
 * the strong shades become the correct on-cream choice without another
 * token migration. Components rendering on the current dark theme should
 * keep using the saturated `*` value; switch to `*Strong` only inside
 * code paths gated on the light scheme.
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
  accent: "#10b981",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  info: "#0ea5e9",
  // WCAG-AA companions for light surfaces (see AI-CONTEXT above).
  // emerald-700 / amber-700 / red-700 / sky-700.
  accentStrong: "#047857",
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
