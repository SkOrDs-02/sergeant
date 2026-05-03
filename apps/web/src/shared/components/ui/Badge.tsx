import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@shared/lib/ui/cn";

/**
 * Sergeant Design System — Badge
 *
 * Compact pill for status, counts and labels. Pairs with `Card` /
 * `SectionHeading` titles and stat rows. Variants use the semantic /
 * brand tokens (`accent` / `success` / `warning` / `danger` / `info`)
 * plus the four module brand colours, so dark mode works automatically.
 *
 * Tones:
 *   - `soft`  — tinted bg + accent fg + accent border (default)
 *   - `solid` — filled accent bg + white fg (high-emphasis)
 *   - `outline` — transparent bg + accent border + accent fg
 */

export type BadgeVariant =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "finyk"
  | "fizruk"
  | "routine"
  | "nutrition";

export type BadgeTone = "soft" | "solid" | "outline";

export type BadgeSize = "xs" | "sm" | "md";

// Solid tones use `bg-{c}-strong text-white` (5.0–7.0:1) so labels stay
// readable at body sizes. The previous `bg-{c} text-white` failed WCAG
// AA (~2.5:1) for every brand / status / module token. See
// docs/design/brand-palette-wcag-aa-proposal.md § 2.2.
const solidVariants: Record<BadgeVariant, string> = {
  neutral: "bg-fg-muted/90 text-surface border-transparent",
  accent: "bg-brand-strong text-white border-transparent",
  success: "bg-success-strong text-white border-transparent",
  warning: "bg-warning-strong text-white border-transparent",
  danger: "bg-danger-strong text-white border-transparent",
  info: "bg-info-strong text-white border-transparent",
  finyk: "bg-finyk-strong text-white border-transparent",
  fizruk: "bg-fizruk-strong text-white border-transparent",
  routine: "bg-routine-strong text-white border-transparent",
  nutrition: "bg-nutrition-strong text-white border-transparent",
};

// Wave 1b: the soft-wash variants collapse onto preset-owned tokens
// (`-soft`, `-soft-border`, `-strong`) — no more hand-rolled `dark:`
// palette patches. `text-amber-700 dark:text-amber-300` retained for
// warning/info because the `-strong` companion is tuned for cream/white
// backgrounds and the dark-mode text remains palette-driven.
const softVariants: Record<BadgeVariant, string> = {
  neutral: "bg-surface-muted text-fg-muted border-line",
  accent:
    "bg-brand-soft text-brand-strong border-brand-soft-border/60 dark:text-brand",
  success:
    "bg-brand-soft text-brand-strong border-brand-soft-border/60 dark:text-brand",
  warning:
    "bg-warning-soft text-warning-strong border-warning/30 dark:text-amber-300",
  danger:
    "bg-danger-soft text-danger-strong border-danger/30 dark:text-red-200",
  info: "bg-info-soft text-info-strong border-info/30 dark:text-blue-300",
  finyk:
    "bg-finyk-soft text-finyk-strong border-finyk-ring/50 dark:bg-finyk-surface-dark/15 dark:text-finyk dark:border-finyk-border-dark/30",
  fizruk:
    "bg-fizruk-soft text-fizruk-strong border-fizruk-ring/50 dark:bg-fizruk-surface-dark/15 dark:text-fizruk dark:border-fizruk-border-dark/30",
  routine:
    "bg-routine-surface text-routine-strong border-routine-ring/50 dark:bg-routine-surface-dark/15 dark:text-routine dark:border-routine-border-dark/30",
  nutrition:
    "bg-nutrition-soft text-nutrition-strong border-nutrition-ring/50 dark:bg-nutrition-surface-dark/15 dark:text-nutrition dark:border-nutrition-border-dark/30",
};

// Outline tones place coloured text directly on the page background.
// Borders aren't text, so the brand `*-500` shade stays at 60 % alpha
// for the outline; the *label* uses `text-{c}-strong` (≥4.5:1 on
// cream `bg-bg`).
const outlineVariants: Record<BadgeVariant, string> = {
  neutral: "border-line text-fg-muted bg-transparent",
  accent: "border-accent/60 text-brand-strong bg-transparent",
  success: "border-success/60 text-success-strong bg-transparent",
  warning: "border-warning/60 text-warning-strong bg-transparent",
  danger: "border-danger/60 text-danger-strong bg-transparent",
  info: "border-info/60 text-info-strong bg-transparent",
  finyk: "border-finyk/60 text-finyk-strong bg-transparent",
  fizruk: "border-fizruk/60 text-fizruk-strong bg-transparent",
  routine: "border-routine/60 text-routine-strong bg-transparent",
  nutrition: "border-nutrition/60 text-nutrition-strong bg-transparent",
};

const sizes: Record<BadgeSize, string> = {
  xs: "h-5 px-1.5 text-2xs gap-1 rounded-xl",
  sm: "h-6 px-2 text-xs gap-1 rounded-xl",
  md: "h-7 px-2.5 text-xs gap-1.5 rounded-xl",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  tone?: BadgeTone;
  size?: BadgeSize;
  /** Leading dot (useful for status indicators). */
  dot?: boolean;
  children?: ReactNode;
}

export function Badge({
  variant = "neutral",
  tone = "soft",
  size = "sm",
  dot = false,
  className,
  children,
  ...props
}: BadgeProps) {
  const toneMap =
    tone === "solid"
      ? solidVariants
      : tone === "outline"
        ? outlineVariants
        : softVariants;

  return (
    <span
      className={cn(
        "inline-flex items-center font-semibold border whitespace-nowrap",
        sizes[size],
        toneMap[variant],
        className,
      )}
      {...props}
    >
      {dot && (
        <span
          aria-hidden
          className="w-1.5 h-1.5 rounded-full bg-current shrink-0"
        />
      )}
      {children}
    </span>
  );
}
