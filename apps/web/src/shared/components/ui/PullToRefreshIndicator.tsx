/**
 * @scaffolded
 * @owner @Skords-01
 * @addedIn 1d443ac1 (feat(web): add UI/UX improvements and new components)
 * @nextStep Wire into Finyk/Fizruk/Routine/Nutrition module pages so
 *           PWA users get a native-like refresh gesture. See
 *           docs/design/design-system.md § PullToRefreshIndicator for
 *           the integration recipe.
 *
 * Scaffolded but not yet imported by any consumer. Do NOT delete as part of
 * dead-code cleanup — see Hard Rule #15 in AGENTS.md.
 */
import { cn } from "@shared/lib/cn";
import type { PullToRefreshState } from "@shared/hooks/usePullToRefresh";

export interface PullToRefreshIndicatorProps {
  state: PullToRefreshState;
  /** Module accent color variant */
  variant?: "finyk" | "fizruk" | "routine" | "nutrition" | "default";
  className?: string;
}

const VARIANT_COLORS = {
  finyk: "text-finyk border-finyk/30",
  fizruk: "text-fizruk border-fizruk/30",
  routine: "text-routine border-routine/30",
  nutrition: "text-nutrition border-nutrition/30",
  default: "text-brand border-brand/30",
};

/**
 * Pull-to-refresh indicator component.
 * Shows a spinner that rotates based on pull progress.
 * Pairs with `usePullToRefresh` hook.
 */
export function PullToRefreshIndicator({
  state,
  variant = "default",
  className,
}: PullToRefreshIndicatorProps) {
  const { isPulling, isRefreshing, pullProgress, pullDistance, canRefresh } =
    state;

  if (!isPulling && !isRefreshing && pullDistance === 0) return null;

  return (
    <div
      className={cn(
        "absolute left-1/2 -translate-x-1/2 z-50 flex items-center justify-center",
        "transition-[transform,opacity] duration-200 ease-out",
        className,
      )}
      style={{
        transform: `translateX(-50%) translateY(${pullDistance - 48}px)`,
        opacity: Math.min(pullProgress * 1.5, 1),
      }}
    >
      <div
        className={cn(
          "w-10 h-10 rounded-full bg-panel shadow-card border flex items-center justify-center",
          VARIANT_COLORS[variant],
          canRefresh && "scale-110",
          "transition-transform duration-150",
        )}
      >
        <svg
          className={cn(
            "w-5 h-5",
            isRefreshing && "motion-safe:animate-pull-rotate",
          )}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          style={{
            transform: isRefreshing
              ? undefined
              : `rotate(${pullProgress * 360}deg)`,
            transition: isRefreshing ? undefined : "transform 0.1s ease-out",
          }}
        >
          <path d="M21 12a9 9 0 11-6.219-8.56" />
        </svg>
      </div>
    </div>
  );
}
