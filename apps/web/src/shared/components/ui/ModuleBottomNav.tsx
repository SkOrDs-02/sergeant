import { memo, type ReactNode } from "react";
import { cn } from "../../lib/ui/cn";

/**
 * Sergeant Design System — ModuleBottomNav (v2)
 *
 * Shared bottom-navigation shell for Фінік / Фізрук / Рутина /
 * Харчування. v2 (2026-05, PR-8) aligns the shape with `HubBottomNav`
 * — both navs are now floating glass pills (`mx-3`, `rounded-r-2xl`,
 * `shadow-nav`, `bg-surface-strong-glass`) so the whole app reads
 * under one navigation pattern. The only intentional divergence:
 * active-pill background is **module-tinted** (`bg-{module}-strong`)
 * instead of brand-agnostic `bg-ink-strong` — it carries module
 * identity now that the icon-glow + top-pill stripe are gone.
 *
 * Migration notes:
 * - v1 flat `border-t bg-panel/95` shell removed.
 * - v1 4px sliding top-pill indicator removed (active background pill
 *   does the same job with less visual noise).
 * - v1 icon `drop-shadow` glow removed (redundant once the pill is
 *   color-tinted). Active state now reads on the pill via
 *   `text-bg-base` (warm cream in light, near-black in dark) like
 *   HubBottomNav. Inactive icons keep `text-muted`.
 * - Labels switched from `text-2xs` (10px) to `text-style-caption`
 *   (12px) to satisfy Hard Rule #16 (12px floor for tab labels).
 * - Layout contract: outer wrapper owns `safe-area-pb` via
 *   `padding-bottom: calc(0.75rem + env(safe-area-inset-bottom))`;
 *   the inner `<nav>` becomes the visible pill. Floating chrome
 *   (`AIPill`, `ActiveWorkoutBanner`, FABs) must clear ≈ 84 px above
 *   the bottom — same offset as HubBottomNav.
 *
 * Routine special-case (FAB):
 * - Consumers may render an additional center FAB as a sibling of
 *   the nav (NOT nested inside it) at `z-40`, positioned over the
 *   pill's top edge. See `RoutineBottomNav`. The FAB sits in front
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
  /** Active-pill background. Module-tinted — identity carrier in v2. */
  pill: string;
  /** Tiny unread/attention dot color. */
  badge: string;
};

const COLORS: Record<ModuleNavColor, ColorTokens> = {
  finyk: {
    pill: "bg-finyk-strong",
    badge: "bg-finyk",
  },
  fizruk: {
    pill: "bg-fizruk-strong",
    badge: "bg-fizruk",
  },
  routine: {
    pill: "bg-routine-strong",
    badge: "bg-routine",
  },
  nutrition: {
    pill: "bg-nutrition-strong",
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
    // Outer wrapper owns `safe-area-pb` so the floating pill clears
    // the iOS home indicator without doubling padding inside `<nav>`
    // (matches HubBottomNav Phase 1 / M2 fix).
    <div
      className={cn("shrink-0 relative z-30", className)}
      style={{
        paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))",
      }}
    >
      <nav
        aria-label={ariaLabel}
        className={cn(
          "mx-3",
          // Phase 1 (M3) — `motion-safe:` guard so prefers-reduced-motion
          // users get the translucent panel without GPU-heavy blur
          // (Android Chrome WebView jank). Same treatment as
          // HubBottomNav v2.
          "bg-surface-strong-glass motion-safe:backdrop-blur-md",
          "border border-line",
          "rounded-r-2xl",
          "shadow-nav",
        )}
      >
        <div
          className="relative flex h-[60px] pointer-coarse:h-[64px] p-1"
          role={isTablist ? "tablist" : undefined}
        >
          {/* Active-tab background pill — module-tinted, sits BEHIND the
           * button content (`z-10` on each button keeps icons + labels
           * on top). Translates between tabs via `transition-[left]`. */}
          {activeIndex >= 0 && (
            <span
              data-testid="module-bottom-nav-active-indicator"
              className={cn(
                "absolute inset-y-1 pointer-events-none",
                "rounded-xl",
                tokens.pill,
                "transition-[left] duration-200 ease-out",
              )}
              style={{
                left: `calc(${activeIndex} * (100% / ${items.length}) + 0.25rem)`,
                width: `calc(100% / ${items.length} - 0.5rem)`,
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
                  // `z-10` lifts the button above the absolutely-positioned
                  // active background pill so icons + labels stay on top.
                  "relative z-10 flex-1 flex flex-col items-center justify-center gap-1",
                  "min-h-touch-target",
                  "transition-all duration-200",
                  "active:scale-95",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-panel",
                  // v2: active label/icon read on the module-strong pill
                  // background → invert to cream (`bg-base`). Inactive
                  // stays muted on the glass surface.
                  active ? "text-bg-base" : "text-muted hover:text-text/70",
                )}
              >
                <span
                  className="relative transition-all duration-200"
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
    </div>
  );
});
