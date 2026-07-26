import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { ModuleAccent } from "@sergeant/design-tokens";
import { cn } from "../../lib/ui/cn";

/**
 * Sergeant Design System — Button Component
 *
 * ## Orthogonal API (canonical — use this for new code)
 *
 * A button is described by two independent axes, matching the `Badge`
 * (`variant` × `tone`) and `Card` (`module` × `prominence`) contracts so
 * the primitives stay mentally consistent:
 *
 * - **`variant`** — the *emphasis / shape*: `solid` | `soft` | `outline` | `ghost`.
 * - **`tone`** — the *colour family*: `neutral` | `finyk` | `fizruk` |
 *   `routine` | `nutrition` | `danger` | `success` | `ink`.
 *
 * ```tsx
 * <Button variant="solid"   tone="finyk">Додати</Button>   // module CTA
 * <Button variant="soft"    tone="finyk">Скасувати</Button> // module secondary
 * <Button variant="solid"   tone="danger">Видалити</Button> // destructive CTA
 * <Button variant="outline" tone="neutral">Назад</Button>   // neutral outline
 * ```
 *
 * Supported `(variant, tone)` cells map 1:1 onto the tested class strings in
 * `variants` below; unsupported combos fall back to `solid/neutral`.
 *
 * ## Legacy variants (DEPRECATED — kept as thin aliases)
 *
 * The pre-2026-07 flat variant strings fused role + emphasis into one token
 * (`finyk` vs `finyk-soft`) and were duplicated by the `module` prop. They
 * still work — each resolves to a `(variant, tone)` cell with byte-identical
 * output — but new code should use the orthogonal axes.
 *
 * | legacy        | → variant | tone       |
 * |---------------|-----------|------------|
 * | primary       | solid     | neutral    |
 * | secondary     | outline   | neutral    |
 * | ghost         | ghost     | neutral    |
 * | danger        | soft      | danger     |
 * | destructive   | solid     | danger     |
 * | success       | soft      | success    |
 * | finyk…nutrition        | solid | {module} |
 * | {module}-soft          | soft  | {module} |
 * | primary-ink   | solid     | ink        |
 *
 * Touch: `xs` / `sm` / icon-only sizes get `min 44×44px` under `@media (pointer: coarse)`
 * so primary controls stay tappable on phones while staying visually compact on desktop.
 *
 * @see ./Badge.tsx for the reference orthogonal (`variant` × `tone`) contract.
 */

/**
 * Emphasis / shape axis (canonical). Combine with {@link ButtonTone}.
 */
export type ButtonEmphasis = "solid" | "soft" | "outline" | "ghost";

/**
 * Colour-family axis (canonical). Combine with {@link ButtonEmphasis}.
 */
export type ButtonTone =
  | "neutral"
  | "finyk"
  | "fizruk"
  | "routine"
  | "nutrition"
  | "danger"
  | "success"
  | "ink";

/**
 * @deprecated The flat variant strings fuse emphasis + colour into one token.
 * Prefer the orthogonal `variant` ({@link ButtonEmphasis}) × `tone`
 * ({@link ButtonTone}) API. Kept as aliases; see the mapping table in the
 * component JSDoc. @removeBy 2026-12-01
 */
export type ButtonVariantLegacy =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "destructive"
  | "success"
  | "finyk"
  | "fizruk"
  | "routine"
  | "nutrition"
  | "finyk-soft"
  | "fizruk-soft"
  | "routine-soft"
  | "nutrition-soft"
  | "primary-ink";

/**
 * `variant` accepts either a canonical {@link ButtonEmphasis} (use with
 * `tone`) or a {@link ButtonVariantLegacy} alias (deprecated). `ghost` is
 * intentionally shared between both — it is a legacy name *and* a canonical
 * emphasis with identical output.
 */
export type ButtonVariant = ButtonEmphasis | ButtonVariantLegacy;

export type ButtonSize = "xs" | "sm" | "md" | "lg" | "xl";

// Internal style source of truth — one class string per legacy key. The
// orthogonal `(variant, tone)` API and the `module` prop both resolve DOWN
// to one of these keys (see `resolveStyleKey`), so every code path emits a
// string that is already covered by the contract tests. Do not inline these
// into the resolver — keeping them flat guarantees byte-identical output
// across the legacy and canonical entry points.
const variants: Record<ButtonVariantLegacy, string> = {
  // Core variants. Hub primary = NEUTRAL stone "ink on paper" (design-audit
  // M1): stone-800 fill + white text in light; inverted light-stone chip +
  // dark ink in dark. No coloured accent glow — the hub carries no module
  // hue, so a saturated halo would read as a fifth accent. Module buttons
  // (finyk/fizruk/…) keep their luminescent tier-400 fill + accent glow
  // below. `primary-ink` remains the alternative near-black ink primary.
  primary:
    "bg-brand-strong text-white shadow-sm hover:bg-brand-900 hover:shadow-md active:bg-brand-900 active:scale-[0.98] dark:bg-brand-100 dark:text-brand-900 dark:hover:bg-brand-200",
  // `secondary` is the neutral outline button. Its fill is `bg-panel`
  // (white in light / warm-charcoal in dark) — the SAME token as the
  // card & sheet surfaces it most often sits on, so the fill alone
  // can't separate it from its container, and swapping the fill can't
  // fix it either: a white fill pops on the cream page but cards are
  // white, while a cream fill pops on white cards but the page is cream
  // (the two contexts are inverted). Separation therefore comes from the
  // boundary + elevation, not the fill: `border-border-strong` is the
  // heavier outline companion (clears ~3:1 on the dark panel where the
  // shadow is invisible), and `shadow-e1` is the warm-tuned drop + inset
  // top-highlight that makes the white chip read as raised on a white
  // card. Hover lifts to `shadow-e2`, matching the interactive-Card
  // elevation contract. AI-CONTEXT: do not revert to `border-line` /
  // `shadow-sm` — that is the "white button on white card" regression.
  secondary:
    "bg-panel text-text border border-border-strong shadow-e1 hover:bg-panelHi hover:border-brand-200 hover:shadow-e2 active:scale-[0.98]",
  ghost:
    "bg-transparent text-muted hover:bg-panelHi hover:text-text active:bg-line/50",
  danger:
    "bg-danger-soft text-danger-soft-fg border border-danger/30 hover:bg-danger/15 hover:border-danger/50 active:scale-[0.98]",
  destructive:
    "bg-danger-strong text-white shadow-sm hover:brightness-110 hover:shadow-[0_0_0_3px_rgba(239,68,68,0.15)] active:scale-[0.98]",
  success:
    "bg-brand-soft text-brand-soft-fg border border-brand-soft-border/50 hover:bg-brand-soft-hover active:scale-[0.98]",

  // Module-specific branded buttons. Light keeps the AA-safe `-strong`
  // fill + white text. Dark «Чорнило» (spec § 4): the button is the
  // luminescent tier-400 module accent (`dark:bg-{module}` → theme-aware
  // accent) with an ink foreground (`dark:text-bg` → #0d1512) and a resting
  // accent glow instead of a drop shadow — depth reads as light, not
  // elevation. Text over the accent is ink, never white (Rule #9 needs no
  // `-strong` companion here).
  finyk:
    "bg-finyk-strong text-white shadow-sm hover:bg-teal-900 hover:shadow-glow-teal active:bg-teal-900 active:scale-[0.98] dark:bg-finyk dark:text-bg dark:shadow-glow-accent-teal",
  fizruk:
    "bg-fizruk-strong text-white shadow-sm hover:bg-cyan-900 hover:shadow-glow-cyan active:bg-cyan-900 active:scale-[0.98] dark:bg-fizruk dark:text-bg dark:shadow-glow-accent-cyan",
  routine:
    "bg-routine-strong text-white shadow-sm hover:bg-coral-800 hover:shadow-glow-coral active:bg-coral-900 active:scale-[0.98] dark:bg-routine dark:text-bg dark:shadow-glow-accent-coral",
  nutrition:
    "bg-nutrition-strong text-white shadow-sm hover:bg-lime-900 hover:shadow-glow-lime active:scale-[0.98] dark:bg-nutrition dark:text-bg dark:shadow-glow-accent-lime",

  // Soft module variants (for secondary actions within modules).
  // Dark mode keeps the saturated accent at low opacity for the FILL so the
  // button blends with the warm dark panel instead of reading as an acidic
  // pastel — same convention used by Badge/Tabs. The FOREGROUND, however,
  // is the theme-aware `text-<m>-soft-fg` token (NOT the mid accent): in
  // dark mode the old `dark:text-<m>` ink sat at the same tone as the
  // `bg-<m>/15` fill and measured ~1.77:1 (fizruk) — an a11y fail.
  // `text-<m>-soft-fg` resolves to the `-strong` ink in light and the
  // bright `-300` accent in dark, clearing WCAG AA in both themes from a
  // single class (see `--c-<m>-soft-fg` in theme.css). Readability wins
  // over the blend aesthetic.
  "finyk-soft":
    "bg-finyk-soft text-finyk-soft-fg dark:bg-finyk/15 border border-finyk-ring/50 dark:border-finyk/30 hover:bg-brand-100 dark:hover:bg-finyk/25 active:scale-[0.98]",
  "fizruk-soft":
    "bg-fizruk-soft text-fizruk-soft-fg dark:bg-fizruk/15 border border-fizruk-ring/50 dark:border-fizruk/30 hover:bg-cyan-100 dark:hover:bg-fizruk/25 active:scale-[0.98]",
  "routine-soft":
    "bg-routine-surface text-routine-soft-fg dark:bg-routine/15 border border-routine-ring/50 dark:border-routine/30 hover:bg-coral-100 dark:hover:bg-routine/25 active:scale-[0.98]",
  "nutrition-soft":
    "bg-nutrition-soft text-nutrition-soft-fg dark:bg-nutrition/15 border border-nutrition-ring/50 dark:border-nutrition/30 hover:bg-lime-100 dark:hover:bg-nutrition/25 active:scale-[0.98]",

  // Sergeant v2 inverted primary — see `ButtonVariant` JSDoc above.
  // `bg-ink-strong` is emerald-900 in light + white in dark (HC: pure
  // #000 / #fff). `text-bg-base` is the corresponding warm-cream / dark
  // base, so the contrast inverts cleanly with the theme.
  "primary-ink":
    "bg-ink-strong text-bg-base shadow-sm hover:opacity-90 hover:shadow-glow active:opacity-80 active:scale-[0.98]",
};

// RADIUS — every Button size lives in the CONTROL tier (12 px, rounded-xl)
// per the 3-tier system documented in `tailwind-preset.js`. The previous
// scale climbed through CARD (md/lg → 16 px) and HERO (xl → 24 px), which
// made tall CTAs read as panels rather than controls and broke the
// "all buttons are CONTROL" mental model. The xl button — at h-14 the
// only one that actually feels card-sized — bumps to CARD radius (16 px)
// so it does not compress to a near-pill on a 56 px square (icon-only xl).
const sizes: Record<ButtonSize, string> = {
  xs: "h-8 px-3 text-style-label font-medium rounded-xl gap-1.5",
  sm: "h-9 px-3.5 text-style-label font-medium rounded-xl gap-1.5",
  md: "h-11 px-5 text-style-label font-semibold rounded-xl gap-2",
  lg: "h-12 px-6 text-style-label-lg font-semibold rounded-xl gap-2",
  xl: "h-14 px-8 text-style-label-lg font-bold rounded-2xl gap-2.5",
};

// Icon-only button sizes
const iconSizes: Record<ButtonSize, string> = {
  xs: "h-8 w-8 rounded-xl",
  sm: "h-9 w-9 rounded-xl",
  md: "h-11 w-11 rounded-xl",
  lg: "h-12 w-12 rounded-xl",
  xl: "h-14 w-14 rounded-2xl",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant | undefined;
  size?: ButtonSize | undefined;
  iconOnly?: boolean | undefined;
  loading?: boolean | undefined;
  /** Progress value 0-100 for determinate loading state */
  progress?: number | undefined;
  /**
   * The colour-family axis (canonical). Combine with an emphasis `variant`
   * (`solid` / `soft` / `outline` / `ghost`). Ignored when `variant` is a
   * legacy alias that already encodes its own colour (e.g. `finyk`,
   * `destructive`) — the alias wins so existing call-sites are unaffected.
   */
  tone?: ButtonTone | undefined;
  /**
   * @deprecated Prefer `tone`. When set, redirects the *neutral* `primary` /
   * `secondary` variants to the host module's branded equivalent (e.g.
   * `module="finyk"` + `variant="primary"` → `finyk` solid; `+
   * variant="secondary"` → `finyk-soft`). Equivalent to
   * `tone="finyk"`. @removeBy 2026-12-01
   *
   * Other variants (`ghost`, `danger`, `destructive`, `success`, the
   * already-branded module variants) are passed through unchanged — a
   * destructive Delete button stays red even inside a Fizruk screen.
   *
   * Hub-level chrome (HubHeader, HubChat, dashboard) should leave both
   * `module` and `tone` unset — the neutral stone primary is intentional so
   * the four modules share a hueless parent.
   */
  module?: ModuleAccent | undefined;
  children?: ReactNode | undefined;
}

// The legacy variant union, as a runtime set, so the resolver can tell a
// legacy alias apart from a canonical emphasis word.
const LEGACY_VARIANTS = new Set<string>([
  "primary",
  "secondary",
  "ghost",
  "danger",
  "destructive",
  "success",
  "finyk",
  "fizruk",
  "routine",
  "nutrition",
  "finyk-soft",
  "fizruk-soft",
  "routine-soft",
  "nutrition-soft",
  "primary-ink",
]);

// Legacy `module` prop: redirect a NEUTRAL primary/secondary to the module's
// branded key. Mirrors the pre-2026-07 behaviour exactly (secondary → -soft).
const MODULE_LEGACY_OVERRIDE: Record<
  ModuleAccent,
  Partial<Record<ButtonVariantLegacy, ButtonVariantLegacy>>
> = {
  finyk: { primary: "finyk", secondary: "finyk-soft" },
  fizruk: { primary: "fizruk", secondary: "fizruk-soft" },
  routine: { primary: "routine", secondary: "routine-soft" },
  nutrition: { primary: "nutrition", secondary: "nutrition-soft" },
};

// Canonical `(emphasis, tone)` → internal legacy style key. Only the cells
// that map onto a tested class string are listed; anything else falls back
// to `primary` (solid/neutral). `ghost` is tone-agnostic (single neutral
// treatment), so it maps regardless of tone.
const EMPHASIS_TONE_MAP: Record<
  ButtonEmphasis,
  Partial<Record<ButtonTone, ButtonVariantLegacy>>
> = {
  solid: {
    neutral: "primary",
    ink: "primary-ink",
    danger: "destructive",
    finyk: "finyk",
    fizruk: "fizruk",
    routine: "routine",
    nutrition: "nutrition",
  },
  soft: {
    danger: "danger",
    success: "success",
    finyk: "finyk-soft",
    fizruk: "fizruk-soft",
    routine: "routine-soft",
    nutrition: "nutrition-soft",
  },
  outline: {
    neutral: "secondary",
  },
  ghost: {
    neutral: "ghost",
  },
};

/**
 * Collapse the public API (legacy alias OR canonical `variant` × `tone`,
 * plus the deprecated `module` prop) down to a single internal style key.
 */
function resolveStyleKey(
  variant: ButtonVariant,
  tone: ButtonTone | undefined,
  module: ModuleAccent | undefined,
): ButtonVariantLegacy {
  // Legacy path: a flat alias already encodes emphasis + colour. Preserve
  // the exact pre-2026-07 behaviour, including the `module` redirect.
  if (LEGACY_VARIANTS.has(variant)) {
    const legacy = variant as ButtonVariantLegacy;
    if (module) return MODULE_LEGACY_OVERRIDE[module][legacy] ?? legacy;
    return legacy;
  }

  // Canonical path: `variant` is an emphasis word. `tone` drives colour;
  // `module` is honoured only as a neutral→module shortcut for parity.
  const emphasis = variant as ButtonEmphasis;
  const effectiveTone: ButtonTone =
    (!tone || tone === "neutral") && module ? module : (tone ?? "neutral");
  return EMPHASIS_TONE_MAP[emphasis][effectiveTone] ?? "primary";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      className,
      variant = "primary",
      tone,
      size = "md",
      type = "button",
      iconOnly = false,
      loading = false,
      progress,
      module,
      disabled,
      children,
      ...props
    },
    ref,
  ) {
    const isDisabled = disabled || loading;
    const hasProgress = typeof progress === "number" && progress >= 0;
    const needsCoarseMinTarget = iconOnly || size === "xs" || size === "sm";
    const resolvedVariant = resolveStyleKey(variant, tone, module);

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        aria-live={loading ? "polite" : undefined}
        className={cn(
          // Base styles
          "inline-flex items-center justify-center touch-manipulation",
          "motion-safe:transition-all motion-safe:duration-200 motion-safe:ease-smooth",
          "motion-reduce:transition-none motion-reduce:active:scale-100!",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
          // Touch / coarse pointer: WCAG 2.5.5 / HIG ≥44×44px for compact controls.
          needsCoarseMinTarget &&
            "pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px]",
          // Resolved style key — legacy alias, or canonical variant×tone,
          // collapsed by resolveStyleKey (see its mapping tables).
          variants[resolvedVariant],
          // Size
          iconOnly ? iconSizes[size] : sizes[size],
          className,
        )}
        {...props}
      >
        {loading ? (
          <>
            {hasProgress ? (
              <ProgressSpinner progress={progress} className="shrink-0" />
            ) : (
              <LoadingSpinner className="motion-safe:animate-spin" />
            )}
            {!iconOnly && (
              <span className="opacity-0" aria-hidden="true">
                {children}
              </span>
            )}
            <span className="sr-only">
              {hasProgress
                ? `Завантаження ${Math.round(progress)}%`
                : "Завантаження…"}
            </span>
          </>
        ) : (
          children
        )}
      </button>
    );
  },
);

// Loading spinner component. Always decorative — SR announcement is handled by
// the sr-only "Завантаження…" sibling in Button.
function LoadingSpinner({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={cn("h-4 w-4", className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

// Determinate progress spinner with circular progress ring
function ProgressSpinner({
  progress,
  className,
}: {
  progress: number;
  className?: string;
}) {
  const radius = 7;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={cn("h-4 w-4", className)}
      viewBox="0 0 18 18"
    >
      {/* Background circle */}
      <circle
        cx="9"
        cy="9"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.25"
      />
      {/* Progress circle */}
      <circle
        cx="9"
        cy="9"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        transform="rotate(-90 9 9)"
        className="transition-[stroke-dashoffset] duration-200 ease-out"
      />
    </svg>
  );
}
