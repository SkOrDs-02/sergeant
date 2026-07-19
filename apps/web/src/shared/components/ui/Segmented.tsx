import type { ReactNode } from "react";
import { cn } from "@shared/lib/ui/cn";
import { hapticTap } from "@shared/lib/adapters/haptic";

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
  "brand" | "fizruk" | "routine" | "nutrition" | "finyk";
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

// Solid mode active chip is inverted-ink («Чорнило» v3.1 § 6): dark —
// `bg-ink` (#e7f0ea) + `text-bg` (#0d1512, fg-as-bg); light — the mirror
// inversion (`bg-ink` #17201b + `text-bg` #f2ecdf). Both tokens are
// already theme-aware CSS vars, so one pair covers both themes. Border
// keeps the module accent for visual continuity with siblings.
const VARIANT_SOLID: Record<SegmentedVariant, string> = {
  brand: "bg-ink text-bg border-brand",
  fizruk: "bg-ink text-bg border-fizruk",
  routine: "bg-ink text-bg border-routine",
  nutrition: "bg-ink text-bg border-nutrition",
  finyk: "bg-ink text-bg border-finyk",
};

// Soft mode active label uses the theme-aware `text-{c}-soft-fg` token
// (deep ink on the pale light/HC surface, bright accent on the deep dark
// surface) instead of the static `text-{c}-strong dark:text-{c}` pair —
// the fixed `-strong` hex went sub-AA once HC bumped the `-soft` surface a
// step darker. Module variants keep their dark surface/border tint.
const VARIANT_SOFT: Record<SegmentedVariant, string> = {
  brand: "border-brand-soft-border bg-brand-soft text-brand-soft-fg shadow-sm",
  fizruk:
    "border-fizruk-ring bg-fizruk-surface text-fizruk-soft-fg shadow-sm dark:border-fizruk-border-dark/40 dark:bg-fizruk-surface-dark/15",
  routine:
    "border-routine-ring bg-routine-surface text-routine-soft-fg shadow-sm dark:border-routine-border-dark/40 dark:bg-routine-surface-dark/15",
  nutrition:
    "border-nutrition-ring bg-nutrition-surface text-nutrition-soft-fg shadow-sm dark:border-nutrition-border-dark/40 dark:bg-nutrition-surface-dark/15",
  finyk:
    "border-finyk-ring bg-finyk-surface text-finyk-soft-fg shadow-sm dark:border-finyk-border-dark/40 dark:bg-finyk-surface-dark/15",
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
