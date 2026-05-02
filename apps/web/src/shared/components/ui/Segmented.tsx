import type { ReactNode } from "react";
import { cn } from "@shared/lib/cn";
import { hapticTap } from "@shared/lib/haptic";

/**
 * Sergeant Design System — Segmented
 *
 * Pill-style segmented control for mode/tab switching inside a page.
 * Consolidates the drift between Fizruk Workouts (solid module-fill tabs)
 * and Routine calendar time-mode chips (soft tinted chips).
 *
 * Not intended to replace `<SubTabs>` (full-width bar-style) — that
 * pattern is a separate variant kept in its own component for now.
 *
 * Two-axis API (see `docs/design/COMPONENT_API.md`):
 *   - `variant` — accent colour (`brand` for the default chrome; the four
 *                 module tokens scope the active state to a module).
 *   - `style`   — visual treatment of the active chip.
 *                 `solid` — filled accent background (Fizruk Workouts).
 *                 `soft`  (default) — tinted surface + accent border
 *                                       + accent text (Routine chips).
 */

export type SegmentedVariant =
  | "brand"
  | "fizruk"
  | "routine"
  | "nutrition"
  | "finyk";
export type SegmentedStyle = "solid" | "soft";
export type SegmentedSize = "sm" | "md";

export interface SegmentedItem<V extends string = string> {
  value: V;
  label: ReactNode;
  title?: string;
  ariaLabel?: string;
}

export interface SegmentedProps<V extends string = string> {
  items: ReadonlyArray<SegmentedItem<V>>;
  value: V;
  onChange: (value: V) => void;
  /** Visual treatment of the active chip. Defaults to `soft`.
   *  `solid` = filled accent background (used in Fizruk Workouts tabs).
   *  `soft`  = tinted surface + accent border + accent text (Routine chips). */
  style?: SegmentedStyle;
  /** "sm" ≈ 36px min-height; "md" = 44px min-height (touch target). */
  size?: SegmentedSize;
  /** Accent colour token. Defaults to `brand`. */
  variant?: SegmentedVariant;
  /** Accessible label for the underlying role="tablist". */
  ariaLabel?: string;
  className?: string;
}

// Solid mode pairs `bg-{c}-strong text-white` (5.0–7.0:1) so the active
// segment label stays readable at 12 px. Border keeps the brand `*-500`
// for visual continuity with siblings; borders aren't text. See
// docs/design/brand-palette-wcag-aa-proposal.md § 2.2.
const VARIANT_SOLID: Record<SegmentedVariant, string> = {
  brand: "bg-brand-strong text-white border-brand",
  fizruk: "bg-fizruk-strong text-white border-fizruk",
  routine: "bg-routine-strong text-white border-routine",
  nutrition: "bg-nutrition-strong text-white border-nutrition",
  finyk: "bg-finyk-strong text-white border-finyk",
};

const VARIANT_SOFT: Record<SegmentedVariant, string> = {
  brand:
    "border-brand-soft-border bg-brand-soft text-brand-strong shadow-sm dark:text-brand",
  fizruk:
    "border-fizruk-ring bg-fizruk-surface text-fizruk-strong shadow-sm dark:border-fizruk-border-dark/40 dark:bg-fizruk-surface-dark/15 dark:text-fizruk",
  routine:
    "border-routine-ring bg-routine-surface text-routine-strong shadow-sm dark:border-routine-border-dark/40 dark:bg-routine-surface-dark/15 dark:text-routine",
  nutrition:
    "border-nutrition-ring bg-nutrition-surface text-nutrition-strong shadow-sm dark:border-nutrition-border-dark/40 dark:bg-nutrition-surface-dark/15 dark:text-nutrition",
  finyk:
    "border-finyk-ring bg-finyk-surface text-finyk-strong shadow-sm dark:border-finyk-border-dark/40 dark:bg-finyk-surface-dark/15 dark:text-finyk",
};

const INACTIVE =
  "border-line bg-panel text-muted hover:text-text hover:bg-panelHi transition-colors";

const SIZE: Record<SegmentedSize, string> = {
  sm: "px-3 py-2 text-xs min-h-[36px]",
  md: "px-3 py-2.5 text-xs min-h-[44px]",
};

export function Segmented<V extends string = string>({
  items,
  value,
  onChange,
  style = "soft",
  size = "md",
  variant = "brand",
  ariaLabel,
  className,
}: SegmentedProps<V>) {
  const activeClass =
    style === "solid" ? VARIANT_SOLID[variant] : VARIANT_SOFT[variant];

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn("flex flex-wrap items-center gap-1.5", className)}
    >
      {items.map((item) => {
        const isActive = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={item.ariaLabel}
            title={item.title}
            onClick={() => {
              if (item.value !== value) {
                hapticTap();
                onChange(item.value);
              }
            }}
            className={cn(
              "rounded-full border font-semibold transition-[background-color,border-color,color,box-shadow,opacity]",
              SIZE[size],
              isActive ? activeClass : INACTIVE,
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
