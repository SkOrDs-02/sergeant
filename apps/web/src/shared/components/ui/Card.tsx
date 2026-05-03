import {
  forwardRef,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "../../lib/ui/cn";

/**
 * Sergeant Design System — Card Component
 *
 * The Card surface has two layers of decisions:
 *   1. **Identity** — "is this card branded for a module?" → `module` prop
 *      (`finyk` / `fizruk` / `routine` / `nutrition`).
 *   2. **Prominence** — "how loud should the card read on the page?" →
 *      `prominence` prop (`hero` / `soft` / `tinted` / `flat` /
 *      `interactive` / `elevated` / `ghost`).
 *
 * `module` and `prominence` are orthogonal: every prominence has a
 * neutral and a module-tinted version, and the radius is always
 * controlled by the `radius` prop (no more "module variants silently
 * bake `rounded-3xl`").
 *
 * Dark-mode parity: module-branded surfaces (`hero`, `soft`, `tinted`)
 * resolve their tint through the `--c-{module}-soft*` token family
 * defined in `apps/web/src/index.css`. In light mode the tokens are
 * the `-50/-200` family; in dark mode they swap to a deep `-900/-800`
 * family, so module identity stays present across themes — light
 * cards no longer collapse into a near-neutral panel in dark mode.
 *
 * Radius hierarchy — maps to the 3 semantic tiers in `tailwind-preset.js`:
 *   - md  → rounded-xl  (12px, CONTROL) — inline / list cards & chips
 *   - lg  → rounded-2xl (16px, CARD)    — section/panel cards
 *   - xl  → rounded-3xl (24px, HERO)    — hero & module-branded cards
 *
 * The `variant` prop is preserved as a **deprecated alias** for the
 * historical string union (`default` / `interactive` / `flat` /
 * `elevated` / `ghost` / `finyk` / `finyk-soft` / …). Module variant
 * strings are translated to (`module`, `prominence`) internally.
 * Prefer the orthogonal API in new code; existing call-sites keep
 * working unchanged.
 *
 * @example
 *   // Neutral, default surface (page-level content cards)
 *   <Card>...</Card>
 *
 *   // Module-branded hero (Finyk dashboard)
 *   <Card module="finyk" prominence="hero" radius="xl">...</Card>
 *
 *   // Module-tinted soft surface (sub-card inside a module screen)
 *   <Card module="finyk" prominence="soft" radius="lg">...</Card>
 *
 *   // Legacy (still works — emits a deprecation hint via JSDoc only)
 *   <Card variant="finyk-soft">...</Card>
 */

export type CardModule = "finyk" | "fizruk" | "routine" | "nutrition";

export type CardProminence =
  | "default"
  | "interactive"
  | "flat"
  | "elevated"
  | "ghost"
  | "hero"
  | "soft"
  | "tinted";

/**
 * @deprecated Prefer the orthogonal `module` + `prominence` props.
 * The string union is kept for back-compat with existing call-sites
 * and is internally mapped to the new API.
 */
export type CardVariant =
  | "default"
  | "interactive"
  | "flat"
  | "elevated"
  | "ghost"
  | CardModule
  | `${CardModule}-soft`;

export type CardPadding = "none" | "sm" | "md" | "lg" | "xl";

export type CardRadius = "md" | "lg" | "xl";

const radii: Record<CardRadius, string> = {
  md: "rounded-xl",
  lg: "rounded-2xl",
  xl: "rounded-3xl",
};

const paddings: Record<CardPadding, string> = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-5",
  xl: "p-6",
};

// ─── Non-module surfaces ──────────────────────────────────────────────
// Reach for these when the card is **not** branded for a module.
// Padding and radius are layered on top of these by the wrapper below.
const NON_MODULE_PROMINENCE: Record<
  Exclude<CardProminence, "hero" | "soft" | "tinted">,
  string
> = {
  default: "bg-panel border border-line shadow-card",
  interactive:
    "bg-panel border border-line shadow-card transition-interactive hover:shadow-float hover:-translate-y-0.5 active:scale-[0.99] cursor-pointer",
  flat: "bg-panel border border-line",
  elevated: "bg-panel border border-line shadow-float",
  ghost: "bg-transparent border border-transparent",
};

// ─── Module-branded surfaces ───────────────────────────────────────────
// Each module owns 3 prominence treatments. Light + dark are encoded
// together so call-sites never need to re-implement the dark variant.
//
//   hero    — full saturated identity (light: bg-hero-{module} gradient;
//             dark: bg-{module}-soft, the deep -900 family token).
//   soft    — branded surface on a panel (single token, no /50 wash).
//             Replaces the legacy `bg-{module}-soft/50` pattern that
//             washed out in light and dropped to ~6% in dark.
//   tinted  — neutral panel with a module-tinted hairline. Quietest
//             form of identity — module belongs to this card but its
//             content is the focus.
const MODULE_PROMINENCE: Record<
  CardModule,
  Record<"hero" | "soft" | "tinted", string>
> = {
  finyk: {
    hero: "border shadow-card bg-hero-emerald border-finyk-soft-border/50 dark:bg-finyk-soft dark:border-finyk-soft-border/40",
    soft: "border bg-finyk-soft border-finyk-soft-border backdrop-blur-sm",
    tinted: "bg-panel border border-finyk-soft-border shadow-card",
  },
  fizruk: {
    hero: "border shadow-card bg-hero-teal border-fizruk-soft-border/50 dark:bg-fizruk-soft dark:border-fizruk-soft-border/40",
    soft: "border bg-fizruk-soft border-fizruk-soft-border backdrop-blur-sm",
    tinted: "bg-panel border border-fizruk-soft-border shadow-card",
  },
  routine: {
    hero: "border shadow-card bg-hero-coral border-coral-200/50 dark:bg-routine-soft dark:border-routine-soft-border/40",
    soft: "border bg-routine-soft border-routine-soft-border backdrop-blur-sm",
    tinted: "bg-panel border border-routine-soft-border shadow-card",
  },
  nutrition: {
    hero: "border shadow-card bg-hero-lime border-lime-200/50 dark:bg-nutrition-soft dark:border-nutrition-soft-border/40",
    soft: "border bg-nutrition-soft border-nutrition-soft-border backdrop-blur-sm",
    tinted: "bg-panel border border-nutrition-soft-border shadow-card",
  },
};

const SOFT_VARIANT_RE = /^(finyk|fizruk|routine|nutrition)-soft$/;
const MODULE_VARIANT_RE = /^(finyk|fizruk|routine|nutrition)$/;

interface ResolvedVariant {
  readonly module: CardModule | null;
  readonly prominence: CardProminence;
}

/**
 * Maps a legacy `variant` string to the new (`module`, `prominence`)
 * pair, or passes through the new API when the caller uses it
 * directly. The new API wins when both are provided — explicit beats
 * implicit. This is identical to how `<Button>` resolves its
 * `module`-vs-`variant` collision (see Button.tsx line ~178 in the
 * test).
 */
function resolveVariant(
  variant: CardVariant | undefined,
  module: CardModule | undefined,
  prominence: CardProminence | undefined,
): ResolvedVariant {
  if (module || prominence) {
    return {
      module: module ?? null,
      prominence: prominence ?? (module ? "hero" : "default"),
    };
  }
  if (!variant) {
    return { module: null, prominence: "default" };
  }
  if (SOFT_VARIANT_RE.test(variant)) {
    const m = variant.replace("-soft", "") as CardModule;
    return { module: m, prominence: "soft" };
  }
  if (MODULE_VARIANT_RE.test(variant)) {
    return { module: variant as CardModule, prominence: "hero" };
  }
  return {
    module: null,
    prominence: variant as Exclude<CardProminence, "hero" | "soft" | "tinted">,
  };
}

function surfaceClass(resolved: ResolvedVariant): string {
  const { module, prominence } = resolved;
  if (module) {
    if (
      prominence === "hero" ||
      prominence === "soft" ||
      prominence === "tinted"
    ) {
      return MODULE_PROMINENCE[module][prominence];
    }
    // `module` set with a non-module prominence → fall through to the
    // neutral surface but keep the module-tinted hairline so the card
    // still reads as belonging to the module. This makes
    // `<Card module="finyk" prominence="interactive">` a valid combo
    // for clickable list items inside a Finyk screen.
    return cn(
      NON_MODULE_PROMINENCE[prominence],
      `border-${module}-soft-border`,
    );
  }
  if (
    prominence === "hero" ||
    prominence === "soft" ||
    prominence === "tinted"
  ) {
    // Module-only prominences without a module → defensive fallback to
    // the historical default surface. We don't want a runtime throw
    // here because it would crash production for a misconfiguration
    // that's purely cosmetic.
    return NON_MODULE_PROMINENCE.default;
  }
  return NON_MODULE_PROMINENCE[prominence];
}

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /**
   * @deprecated Prefer `module` + `prominence`. Kept for back-compat
   * with existing call-sites; module-style variants are mapped to the
   * new API internally.
   */
  variant?: CardVariant;
  module?: CardModule;
  prominence?: CardProminence;
  padding?: CardPadding;
  radius?: CardRadius;
  as?: ElementType;
  children?: ReactNode;
}

/**
 * The historical visual default for legacy module-`-soft` variants was
 * `rounded-2xl` (lg). Preserve that for back-compat when the caller
 * didn't pass an explicit `radius`. New API consumers (`module` +
 * `prominence`) always honour the `radius` prop with the standard
 * `xl` default.
 */
function defaultRadius(variant: CardVariant | undefined): CardRadius {
  if (variant && SOFT_VARIANT_RE.test(variant)) return "lg";
  return "xl";
}

export const Card = forwardRef<HTMLElement, CardProps>(function Card(
  {
    className,
    variant,
    module,
    prominence,
    padding = "md",
    radius,
    as: Component = "div",
    children,
    ...props
  },
  ref,
) {
  const resolved = resolveVariant(variant, module, prominence);
  const effectiveRadius = radius ?? defaultRadius(variant);
  return (
    <Component
      ref={ref}
      className={cn(
        surfaceClass(resolved),
        radii[effectiveRadius],
        paddings[padding],
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
});

/**
 * CardHeader — Consistent header section for cards
 */
export function CardHeader({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center justify-between mb-4", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export interface CardTitleProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
}

/**
 * CardTitle — Title text for cards
 */
export function CardTitle({
  className,
  as: Component = "h3",
  ...props
}: CardTitleProps) {
  return (
    <Component
      className={cn("text-lg font-semibold text-text", className)}
      {...props}
    />
  );
}

/**
 * CardDescription — Secondary text for cards
 */
export function CardDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted mt-1", className)} {...props} />;
}

/**
 * CardContent — Main content area with optional overflow handling
 */
export function CardContent({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("", className)} {...props} />;
}

/**
 * CardFooter — Footer section for actions
 */
export function CardFooter({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 mt-4 pt-4 border-t border-line",
        className,
      )}
      {...props}
    />
  );
}
