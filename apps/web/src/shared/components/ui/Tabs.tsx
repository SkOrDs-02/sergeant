import {
  useCallback,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { ModuleAccent } from "@sergeant/design-tokens";
import { cn } from "@shared/lib/cn";

/**
 * Sergeant Design System — Tabs
 *
 * Accessible tablist with full keyboard support (ArrowLeft/ArrowRight,
 * Home/End, Enter/Space). Use for switching *between pages of content*
 * that should be addressable by URL-ish state.
 *
 * When to use what:
 *   - `Tabs`     — primary page-level or section-level navigation between
 *                  bodies of content. Renders role="tablist" with arrow-key
 *                  navigation, supports controlled panels.
 *   - `Segmented`— compact mode/view switcher (chips). No panels, shorter.
 *
 * Two-axis API (see `docs/design/COMPONENT_API.md`):
 *   - `variant` — accent colour (`brand` is the navigation default; the
 *                 four module tokens scope the active state to a module).
 *   - `style`   — visual treatment of the active tab.
 *                 `underline` (default) — thin border under the active
 *                                          label; works in dense layouts.
 *                 `pill`                 — soft tinted pill on the active
 *                                          label; better when isolated.
 */

export type TabsStyle = "underline" | "pill";

export type TabsVariant = "brand" | ModuleAccent;

export type TabsSize = "sm" | "md";

export interface TabItem<V extends string = string> {
  value: V;
  label: ReactNode;
  /** Optional icon rendered before the label. */
  icon?: ReactNode;
  /** Optional badge/count suffix. */
  badge?: ReactNode;
  disabled?: boolean;
}

export interface TabsProps<V extends string = string> {
  items: ReadonlyArray<TabItem<V>>;
  value: V;
  onChange: (value: V) => void;
  /** Visual treatment of the active tab. Defaults to `underline`. */
  style?: TabsStyle;
  /** Accent colour token. Defaults to `brand`. */
  variant?: TabsVariant;
  size?: TabsSize;
  /** Stretch tabs to fill the container width. */
  fill?: boolean;
  /** Accessible label for the tablist. */
  ariaLabel?: string;
  /**
   * Returns the DOM `id` of the panel each tab controls. Pass this when
   * the consumer renders `<div role="tabpanel" id="…">` siblings — Tabs
   * will then emit `aria-controls={getPanelId(value)}`. Omit if the page
   * doesn't render real panels (e.g. tabs that drive route changes or
   * design-system showcases): without a target we'd produce dangling
   * IDREFs (axe `aria-valid-attr-value`), which is worse than no
   * `aria-controls` at all.
   */
  getPanelId?: (value: V) => string;
  className?: string;
  tabsClassName?: string;
}

// Active-tab text on the page background. The brand `*-500` shade only
// clears ~2.5:1 on cream `bg-bg`; the `*-strong` companion (= `[700]`,
// or lime-800 for nutrition) clears ≥4.5:1. See
// docs/design/brand-palette-wcag-aa-proposal.md § 2.2.
const VARIANT_TEXT: Record<TabsVariant, string> = {
  brand: "text-brand-strong",
  finyk: "text-finyk-strong",
  fizruk: "text-fizruk-strong",
  routine: "text-routine-strong",
  nutrition: "text-nutrition-strong",
};

const VARIANT_UNDERLINE: Record<TabsVariant, string> = {
  brand: "border-brand",
  finyk: "border-finyk",
  fizruk: "border-fizruk",
  routine: "border-routine",
  nutrition: "border-nutrition",
};

const VARIANT_PILL: Record<TabsVariant, string> = {
  brand: "bg-brand-soft text-brand-strong dark:text-brand",
  finyk:
    "bg-finyk-soft text-finyk-strong dark:bg-finyk-surface-dark/15 dark:text-finyk",
  fizruk:
    "bg-fizruk-soft text-fizruk-strong dark:bg-fizruk-surface-dark/15 dark:text-fizruk",
  routine:
    "bg-routine-surface text-routine-strong dark:bg-routine-surface-dark/15 dark:text-routine",
  nutrition:
    "bg-nutrition-soft text-nutrition-strong dark:bg-nutrition-surface-dark/15 dark:text-nutrition",
};

const VARIANT_RING: Record<TabsVariant, string> = {
  brand: "focus-visible:ring-brand-500/45",
  finyk: "focus-visible:ring-finyk/45",
  fizruk: "focus-visible:ring-fizruk/45",
  routine: "focus-visible:ring-routine/45",
  nutrition: "focus-visible:ring-nutrition/45",
};

const SIZE: Record<TabsSize, string> = {
  sm: "h-9 px-3 text-xs",
  md: "h-11 px-4 text-sm",
};

export function Tabs<V extends string = string>({
  items,
  value,
  onChange,
  style = "underline",
  variant = "brand",
  size = "md",
  fill = false,
  ariaLabel,
  getPanelId,
  className,
  tabsClassName,
}: TabsProps<V>) {
  const listRef = useRef<HTMLDivElement>(null);
  const baseId = useId();

  const focusTabByOffset = useCallback(
    (currentIndex: number, offset: number) => {
      const el = listRef.current;
      if (!el) return;
      const buttons = Array.from(
        el.querySelectorAll<HTMLButtonElement>(
          'button[role="tab"]:not([disabled])',
        ),
      );
      if (buttons.length === 0) return;
      const enabled = items.filter((i) => !i.disabled);
      const currentVal = items[currentIndex]?.value;
      const enabledIdx = enabled.findIndex((i) => i.value === currentVal);
      const nextIdx = (enabledIdx + offset + enabled.length) % enabled.length;
      const next = enabled[nextIdx];
      if (!next) return;
      const nextBtn = buttons.find(
        (b) => b.dataset.value === String(next.value),
      );
      nextBtn?.focus();
      onChange(next.value);
    },
    [items, onChange],
  );

  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        focusTabByOffset(index, 1);
        break;
      case "ArrowLeft":
        event.preventDefault();
        focusTabByOffset(index, -1);
        break;
      case "Home":
        event.preventDefault();
        focusTabByOffset(-1, 1);
        break;
      case "End":
        event.preventDefault();
        focusTabByOffset(items.length, -1);
        break;
      default:
    }
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "flex items-stretch",
        style === "underline"
          ? "gap-1 border-b border-line"
          : "gap-1 p-1 rounded-2xl bg-surface-muted",
        fill && "w-full",
        className,
      )}
    >
      {items.map((item, index) => {
        const isActive = item.value === value;
        const commonClasses = cn(
          "inline-flex items-center justify-center gap-2 font-semibold",
          "transition-colors outline-none",
          "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
          VARIANT_RING[variant],
          SIZE[size],
          fill && "flex-1 min-w-0",
          item.disabled && "opacity-50 cursor-not-allowed",
        );

        const styleClasses =
          style === "underline"
            ? cn(
                "rounded-none border-b-2 -mb-px",
                isActive
                  ? cn(VARIANT_UNDERLINE[variant], VARIANT_TEXT[variant])
                  : "border-transparent text-fg-muted hover:text-fg",
              )
            : cn(
                "rounded-xl",
                isActive
                  ? VARIANT_PILL[variant]
                  : "text-fg-muted hover:text-fg hover:bg-surface",
              );

        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            id={`${baseId}-tab-${item.value}`}
            data-value={String(item.value)}
            aria-selected={isActive}
            aria-controls={getPanelId ? getPanelId(item.value) : undefined}
            tabIndex={isActive ? 0 : -1}
            disabled={item.disabled}
            onClick={() => !item.disabled && onChange(item.value)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={cn(commonClasses, styleClasses, tabsClassName)}
          >
            {item.icon}
            <span className="truncate">{item.label}</span>
            {item.badge}
          </button>
        );
      })}
    </div>
  );
}
