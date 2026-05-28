import { memo, type ReactNode } from "react";
import { cn } from "../../lib/ui/cn";

/**
 * Sergeant Design System — ModuleBottomNav
 *
 * Shared bottom-navigation shell for Фінік / Фізрук / Рутина /
 * Харчування. Renders as a floating pill inset from the screen edges
 * (matches `HubBottomNav` shape) so the whole app reads under one
 * navigation pattern.
 *
 * Canonical shape:
 * - Height 60 px (64 px on coarse-pointer devices).
 * - Floating pill: `mx-3 mb-[calc(env(safe-area-inset-bottom)+0.5rem)]
 *   rounded-3xl border border-line bg-panel shadow-lg`. Inset + rounded
 *   so it reads as a distinct panel with the page background continuing
 *   behind and below it, instead of an edge-to-edge bar whose bottom
 *   safe-area read as dead space / a black strip (navbar-dead-space,
 *   2026-05-28 → floating-pill direction). The Routine FAB's `-top-[22px]`
 *   offset assumes this pill's top edge.
 * - Active indicator: a rounded outline (`rounded-2xl border`)
 *   framing the active tab, tinted with the module accent
 *   (`tokens.outline`) — outline only, no fill. Carries module
 *   identity.
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
  /** Active-tab outline border — module accent at low opacity. */
  outline: string;
  /** Tiny unread/attention dot color. */
  badge: string;
};

const COLORS: Record<ModuleNavColor, ColorTokens> = {
  finyk: {
    text: "text-finyk",
    outline: "border-finyk/40",
    badge: "bg-finyk",
  },
  fizruk: {
    text: "text-fizruk",
    outline: "border-fizruk/40",
    badge: "bg-fizruk",
  },
  routine: {
    text: "text-routine",
    outline: "border-routine/40",
    badge: "bg-routine",
  },
  nutrition: {
    text: "text-nutrition",
    outline: "border-nutrition/40",
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

  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        "shrink-0 relative z-30",
        "mx-3 mb-[calc(env(safe-area-inset-bottom)_+_0.5rem)]",
        "rounded-3xl border border-line bg-panel shadow-lg",
        className,
      )}
    >
      <div
        className="relative flex h-[60px] pointer-coarse:h-[64px] gap-1 px-1"
        role={isTablist ? "tablist" : undefined}
      >
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
                "relative flex-1 flex flex-col items-center justify-end gap-1 pb-1.5",
                "my-1.5 rounded-2xl border min-h-touch-target",
                "transition-all duration-200",
                "active:scale-95",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-panel",
                active
                  ? cn("text-text", tokens.outline)
                  : "text-muted border-transparent hover:text-text/70",
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
