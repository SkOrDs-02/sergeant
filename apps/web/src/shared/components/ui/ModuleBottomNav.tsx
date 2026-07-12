import { memo, type ReactNode } from "react";
import { cn } from "../../lib/ui/cn";

/**
 * Sergeant Design System — ModuleBottomNav
 *
 * Shared bottom-navigation shell for Фінік / Фізрук / Рутина /
 * Харчування. Docked edge-to-edge against the screen bottom (matches
 * `HubBottomNav`) so the whole app reads under one navigation pattern.
 *
 * Canonical shape:
 * - Height 60 px (64 px on coarse-pointer devices).
 * - Docked edge-to-edge in both browser and PWA standalone via
 *   `bottom-nav-shell` — no horizontal margins, flat bottom, rounded only
 *   at the top. The panel background fills the safe-area strip
 *   (padding-bottom) so there's no page-coloured dead space below the
 *   labels (user report 2026-06-05 / bottom-nav-gap; mobile-audit A1).
 * - Active indicator (fix spec v2 § 1 — light mirrors dark, solid not
 *   outline):
 *   - Light: a solid module-accent square (`tokens.fillLight` =
 *     strong-tier, e.g. `bg-finyk-strong`) with an ink-on-cream
 *     foreground (`text-bg`).
 *   - Dark («Чорнило»): a solid module-accent square (`tokens.fillDark`
 *     = luminescent tier-400) with the same ink foreground (`text-bg`
 *     resolves to `#0d1512` under `.dark`, so one bare class covers both
 *     themes). No drop-shadow glow.
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
  /** Active-tab solid fill (light) — module strong-tier accent. */
  fillLight: string;
  /** Active-tab solid fill (dark «Чорнило») — luminescent tier-400 accent. */
  fillDark: string;
  /** Tiny unread/attention dot color. */
  badge: string;
};

const COLORS: Record<ModuleNavColor, ColorTokens> = {
  finyk: {
    fillLight: "bg-finyk-strong",
    fillDark: "dark:bg-brand-400",
    badge: "bg-finyk",
  },
  fizruk: {
    fillLight: "bg-fizruk-strong",
    fillDark: "dark:bg-cyan-400",
    badge: "bg-fizruk",
  },
  routine: {
    fillLight: "bg-routine-strong",
    fillDark: "dark:bg-coral-400",
    badge: "bg-routine",
  },
  nutrition: {
    fillLight: "bg-nutrition-strong",
    fillDark: "dark:bg-lime-400",
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
        "bottom-nav-shell border border-line dark:border-white/8 bg-panel shadow-lg",
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
                "my-1.5 rounded-xl border min-h-touch-target",
                "transition-all duration-200",
                "active:scale-95",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-panel",
                active
                  ? cn(
                      // Solid module-accent fill in both themes (fix spec
                      // v2 § 1) — light: strong-tier, dark: tier-400. `text-bg`
                      // is itself theme-aware (cream in light, ink in dark).
                      "text-bg border-transparent",
                      tokens.fillLight,
                      tokens.fillDark,
                    )
                  : "text-text border-transparent hover:text-text/80",
              )}
            >
              <span
                className={cn(
                  "relative transition-all duration-200",
                  active && "text-bg",
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
