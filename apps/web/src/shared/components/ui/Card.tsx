import {
  forwardRef,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "../../lib/cn";

/**
 * Sergeant Design System — Card Component
 *
 * Variants:
 * - default: Standard panel card
 * - interactive: Hover lift effect for clickable cards
 * - flat: No shadow, minimal border
 * - elevated: Soft float shadow for hero/preview surfaces
 * - ghost: Transparent (use only when nesting in a coloured wrapper)
 *
 * Plus module-branded variants (finyk, fizruk, routine, nutrition) and
 * their soft counterparts (`*-soft`).
 *
 * Padding: none | sm | md (default) | lg | xl.
 *
 * Radius hierarchy — maps to the 3 semantic tiers in `tailwind-preset.js`:
 *   - md  → rounded-xl  (12px, CONTROL) — inline / list cards & chips
 *   - lg  → rounded-2xl (16px, CARD)    — section/panel cards (DEFAULT for
 *                                         content blocks inside a page)
 *   - xl  → rounded-3xl (24px, HERO)    — hero & module-branded cards
 *                                         (the four module variants bake
 *                                         this in already)
 *
 * The default is `radius="lg"` (CARD, 16px) — the everyday settings/list
 * panel surface. Reach for `radius="xl"` only on hero / module-branded
 * surfaces; the previous `radius="xl"` default made plain content cards
 * read as hero treatment and competed with the actual hero cards.
 */

export type CardVariant =
  | "default"
  | "interactive"
  | "flat"
  | "elevated"
  | "ghost"
  | "finyk"
  | "fizruk"
  | "routine"
  | "nutrition"
  | "finyk-soft"
  | "fizruk-soft"
  | "routine-soft"
  | "nutrition-soft";

export type CardPadding = "none" | "sm" | "md" | "lg" | "xl";

export type CardRadius = "md" | "lg" | "xl";

const radii: Record<CardRadius, string> = {
  md: "rounded-xl",
  lg: "rounded-2xl",
  xl: "rounded-3xl",
};

// Core variants omit the radius class — it's controlled by the `radius` prop.
// Module (branded) variants bake rounded-3xl into their class string for hero surfaces.
const variants: Record<CardVariant, string> = {
  default: "bg-panel border border-line shadow-card",
  interactive:
    "bg-panel border border-line shadow-card transition-interactive hover:shadow-float hover:-translate-y-0.5 active:scale-[0.99] cursor-pointer",
  flat: "bg-panel border border-line",
  elevated: "bg-panel border border-line shadow-float",
  ghost: "bg-transparent border border-transparent",

  // Module hero cards — branded surface in light, subtle tinted panel in dark.
  finyk:
    "rounded-3xl border border-brand-soft-border/50 bg-hero-emerald shadow-card dark:bg-panel dark:bg-card-finyk-dark",
  fizruk:
    "rounded-3xl border border-fizruk-soft-border/50 bg-hero-teal shadow-card dark:bg-panel dark:bg-card-fizruk-dark",
  routine:
    "rounded-3xl border border-coral-200/50 bg-hero-coral shadow-card dark:border-[rgba(162,51,51,0.3)] dark:bg-panel dark:bg-card-routine-dark",
  nutrition:
    "rounded-3xl border border-lime-200/50 bg-hero-lime shadow-card dark:border-[rgba(70,98,18,0.3)] dark:bg-panel dark:bg-card-nutrition-dark",

  // Soft module cards (less prominent). Wave 1b: single `{module}-soft`
  // token family replaces the hand-rolled `bg-<c>-50 dark:bg-<c>-500/10`
  // pair — both sides resolve through `--c-{module}-soft*` in
  // `apps/web/src/index.css` so theme adaptation is owned by the preset.
  "finyk-soft":
    "rounded-2xl border border-finyk-soft-border bg-finyk-soft/50 backdrop-blur-sm",
  "fizruk-soft":
    "rounded-2xl border border-fizruk-soft-border bg-fizruk-soft/50 backdrop-blur-sm",
  "routine-soft":
    "rounded-2xl border border-routine-soft-border bg-routine-soft/50 backdrop-blur-sm",
  "nutrition-soft":
    "rounded-2xl border border-nutrition-soft-border bg-nutrition-soft/50 backdrop-blur-sm",
};

const paddings: Record<CardPadding, string> = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-5",
  xl: "p-6",
};

export interface CardProps extends HTMLAttributes<HTMLElement> {
  variant?: CardVariant;
  padding?: CardPadding;
  radius?: CardRadius;
  as?: ElementType;
  children?: ReactNode;
}

const CORE_VARIANTS: ReadonlySet<CardVariant> = new Set([
  "default",
  "interactive",
  "flat",
  "elevated",
  "ghost",
]);

export const Card = forwardRef<HTMLElement, CardProps>(function Card(
  {
    className,
    variant = "default",
    padding = "md",
    radius = "xl",
    as: Component = "div",
    children,
    ...props
  },
  ref,
) {
  // Module (branded) variants bake their own radius for hero treatment.
  const radiusClass = CORE_VARIANTS.has(variant) ? radii[radius] : "";
  return (
    <Component
      ref={ref}
      className={cn(
        variants[variant],
        radiusClass,
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
