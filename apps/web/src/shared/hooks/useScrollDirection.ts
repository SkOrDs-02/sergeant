/**
 * useScrollDirection
 *
 * Tracks whether the user is scrolling up or down inside a scrollable element
 * (or the window). Used by HubHeader (#3) to condense itself on down-scroll
 * and re-expand on up-scroll.
 *
 * Returns:
 *   - `scrolled`   — true once the user has scrolled past `threshold` px.
 *   - `direction`  — "up" | "down" | null (null until first scroll event).
 *
 * Design constraints (Hard Rule #17 / animation budget):
 *   - The hook itself produces no animation; it only drives a CSS class.
 *   - Uses passive event listeners to avoid blocking the compositor thread.
 *   - Debounced to 1 rAF so rapid micro-scrolls don't thrash React state.
 */

import { useEffect, useRef, useState } from "react";

export type ScrollDirection = "up" | "down" | null;

export interface UseScrollDirectionOptions {
  /** Ref to the scrollable container. If omitted, listens on `window`. */
  containerRef?: React.RefObject<HTMLElement | null>;
  /**
   * Minimum px scrolled from the top before `scrolled` becomes `true`.
   * Default: 8 px — tight enough that a single flick registers immediately.
   */
  threshold?: number;
  /**
   * Minimum delta (px) between two consecutive scroll events before the
   * direction flips. Guards against micro-jitter at the top of the list.
   * Default: 4 px.
   */
  hysteresis?: number;
}

export function useScrollDirection({
  containerRef,
  threshold = 8,
  hysteresis = 4,
}: UseScrollDirectionOptions = {}) {
  const [scrolled, setScrolled] = useState(false);
  const [direction, setDirection] = useState<ScrollDirection>(null);

  const lastY = useRef(0);
  const rafId = useRef<number | null>(null);

  useEffect(() => {
    const target = containerRef?.current ?? window;

    const getScrollY = () =>
      target instanceof Window
        ? target.scrollY
        : (target as HTMLElement).scrollTop;

    const onScroll = () => {
      if (rafId.current !== null) return;
      rafId.current = requestAnimationFrame(() => {
        rafId.current = null;
        const y = getScrollY();
        const delta = y - lastY.current;

        setScrolled(y > threshold);

        if (Math.abs(delta) >= hysteresis) {
          setDirection(delta > 0 ? "down" : "up");
          lastY.current = y;
        }
      });
    };

    target.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      target.removeEventListener("scroll", onScroll);
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
    };
  }, [containerRef, threshold, hysteresis]);

  return { scrolled, direction } as const;
}
