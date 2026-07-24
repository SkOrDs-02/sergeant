import { type ElementType, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/ui/cn";

/**
 * Sergeant Design System — SectionHeading
 *
 * Consolidates the 80+ "eyebrow"-style section titles scattered across
 * modules. Current de-facto drift:
 *   - text-style-caption font-bold text-subtle uppercase tracking-widest  (53 matches)
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

export type SectionHeadingSize = "2xs" | "xs" | "sm" | "md" | "lg" | "xl";

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
 * and drop their raw-className eslint-disable. `normal` covers the
 * `text-[11px] uppercase tracking-wide` no-explicit-weight pattern used
 * by sheet sub-headers (see `apps/mobile/src/modules/finyk/pages/Transactions`).
 */
export type SectionHeadingWeight =
  "normal" | "medium" | "semibold" | "bold" | "extrabold";

// Size-only tokens (font-scale + casing + tracking). Weight is applied
// separately so `weight` prop overrides can compose cleanly. The `2xs`
// step maps to text-style-caption (12px) + uppercase + tracking-wide —
// raised from 10px to satisfy HR#16 (minimum 12px text).
// Роль задає РОЗМІР; casing / tracking / weight лишаються шарами поверх
// (той самий патерн, що вже був у `2xs`). eyebrow-розміри сидять на
// `caption` (12px floor, HR#16); md — `label`; lg/xl — `title` (секційний
// заголовок). Цикл 6: сирих `text-xs/sm/lg/xl` тут більше немає.
const sizeTokens: Record<SectionHeadingSize, string> = {
  "2xs": "text-style-caption uppercase tracking-wide",
  xs: "text-style-caption uppercase tracking-wider",
  sm: "text-style-caption uppercase tracking-widest",
  md: "text-style-label",
  lg: "text-style-title leading-tight",
  xl: "text-style-title leading-tight",
};

const weightTokens: Record<SectionHeadingWeight, string> = {
  normal: "font-normal",
  medium: "font-medium",
  semibold: "font-semibold",
  bold: "font-bold",
  extrabold: "font-extrabold",
};

const defaultWeightForSize: Record<SectionHeadingSize, SectionHeadingWeight> = {
  "2xs": "bold",
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
  // docs/design/archive/brand-palette-wcag-aa-proposal.md § 2.2 and the SectionHeading
  // contract test that pins the className.
  accent: "text-brand-strong",
  // Module-branded tints — normalised to /70 so callers don't drift
  // between /70, /80, /90. In dark mode the de-emphasised /70 subtitle
  // must still clear WCAG AA (4.5:1) for normal text on `--c-panel`:
  // finyk/routine/fizruk ride the lighter `-300` tier (emerald/coral/cyan-300
  // /70 ≈ 5.5–6.3:1), while nutrition's lime-500/70 already clears AA (≈4.9:1).
  finyk: "text-finyk-strong dark:text-finyk-300/70",
  fizruk: "text-fizruk-strong dark:text-fizruk-300/70",
  routine: "text-routine-strong dark:text-routine-300/70",
  nutrition: "text-nutrition-strong dark:text-nutrition/70",
};

// Default variant per size — eyebrow sizes (xs/sm) are muted;
// body-size headings default to the foreground text colour.
// `muted`, не `subtle`: eyebrow — 12px bold, а `text-subtle` у dark дає
// 3.13:1 на панелі (axe serious, design-audit F9); `text-muted` = 6.03:1.
const defaultVariantForSize: Record<SectionHeadingSize, SectionHeadingVariant> =
  {
    "2xs": "muted",
    xs: "muted",
    sm: "muted",
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
  /**
   * Optional small DS eyebrow label rendered above the main heading. This
   * pairs a compact uppercase kicker with a larger title in one primitive
   * so call-sites stop hand-rolling the raw `uppercase tracking-* text-*`
   * combo (the `no-eyebrow-drift` pattern) for hero / card kickers. The
   * eyebrow uses the `2xs` size tokens; tone/tag/id are tunable below.
   */
  eyebrow?: ReactNode;
  /** Colour variant for the `eyebrow` slot. Defaults to `subtle`. */
  eyebrowTone?: SectionHeadingVariant;
  /** Semantic tag for the `eyebrow` slot. Defaults to `p`. */
  eyebrowAs?: ElementType;
  /** `id` for the `eyebrow` slot — wire it to `aria-labelledby` on a group. */
  eyebrowId?: string;
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
  eyebrow,
  eyebrowTone = "subtle",
  eyebrowAs: EyebrowComponent = "p",
  eyebrowId,
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

  const eyebrowNode =
    eyebrow != null ? (
      <EyebrowComponent
        id={eyebrowId}
        className={cn(
          sizeTokens["2xs"],
          weightTokens[defaultWeightForSize["2xs"]],
          variants[eyebrowTone],
        )}
      >
        {eyebrow}
      </EyebrowComponent>
    ) : null;

  if (action) {
    return (
      <div className={cn("flex items-center justify-between gap-3", className)}>
        <div>
          {eyebrowNode}
          <Component className={base} {...props}>
            {children}
          </Component>
        </div>
        <div className="shrink-0">{action}</div>
      </div>
    );
  }

  if (eyebrowNode) {
    return (
      <div className={className}>
        {eyebrowNode}
        <Component className={base} {...props}>
          {children}
        </Component>
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
