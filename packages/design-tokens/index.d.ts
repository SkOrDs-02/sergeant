/**
 * Sergeant Design Tokens — shared TypeScript types.
 *
 * Single source of truth for module/semantic/brand identifiers used across
 * web, mobile, and shared packages. Component-level redefinitions of these
 * unions should be removed in favour of these exports.
 */

/** Module accent identifiers — one per product domain. */
export type ModuleAccent = "finyk" | "fizruk" | "routine" | "nutrition";

/** Soft (tinted-surface) variants of module accents. */
export type ModuleSoftAccent =
  "finyk-soft" | "fizruk-soft" | "routine-soft" | "nutrition-soft";

/** Status / semantic colour identifiers used for feedback UI. */
export type StatusColor = "success" | "warning" | "danger" | "info";

/** Semantic tone for neutral/feedback components (no `info`). */
export type SemanticTone = "default" | "success" | "warning" | "danger";

/**
 * Union of semantic tones and module accents.
 * Useful for components that can be themed either by feedback tone
 * (e.g. `success`) or by module identity (e.g. `finyk`).
 */
export type SemanticOrModuleTone = SemanticTone | ModuleAccent;

/** Primary brand colour ramps exposed by `brandColors` in tokens.js. */
export type BrandColor =
  "emerald" | "teal" | "cyan" | "cream" | "rose" | "lime";

// ─── Runtime token shapes ────────────────────────────────────────────────

type ColorRamp = Readonly<Record<string, string>>;

/** Brand colour ramps. Mirrors `brandColors` in `tokens.js`. */
export declare const brandColors: Readonly<Record<BrandColor, ColorRamp>>;

/** Chart segment palette (1..N) — soft organic colours for pie charts. */
export declare const chartPalette: Readonly<Record<string, string>>;

/** Ordered list view of `chartPalette` values. */
export declare const chartPaletteList: readonly string[];

/**
 * Ідентифікатори вбудованих категорій витрат Фініка, які мають власний
 * колір. Кастомні категорії кольору тут не мають — вони беруть його з
 * `categoryFallbackOrder` за індексом.
 */
export type CategoryColorKey =
  | "restaurant"
  | "travel"
  | "utilities"
  | "smoking"
  | "charity"
  | "alcohol"
  | "sport"
  | "food"
  | "entertainment"
  | "transport"
  | "education"
  | "subscriptions"
  | "shopping"
  | "beauty"
  | "health"
  | "debt"
  | "other"
  /** Спільний тир усіх надходжень — див. `categoryColors` в `tokens.js`. */
  | "income";

/** Тири одного кольору категорії. Див. `categoryColors` в `tokens.js`. */
export interface CategoryColorTiers {
  /** Фон чипа/строки, світла тема. */
  readonly tint: string;
  /** Межа того ж чипа. */
  readonly border: string;
  /** Гліф і текст поверх `tint` — AA і на `tint`, і на фоні сторінки. */
  readonly ink: string;
  /** Насичений мід-тон: точки, сегменти діаграм. */
  readonly solid: string;
  /** Фон чипа у «Чорнилі». */
  readonly tintDark: string;
  /** Текст поверх `tintDark`. */
  readonly inkDark: string;
}

/**
 * Кольори категорій витрат — окрема родина, свідомо розведена з
 * модульними акцентами (гейт `categoryColors.contract.test.js`).
 */
export declare const categoryColors: Readonly<
  Record<CategoryColorKey, CategoryColorTiers>
>;

/** Порядок кольорів для кастомних категорій (за індексом). */
export declare const categoryFallbackOrder: readonly CategoryColorKey[];

/**
 * Module-specific accent colours keyed by module identifier. Every module
 * guarantees a `primary` shade; additional shades (`secondary`, `surface`, …)
 * are module-dependent and surface as `string | undefined` under
 * `noUncheckedIndexedAccess` (Hard Rule #19).
 */
export declare const moduleColors: Readonly<
  Record<ModuleAccent, Readonly<{ primary: string } & Record<string, string>>>
>;

/**
 * RGB triplet ("R G B", space-separated) per module for the
 * `--module-accent-rgb` and `--module-accent-strong-rgb` CSS variables
 * published by `ModuleAccentProvider`. The `strong` shade is the
 * WCAG-AA companion (`-700` / `-800`).
 */
export interface ModuleAccentRgb {
  readonly default: string;
  readonly strong: string;
}

export declare const moduleAccentRgb: Readonly<
  Record<ModuleAccent, ModuleAccentRgb>
>;

/**
 * Стіл і зона — фон сторінки (`desk`) і смуга під шапкою модуля (`zone`),
 * hex per theme. Mirrors `moduleSurfaces` in `tokens.js`; the CSS side is
 * `--module-desk-rgb` / `--module-zone-rgb` in `theme.css`.
 */
export interface ModuleSurfacePair {
  readonly desk: string;
  readonly zone: string;
}

export declare const moduleSurfaces: Readonly<
  Record<
    ModuleAccent | "hub",
    Readonly<{ light: ModuleSurfacePair; dark: ModuleSurfacePair }>
  >
>;

/**
 * «Чорнило» (Ink) — dark-first surface + text scale. Mirrors `inkTheme` in
 * `tokens.js`; the runtime export existed since the Чорнило direction landed,
 * but was missing here, so TypeScript consumers could not reach it.
 *
 * `accent` re-surfaces the tier-400 module tones: text over an accent fill is
 * always `surface.bg` ink, never white.
 */
export declare const inkTheme: Readonly<{
  surface: Readonly<{
    bg: string;
    surface: string;
    surfaceHi: string;
    line: string;
    lineStrong: string;
  }>;
  text: Readonly<{
    strong: string;
    fg: string;
    muted: string;
    subtle: string;
  }>;
  accent: Readonly<Record<ModuleAccent, string>>;
}>;

/** Status / semantic colours, keyed by `StatusColor`. */
export declare const statusColors: Readonly<Record<StatusColor, string>>;

/**
 * Status colours as a flat hex map — alias of `statusColors` for inline
 * SVG / canvas / native call sites that consume raw `"#rrggbb"` strings.
 */
export declare const statusHex: Readonly<Record<StatusColor, string>>;

/**
 * WCAG-AA `-strong` companions to `statusColors` — the LIGHT-theme tier:
 * what `text-{c}-strong` resolves to on cream/white and what
 * `bg-{c}-strong text-white` fills with in both themes. All four sit on
 * `-800`, the same tier as the four module accents; `contrast.test.js`
 * pins that.
 */
export declare const statusStrongHex: Readonly<Record<StatusColor, string>>;

/**
 * «Чорнило» companions to `statusStrongHex` — the DARK-theme ink tier that
 * `text-{c}-strong` resolves to (via `--c-{c}-ink`). All four sit on
 * `-400`, the same tier as the dark module accents; `contrast.test.js`
 * pins them against the ink surfaces.
 */
export declare const statusInkHex: Readonly<Record<StatusColor, string>>;

/** Accent families that carry an ink/strong text pair: brand + 4 modules. */
export type AccentFamily = "brand" | ModuleAccent;

/**
 * «Чорнило» companions to the accent `-strong` tier — the DARK-theme ink
 * that `text-{accent}-strong` resolves to (via `--c-{accent}-ink`). The
 * four modules sit on `-400`, the same tier as `--c-{module}-accent` and
 * `--c-chart-{module}` in dark; the neutral hub brand sits on stone-300,
 * matching `--c-brand-soft-fg`. `contrast.test.js` pins them against the
 * ink surfaces, and documents the light `-800` tier as failing there.
 */
export declare const accentInkHex: Readonly<Record<AccentFamily, string>>;

/**
 * The LIGHT-theme (fill) companions to `accentInkHex` — the `-800` tier
 * that `bg-{accent}-strong` fills with under `text-white` in both themes.
 */
export declare const accentStrongHex: Readonly<Record<AccentFamily, string>>;

/** Semantic chart colour identifiers (macro scale + structural). */
export type ChartHexKey = "limit" | "neutral" | "protein" | "fat" | "carbs";

/** Chart hex tokens — semantic names for inline-styled chart primitives. */
export declare const chartHex: Readonly<Record<ChartHexKey, string>>;

/** Semantic elevation levels — pair each level with the matching z-tier. */
export type ElevationLevel = "e0" | "e1" | "e2" | "e3" | "e4" | "e5";

/** Per-level shadow recipe with light + dark counterparts. */
export interface ElevationStep {
  readonly light: string;
  readonly dark: string;
}

/**
 * Elevation scale — semantic shadow contract. Consumers should prefer
 * the `shadow-eN` Tailwind utility (backed by CSS vars defined in
 * `apps/web/src/styles/theme.css`); this export exists for non-Tailwind
 * call sites (e.g. raw `boxShadow` style props, mobile shadow-spec).
 */
export declare const elevation: Readonly<Record<ElevationLevel, ElevationStep>>;

/** Semantic z-index tiers — match an `elevation.eN` level to its tier. */
export type ZTier =
  "base" | "dropdown" | "sticky" | "overlay" | "modal" | "toast";

/** Z-index tier values (numeric strings) keyed by semantic tier. */
export declare const zTier: Readonly<Record<ZTier, string>>;
