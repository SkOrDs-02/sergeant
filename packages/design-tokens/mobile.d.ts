/**
 * TypeScript types for `@sergeant/design-tokens/mobile`.
 *
 * Mirrors the shapes declared in `mobile.js`. Update both files together.
 */

/** Mobile semantic colour identifiers (dark-theme palette). */
export type MobileColor =
  | "bg"
  | "surface"
  | "border"
  | "text"
  | "textMuted"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info"
  // WCAG-AA companions sized for light surfaces. See `mobile.js` AI-CONTEXT
  // for when to use these (only on light-mode rendering paths).
  | "accentStrong"
  | "successStrong"
  | "warningStrong"
  | "dangerStrong"
  | "infoStrong";

/** Mobile spacing scale identifiers (pixel values defined in `mobile.js`). */
export type MobileSpacing = "xs" | "sm" | "md" | "lg" | "xl" | "xxl";

/** Mobile border-radius scale identifiers. */
export type MobileRadius = "sm" | "md" | "lg" | "xl";

/** Mobile colour palette, keyed by `MobileColor`. */
export declare const colors: Readonly<Record<MobileColor, string>>;

/** Mobile spacing scale, keyed by `MobileSpacing`. */
export declare const spacing: Readonly<Record<MobileSpacing, number>>;

/** Mobile border-radius scale, keyed by `MobileRadius`. */
export declare const radius: Readonly<Record<MobileRadius, number>>;

/**
 * Module-specific accent colours for StyleSheet consumers.
 * Re-exported from tokens.js — identical values to the web token source.
 */
export declare const moduleColors: {
  finyk: { primary: string; secondary: string; surface: string; surfaceAlt: string };
  fizruk: { primary: string; secondary: string; surface: string; accent: string };
  routine: { primary: string; secondary: string; surface: string; surfaceAlt: string };
  nutrition: { primary: string; secondary: string; surface: string; surfaceAlt: string };
};

