import { type ElementType, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/cn";

/**
 * Sergeant Design System — SectionHeading
 *
 * Consolidates the 80+ "eyebrow"-style section titles scattered across
 * modules. Current de-facto drift:
 *   - text-2xs font-bold text-subtle uppercase tracking-widest  (53 matches)
 *   - text-xs  font-bold text-subtle uppercase tracking-widest  (majority of Fizruk)
 *   - text-xs  text-muted uppercase tracking-wide font-semibold (Finyk)
 *   - text-2xs text-nutrition/70 font-bold uppercase tracking-wide (nutrition macros)
 *
 * Sizes drive **font scale + weight + casing + tracking** only. Colour
 * is picked via `variant` (see `docs/design/COMPONENT_API.md`) so the same size
 * can render in `subtle` (default eyebrow on cards), `muted`, or a
 * module-branded tint (finyk / fizruk / routine / nutrition). Semantics
 * default to <h3>.
 */

export type SectionHeadingSize = "xs" | "sm" | "md" | "lg" | "xl";

export type SectionHeadingVariant =
  | "subtle"
  | "muted"
  | "text"
  | "accent"
  | "finyk"
  | "fizruk"
  | "routine"
  | "nutrition";

/**
 * Font-weight override. Default is size-dependent (eyebrow sizes bold,
 * md semibold, lg/xl extrabold). Primary use-case is the Finyk drift
 * "text-xs text-muted uppercase tracking-wide font-semibold" — after this
 * prop exists, call-sites can opt-in via `<SectionHeading weight="semibold">`
 * and drop their raw-className eslint-disable.
 */
export type SectionHeadingWeight = "semibold" | "bold" | "extrabold";

// Size-only tokens (font-scale + casing + tracking). Weight is applied
// separately so `weight` prop overrides can compose cleanly.
const sizeTokens: Record<SectionHeadingSize, string> = {
  xs: "text-xs uppercase tracking-wider",
  sm: "text-xs uppercase tracking-widest",
  md: "text-sm",
  lg: "text-lg leading-tight",
  xl: "text-xl leading-tight",
};

const weightTokens: Record<SectionHeadingWeight, string> = {
  semibold: "font-semibold",
  bold: "font-bold",
  extrabold: "font-extrabold",
};

const defaultWeightForSize: Record<SectionHeadingSize, SectionHeadingWeight> = {
  xs: "bold",
  sm: "bold",
  md: "semibold",
  lg: "extrabold",
  xl: "extrabold",
};

const variants: Record<SectionHeadingVariant, string> = {
  subtle: "text-subtle",
  muted: "text-muted",
  text: "text-text",
  // `accent` uses `text-brand-strong` (= emerald-700) instead of the
  // global `--c-accent` token (= emerald-500). The latter only clears
  // ~2.4:1 against the cream `bg-bg`; `-strong` clears 5.23:1. See
  // docs/design/brand-palette-wcag-aa-proposal.md § 2.2 and the SectionHeading
  // contract test that pins the className.
  accent: "text-brand-strong",
  // Module-branded tints — normalised to /70 so callers don't drift
  // between /70, /80, /90.
  finyk: "text-finyk-strong dark:text-finyk/70",
  fizruk: "text-fizruk-strong dark:text-fizruk/70",
  routine: "text-routine-strong dark:text-routine/70",
  nutrition: "text-nutrition-strong dark:text-nutrition/70",
};

// Default variant per size — eyebrow sizes (xs/sm) are muted/subtle;
// body-size headings default to the foreground text colour.
const defaultVariantForSize: Record<SectionHeadingSize, SectionHeadingVariant> =
  {
    xs: "subtle",
    sm: "subtle",
    md: "text",
    lg: "text",
    xl: "text",
  };

export interface SectionHeadingProps extends HTMLAttributes<HTMLElement> {
  size?: SectionHeadingSize;
  /** Colour variant. Defaults to `subtle` for xs/sm and `text` for md+. */
  variant?: SectionHeadingVariant;
  /**
   * Font-weight override. Defaults to `bold` for xs/sm (eyebrow),
   * `semibold` for md, and `extrabold` for lg/xl. Use `semibold` to
   * match the Finyk eyebrow tone on neutral cards.
   */
  weight?: SectionHeadingWeight;
  as?: ElementType;
  /** Optional right-aligned slot for actions/links. */
  action?: ReactNode;
  children?: ReactNode;
  /** When `as="button"`, allow specifying the button type. */
  type?: "button" | "submit" | "reset";
  /** When `as="button"`, allow disabling. */
  disabled?: boolean;
}

export function SectionHeading({
  className,
  size = "xs",
  variant,
  weight,
  as: Component = "h3",
  action,
  children,
  ...props
}: SectionHeadingProps) {
  const resolvedVariant = variant ?? defaultVariantForSize[size];
  const resolvedWeight = weight ?? defaultWeightForSize[size];
  const base = cn(
    sizeTokens[size],
    weightTokens[resolvedWeight],
    variants[resolvedVariant],
  );

  if (action) {
    return (
      <div className={cn("flex items-center justify-between gap-3", className)}>
        <Component className={base} {...props}>
          {children}
        </Component>
        <div className="shrink-0">{action}</div>
      </div>
    );
  }

  return (
    <Component className={cn(base, className)} {...props}>
      {children}
    </Component>
  );
}

/**
 * Alias exported so that consumers can import `SectionHeader` alongside
 * `Card` / `Badge` / `Tabs` / etc. Both names resolve to the same
 * component — prefer `SectionHeader` in new code.
 */
export const SectionHeader = SectionHeading;
