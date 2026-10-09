import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@shared/lib/ui/cn";
import { hapticTap } from "@shared/lib/adapters/haptic";

/**
 * Sergeant Design System - Segmented (мова H, redesign v3).
 *
 * iOS-форма: доріжка `bg-track` радіус 10, активний сегмент `bg-segment`
 * радіус 8 із тінню 1 px. Роль одна: вкладки й фільтри одного списку
 * (Всі / Витрати / Надходження, Тиждень / Місяць). Джерела вводу й
 * налаштування - список або радіо на hairline, не цей контрол.
 *
 * `layout="bar"` - доріжка на всю ширину з рівними сегментами; `pill` -
 * доріжка за шириною підписів. `variant` і `style` лишились як API, але
 * колір модуля сюди не потрапляє: hue лише в даних.
 */

export type SegmentedVariant =
  "brand" | "fizruk" | "routine" | "nutrition" | "finyk";
export type SegmentedStyle = "solid" | "soft";
export type SegmentedSize = "sm" | "md";
export type SegmentedLayout = "pill" | "bar";

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
  /** Row geometry. Defaults to `pill` (label-sized, wrapping chips). */
  layout?: SegmentedLayout;
  /** Accessible label for the underlying role="tablist". */
  ariaLabel?: string;
  className?: string;
}

// Solid mode active chip is inverted-ink («Чорнило» v3.1 § 6): dark —
// `bg-ink` (#e7f0ea) + `text-bg` (#14100e, fg-as-bg); light — the mirror
// inversion (`bg-ink` #17201b + `text-bg` #ecebe7). Both tokens are
// already theme-aware CSS vars, so one pair covers both themes. Border
// keeps the module accent for visual continuity with siblings.
const LAYOUT_ROW: Record<SegmentedLayout, string> = {
  pill: "inline-flex max-w-full flex-wrap items-stretch",
  bar: "flex w-full items-stretch",
};

const LAYOUT_ITEM: Record<SegmentedLayout, string> = {
  pill: "",
  bar: "flex-1 min-w-0",
};

const SIZE: Record<SegmentedSize, string> = {
  sm: "px-3 py-1.5 text-style-label min-h-[32px]",
  md: "px-3 py-2 text-style-label min-h-[40px] pointer-coarse:min-h-[44px]",
};

export function Segmented<V extends string = string>({
  items,
  value,
  onChange,
  size = "md",
  layout = "pill",
  ariaLabel,
  className,
}: SegmentedProps<V>) {
  const tablistRef = useRef<HTMLDivElement>(null);

  // Roving tabindex — one tab stop per tablist, ArrowLeft/ArrowRight/Home/End
  // move focus AND selection, mirroring `ModuleBottomNav`'s tablist mode.
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }
    const tabs = Array.from(
      tablistRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ??
        [],
    );
    if (tabs.length === 0) return;

    event.preventDefault();
    const focusedIndex = tabs.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    const activeIndex = Math.max(
      0,
      items.findIndex((item) => item.value === value),
    );
    const fromIndex = focusedIndex >= 0 ? focusedIndex : activeIndex;
    const targetIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : event.key === "ArrowRight"
            ? (fromIndex + 1) % tabs.length
            : (fromIndex - 1 + tabs.length) % tabs.length;
    const target = tabs[targetIndex];
    const item = items[targetIndex];
    if (!target || !item) return;
    target.focus();
    if (item.value !== value) {
      hapticTap();
      onChange(item.value);
    }
  };

  return (
    <div
      ref={tablistRef}
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "gap-0.5 rounded-[10px] bg-track p-0.5",
        LAYOUT_ROW[layout],
        className,
      )}
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
            tabIndex={isActive ? 0 : -1}
            onKeyDown={handleKeyDown}
            onClick={() => {
              if (item.value !== value) {
                hapticTap();
                onChange(item.value);
              }
            }}
            className={cn(
              "rounded-lg font-semibold transition-colors",
              LAYOUT_ITEM[layout],
              SIZE[size],
              isActive
                ? "bg-segment text-text shadow-segment"
                : "text-muted hover:text-text",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
