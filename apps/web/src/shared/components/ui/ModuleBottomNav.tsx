import { memo, type ReactNode } from "react";
import { cn } from "../../lib/ui/cn";

/**
 * Sergeant Design System — ModuleBottomNav
 *
 * Shared bottom-navigation shell for Фінік / Фізрук / Рутина /
 * Харчування. Sits edge-to-edge along the screen bottom (matches
 * `HubBottomNav` shape) so the whole app reads under one navigation
 * pattern.
 *
 * Canonical shape:
 * - Height 60 px (64 px on coarse-pointer devices).
 * - `safe-area-pb` so iOS home-indicator clears.
 * - `bg-panel/95 motion-safe:backdrop-blur-xl` translucent surface,
 *   `border-t border-line` only — no horizontal margin, no rounded
 *   corners, no shadow.
 * - Active indicator: thin 4 px sliding stripe (`top-0 h-1 w-10
 *   rounded-full`) at the top of the active tab, tinted with the
 *   module's accent gradient. Carries module identity.
 * - Active icon picks up `tokens.text` (module-colored); label
 *   stays `text-text`. No drop-shadow glow.
 * - Labels `text-style-caption` (12px) per Hard Rule #16.
 *
 * Routine special-case (FAB):
 * - Consumers may render an additional center FAB as a sibling of
 *   the nav (NOT nested inside it) at `z-40`, positioned over the
 *   nav's top edge. See `RoutineBottomNav`. The FAB sits in front
 *   of the nav's stacking context and keeps its own coral gradient
 *   per Routine identity.
 *
 * Accessibility:
 * - Default role is <nav> with <button aria-current="page">.
 * - Visible text label provides the accessible name (no duplicate
 *   aria-label).
 * - Pass `role="tablist"` to render as tabs (role="tab",
 *   aria-selected, tabIndex, aria-controls via `panelId`). Matches
 *   routine settings tabs semantics.
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
  /** Active icon tint. Module-colored text token. */
  text: string;
  /** Top-stripe gradient — identity carrier. */
  pill: string;
  /** Tiny unread/attention dot color. */
  badge: string;
};

const COLORS: Record<ModuleNavColor, ColorTokens> = {
  finyk: {
    text: "text-finyk",
    pill: "bg-linear-to-r from-brand-400 to-brand-500",
    badge: "bg-finyk",
  },
  fizruk: {
    text: "text-fizruk",
    pill: "bg-linear-to-r from-teal-400 to-teal-500",
    badge: "bg-fizruk",
  },
  routine: {
    text: "text-routine",
    pill: "bg-linear-to-r from-coral-400 to-coral-500",
    badge: "bg-routine",
  },
  nutrition: {
    text: "text-nutrition",
    pill: "bg-linear-to-r from-lime-400 to-lime-500",
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
      aria-label={ariaLabel}
      className={cn(
        "shrink-0 relative z-30 safe-area-pb",
        "bg-panel/95 motion-safe:backdrop-blur-xl",
        "border-t border-line",
        className,
      )}
    >
      <div
        className="relative flex h-[60px] pointer-coarse:h-[64px]"
        role={isTablist ? "tablist" : undefined}
      >
        {activeIndex >= 0 && (
          <span
            data-testid="module-bottom-nav-active-indicator"
            className={cn(
              "absolute top-0 h-1 w-10 rounded-full pointer-events-none",
              tokens.pill,
              "shadow-sm",
              "transition-[left] duration-200 ease-out",
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
                "min-h-touch-target",
                "transition-all duration-200",
                "active:scale-95",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-panel",
                active ? "text-text" : "text-muted hover:text-text/70",
              )}
            >
              <span
                className={cn(
                  "relative transition-all duration-200",
                  active && tokens.text,
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
              <span className="text-style-caption font-semibold leading-none">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
});
