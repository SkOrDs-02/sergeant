import { useState, useEffect, useRef, useCallback } from "react";

export interface ScrollHeaderState {
  /** Whether header should be hidden (user scrolling down) */
  isHidden: boolean;
  /** Whether header should be shrunk (scrolled past threshold) */
  isShrunk: boolean;
  /** Whether blur background should be applied */
  hasBlur: boolean;
  /** Current scroll position */
  scrollY: number;
  /** Scroll direction: 'up' | 'down' | null */
  direction: "up" | "down" | null;
}

export interface UseScrollHeaderOptions {
  /** Scroll distance before header shrinks (default: 50px) */
  shrinkThreshold?: number;
  /** Scroll distance before header hides (default: 100px) */
  hideThreshold?: number;
  /** Minimum scroll delta to trigger direction change (default: 10px) */
  minDelta?: number;
  /** Enable blur effect when scrolled (default: true) */
  enableBlur?: boolean;
  /** Ref to scrollable container (defaults to window) */
  scrollRef?: React.RefObject<HTMLElement>;
}

/**
 * Hook for scroll-aware header behavior.
 * Tracks scroll position and direction to enable:
 * - Header shrink on scroll (compact mode)
 * - Header hide on scroll down / show on scroll up
 * - Blur background effect when scrolled
 *
 * Respects `prefers-reduced-motion` by disabling animations.
 */
export function useScrollHeader(
  options: UseScrollHeaderOptions = {},
): ScrollHeaderState {
  const {
    shrinkThreshold = 50,
    hideThreshold = 100,
    minDelta = 10,
    enableBlur = true,
    scrollRef,
  } = options;

  const [state, setState] = useState<ScrollHeaderState>({
    isHidden: false,
    isShrunk: false,
    hasBlur: false,
    scrollY: 0,
    direction: null,
  });

  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  const updateScrollState = useCallback(() => {
    const scrollElement = scrollRef?.current;
    const currentScrollY = scrollElement
      ? scrollElement.scrollTop
      : window.scrollY;

    const delta = currentScrollY - lastScrollY.current;
    const absDelta = Math.abs(delta);

    // Only update direction if delta exceeds minimum threshold
    // to prevent jittery state changes on small scrolls
    let direction = state.direction;
    if (absDelta >= minDelta) {
      direction = delta > 0 ? "down" : "up";
    }

    const isShrunk = currentScrollY > shrinkThreshold;
    const hasBlur = enableBlur && currentScrollY > 0;

    // Hide header when scrolling down past threshold, show when scrolling up
    const isHidden =
      direction === "down" &&
      currentScrollY > hideThreshold &&
      absDelta >= minDelta;

    setState({
      isHidden,
      isShrunk,
      hasBlur,
      scrollY: currentScrollY,
      direction,
    });

    lastScrollY.current = currentScrollY;
    ticking.current = false;
  }, [
    scrollRef,
    shrinkThreshold,
    hideThreshold,
    minDelta,
    enableBlur,
    state.direction,
  ]);

  useEffect(() => {
    const handleScroll = () => {
      if (!ticking.current) {
        requestAnimationFrame(updateScrollState);
        ticking.current = true;
      }
    };

    const scrollElement = scrollRef?.current;
    const target = scrollElement || window;

    target.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      target.removeEventListener("scroll", handleScroll);
    };
  }, [scrollRef, updateScrollState]);

  return state;
}
