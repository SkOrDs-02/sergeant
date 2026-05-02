/**
 * @scaffolded
 * @owner @Skords-01
 * @addedIn 1d443ac1 (feat(web): add UI/UX improvements and new components)
 * @nextStep Pair with `<PullToRefreshIndicator>` and wire into module
 *           pages. See docs/design/design-system.md § PullToRefreshIndicator.
 *
 * Scaffolded but not yet imported by any consumer. Do NOT delete as part of
 * dead-code cleanup — see Hard Rule #15 in AGENTS.md.
 */
import { useState, useRef, useCallback, useEffect } from "react";

export interface PullToRefreshState {
  /** Whether currently pulling down */
  isPulling: boolean;
  /** Whether refresh is in progress */
  isRefreshing: boolean;
  /** Pull distance in pixels (0 to pullThreshold) */
  pullDistance: number;
  /** Pull progress (0 to 1) */
  pullProgress: number;
  /** Whether pull threshold has been exceeded (ready to refresh) */
  canRefresh: boolean;
}

export interface UsePullToRefreshOptions {
  /** Callback when refresh is triggered */
  onRefresh: () => Promise<void>;
  /** Pull distance required to trigger refresh (default: 80px) */
  pullThreshold?: number;
  /** Maximum pull distance (default: 120px) */
  maxPullDistance?: number;
  /** Resistance factor for pulling past threshold (default: 0.4) */
  resistance?: number;
  /** Whether pull-to-refresh is enabled (default: true) */
  enabled?: boolean;
  /** Ref to scrollable container (required) */
  scrollRef: React.RefObject<HTMLElement>;
}

/**
 * Hook for native-like pull-to-refresh gesture.
 * Only activates when at top of scroll container.
 *
 * Returns state for building custom pull-to-refresh UI:
 * - isPulling: actively pulling
 * - isRefreshing: refresh in progress
 * - pullDistance: current pull distance
 * - pullProgress: 0-1 progress toward threshold
 * - canRefresh: threshold exceeded, will refresh on release
 */
export function usePullToRefresh(
  options: UsePullToRefreshOptions,
): PullToRefreshState {
  const {
    onRefresh,
    pullThreshold = 80,
    maxPullDistance = 120,
    resistance = 0.4,
    enabled = true,
    scrollRef,
  } = options;

  const [state, setState] = useState<PullToRefreshState>({
    isPulling: false,
    isRefreshing: false,
    pullDistance: 0,
    pullProgress: 0,
    canRefresh: false,
  });

  const touchStartY = useRef<number | null>(null);
  const touchStartScrollTop = useRef<number>(0);

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (!enabled || state.isRefreshing) return;

      const scrollElement = scrollRef.current;
      if (!scrollElement) return;

      // Only activate if at top of scroll
      if (scrollElement.scrollTop <= 0) {
        touchStartY.current = e.touches[0].clientY;
        touchStartScrollTop.current = scrollElement.scrollTop;
      }
    },
    [enabled, state.isRefreshing, scrollRef],
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!enabled || state.isRefreshing || touchStartY.current === null)
        return;

      const scrollElement = scrollRef.current;
      if (!scrollElement) return;

      const currentY = e.touches[0].clientY;
      const deltaY = currentY - touchStartY.current;

      // Only handle pull-down when at top
      if (deltaY > 0 && scrollElement.scrollTop <= 0) {
        // Apply resistance after threshold
        let adjustedDelta = deltaY;
        if (deltaY > pullThreshold) {
          const overpull = deltaY - pullThreshold;
          adjustedDelta = pullThreshold + overpull * resistance;
        }

        const pullDistance = Math.min(adjustedDelta, maxPullDistance);
        const pullProgress = Math.min(pullDistance / pullThreshold, 1);
        const canRefresh = pullDistance >= pullThreshold;

        setState((prev) => ({
          ...prev,
          isPulling: true,
          pullDistance,
          pullProgress,
          canRefresh,
        }));

        // Prevent scroll while pulling
        if (pullDistance > 0) {
          e.preventDefault();
        }
      }
    },
    [
      enabled,
      state.isRefreshing,
      scrollRef,
      pullThreshold,
      maxPullDistance,
      resistance,
    ],
  );

  const handleTouchEnd = useCallback(async () => {
    if (!enabled || touchStartY.current === null) return;

    touchStartY.current = null;

    if (state.canRefresh && !state.isRefreshing) {
      setState((prev) => ({
        ...prev,
        isPulling: false,
        isRefreshing: true,
        pullDistance: pullThreshold * 0.6, // Keep indicator visible
        pullProgress: 0.6,
        canRefresh: false,
      }));

      try {
        await onRefresh();
      } finally {
        // Animate out
        setState({
          isPulling: false,
          isRefreshing: false,
          pullDistance: 0,
          pullProgress: 0,
          canRefresh: false,
        });
      }
    } else {
      // Reset without refresh
      setState({
        isPulling: false,
        isRefreshing: false,
        pullDistance: 0,
        pullProgress: 0,
        canRefresh: false,
      });
    }
  }, [enabled, state.canRefresh, state.isRefreshing, pullThreshold, onRefresh]);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement || !enabled) return;

    scrollElement.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    scrollElement.addEventListener("touchmove", handleTouchMove, {
      passive: false,
    });
    scrollElement.addEventListener("touchend", handleTouchEnd, {
      passive: true,
    });

    return () => {
      scrollElement.removeEventListener("touchstart", handleTouchStart);
      scrollElement.removeEventListener("touchmove", handleTouchMove);
      scrollElement.removeEventListener("touchend", handleTouchEnd);
    };
  }, [scrollRef, enabled, handleTouchStart, handleTouchMove, handleTouchEnd]);

  return state;
}
