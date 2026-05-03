import { memo, type ReactNode } from "react";
import { cn } from "../../lib/ui/cn";

/**
 * Sergeant Design System — ModuleBottomNav
 *
 * Single shared bottom-navigation shell for Фінік / Фізрук / Рутина /
 * Харчування. Replaces 4 near-identical per-module implementations that
 * had drifted on height (58 vs 60 px), blur (md vs xl), label size,
 * active-indicator treatment and color tokens.
 *
 * Canonical shape:
 * - height 60 px
 * - bg-panel/95 backdrop-blur-xl border-t border-line
 * - 4 tabs, each min-h-[48px], gap-1, active:scale-95
 * - active indicator: w-10 h-1 rounded-full at the top, module color
 * - icon uses module-colored glow when active
 * - label: text-2xs font-semibold
 *
 * Accessibility:
 * - Default role is <nav> with <button aria-current="page">.
 * - Visible text label provides the accessible name (no duplicate aria-label).
 * - Pass `role="tablist"` to render as tabs (role="tab", aria-selected,
 *   tabIndex, aria-controls via `panelId`). Matches routine settings
 *   tabs semantics.
 */

export type ModuleNavColor = "finyk" | "fizruk" | "routine" | "nutrition";

export interface ModuleBottomNavItem {
  id: string;
  label: string;
  icon: ReactNode;
  /** Show a small unread/attention dot on the icon. */
  badge?: boolean;
  /** aria-controls target id (only used when role="tablist"). */
  panelId?: string;
}

export interface ModuleBottomNavProps {
  items: readonly ModuleBottomNavItem[];
  activeId: string;
  onChange: (id: string) => void;
  module: ModuleNavColor;
  ariaLabel?: string;
  /** "navigation" (default) renders buttons as nav links with aria-current;
   *  "tablist" renders role=tab with aria-selected. */
  role?: "navigation" | "tablist";
  className?: string;
}

type ColorTokens = {
  text: string;
  pill: string;
  glow: string;
  badge: string;
};

const COLORS: Record<ModuleNavColor, ColorTokens> = {
  finyk: {
    text: "text-finyk",
    pill: "bg-linear-to-r from-brand-400 to-brand-500",
    glow: "drop-shadow-[0_0_8px_rgba(16,185,129,0.3)]",
    badge: "bg-finyk",
  },
  fizruk: {
    text: "text-fizruk",
    pill: "bg-linear-to-r from-teal-400 to-teal-500",
    glow: "drop-shadow-[0_0_8px_rgba(20,184,166,0.3)]",
    badge: "bg-fizruk",
  },
  routine: {
    text: "text-routine",
    pill: "bg-linear-to-r from-coral-400 to-coral-500",
    glow: "drop-shadow-[0_0_8px_rgba(249,112,102,0.3)]",
    badge: "bg-routine",
  },
  nutrition: {
    text: "text-nutrition",
    pill: "bg-linear-to-r from-lime-400 to-lime-500",
    glow: "drop-shadow-[0_0_8px_rgba(132,204,22,0.3)]",
    badge: "bg-nutrition",
  },
};

export const ModuleBottomNav = memo(function ModuleBottomNav({
  items,
  activeId,
  onChange,
  module,
  ariaLabel,
  role = "navigation",
  className,
}: ModuleBottomNavProps) {
  const tokens = COLORS[module];
  const isTablist = role === "tablist";
  const activeIndex = items.findIndex((i) => i.id === activeId);

  return (
    <nav
      className={cn(
        "shrink-0 relative z-30 safe-area-pb",
        "bg-panel/95 backdrop-blur-xl",
        "border-t border-line",
        className,
      )}
      aria-label={ariaLabel}
    >
      <div
        className="relative flex h-[60px] pointer-coarse:h-[64px]"
        role={isTablist ? "tablist" : undefined}
      >
        {/* Sliding pill indicator — single element that translates to active tab */}
        {activeIndex >= 0 && (
          <span
            className={cn(
              "absolute top-0 h-1 w-10 rounded-full shadow-sm pointer-events-none",
              "transition-[left] duration-200 ease-out",
              tokens.pill,
            )}
            style={{
              left: `calc(${activeIndex} * (100% / ${items.length}) + (100% / ${items.length} - 2.5rem) / 2)`,
            }}
            aria-hidden
          />
        )}

        {items.map((item) => {
          const active = activeId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role={isTablist ? "tab" : undefined}
              id={isTablist ? `${module}-tab-${item.id}` : undefined}
              aria-selected={isTablist ? active : undefined}
              aria-current={
                !isTablist ? (active ? "page" : undefined) : undefined
              }
              aria-controls={isTablist ? item.panelId : undefined}
              tabIndex={isTablist ? (active ? 0 : -1) : undefined}
              onClick={() => onChange(item.id)}
              className={cn(
                "relative flex-1 flex flex-col items-center justify-center gap-1",
                "transition-all duration-200 min-h-[48px] pointer-coarse:min-h-[52px]",
                "active:scale-95 pointer-coarse:active:bg-panelHi/50",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-panel",
                active ? "text-text" : "text-muted hover:text-text/70",
              )}
            >
              <span
                className={cn(
                  "relative transition-all duration-200",
                  active && tokens.text,
                  active && tokens.glow,
                )}
                aria-hidden
              >
                {item.icon}
                {item.badge && !active && (
                  <span
                    className={cn(
                      "absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-panel",
                      tokens.badge,
                    )}
                    aria-hidden
                  />
                )}
              </span>
              <span
                className={cn(
                  "text-2xs leading-none font-semibold transition-colors",
                  active ? "text-text" : "text-muted",
                )}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
});
