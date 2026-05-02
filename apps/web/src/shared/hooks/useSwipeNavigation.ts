import { useCallback, useRef, useState } from "react";

/**
 * useSwipeNavigation
 *
 * Shared horizontal-swipe gesture for module shells (Фінік / Фізрук /
 * Рутина / Харчування). Replaces the bespoke implementation that lived
 * inside FinykApp.tsx so all module shells get the same feel:
 *
 *  - swipe left  →  next tab
 *  - swipe right →  previous tab
 *  - vertical scrolls inside nested lists never tug the page sideways
 *  - horizontal scrollers (filter strips, carousels) opt out via
 *    `data-no-swipe` (or any ancestor with overflow-x:auto/scroll)
 *  - live drag offset is exposed via `dragDx` so the caller can
 *    translate the page wrapper for visual feedback
 *
 * The hook is touch-only (the existing Finyk gesture was touch-only too);
 * pointer events fire on every device including desktop mice and would
 * conflict with text selection. If a future caller needs pen/mouse swipes
 * we can add a flag.
 */
export interface UseSwipeNavigationOptions {
  /** Called when a left swipe (→ next) crosses the threshold. */
  onSwipeLeft: () => void;
  /** Called when a right swipe (→ previous) crosses the threshold. */
  onSwipeRight: () => void;
  /** Minimum horizontal distance (px) before a swipe commits. Default: 60. */
  threshold?: number;
  /** Live drag is clamped to ±this many px so a fast flick can't drag the
   *  page off-screen. Default: 120. */
  dragLimit?: number;
  /**
   * Disable the gesture entirely (e.g. when a modal/sheet is open or
   * while reduced-motion users opt out elsewhere). When `false` the
   * returned handlers become no-ops.
   */
  enabled?: boolean;
  /**
   * If true, the swipe at the leftmost position (rightward swipe) or
   * rightmost position (leftward swipe) is suppressed — i.e. no fake
   * drag at the ends of the tab list.
   */
  atStart?: boolean;
  /** Mirror of `atStart` for the trailing edge. */
  atEnd?: boolean;
}

export interface UseSwipeNavigationResult {
  /** Wire onto the swipeable region. */
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  /** Live horizontal drag offset in px (signed: + → right, − → left). */
  dragDx: number;
  /** True while the user is mid-gesture. Useful to pause transitions. */
  isDragging: boolean;
}

/**
 * Walk up from the touch target and bail out if any ancestor is
 * horizontally scrollable. Otherwise scrolling such a list would also
 * be interpreted as a tab swipe. Marker `[data-no-swipe]` short-circuits
 * the traversal for explicitly tagged scrollers.
 */
function isInsideHorizontalScroller(target: EventTarget | null): boolean {
  const el = target instanceof HTMLElement ? target : null;
  if (!el) return false;
  if (el.closest("[data-no-swipe]")) return true;
  let node: HTMLElement | null = el;
  while (node && node !== document.body) {
    if (node.scrollWidth > node.clientWidth) {
      const overflowX = window.getComputedStyle(node).overflowX;
      if (overflowX === "auto" || overflowX === "scroll") return true;
    }
    node = node.parentElement;
  }
  return false;
}

export function useSwipeNavigation({
  onSwipeLeft,
  onSwipeRight,
  threshold = 60,
  dragLimit = 120,
  enabled = true,
  atStart = false,
  atEnd = false,
}: UseSwipeNavigationOptions): UseSwipeNavigationResult {
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const activeRef = useRef(false);
  const [dragDx, setDragDx] = useState(0);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled) return;
      if (isInsideHorizontalScroller(e.target)) {
        startX.current = null;
        startY.current = null;
        return;
      }
      const t = e.touches[0];
      if (!t) return;
      startX.current = t.clientX;
      startY.current = t.clientY;
      activeRef.current = false;
      setDragDx(0);
    },
    [enabled],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled) return;
      if (startX.current === null || startY.current === null) return;
      const t = e.touches[0];
      if (!t) return;
      const rawDx = t.clientX - startX.current;
      const rawDy = t.clientY - startY.current;
      // Stay quiet until the gesture is unambiguously horizontal so
      // vertical scrolls inside nested lists never start tugging the
      // page sideways.
      if (Math.abs(rawDx) < 12) return;
      if (Math.abs(rawDx) < Math.abs(rawDy) * 1.5) return;
      activeRef.current = true;
      // Cancel feedback at the ends of the tab list so the user
      // doesn't get a "fake" drag that goes nowhere.
      if (atStart && rawDx > 0) {
        setDragDx(0);
        return;
      }
      if (atEnd && rawDx < 0) {
        setDragDx(0);
        return;
      }
      const clamped = Math.max(-dragLimit, Math.min(dragLimit, rawDx));
      setDragDx(clamped);
    },
    [enabled, dragLimit, atStart, atEnd],
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled) return;
      if (startX.current === null || startY.current === null) {
        setDragDx(0);
        return;
      }
      const t = e.changedTouches[0];
      const dx = t ? startX.current - t.clientX : 0;
      const dy = t ? startY.current - t.clientY : 0;
      startX.current = null;
      startY.current = null;
      activeRef.current = false;
      setDragDx(0);

      // Require a clearly horizontal swipe so vertical scrolls in
      // nested lists never trigger tab switches.
      if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.5) {
        return;
      }
      if (dx > 0) {
        onSwipeLeft();
      } else {
        onSwipeRight();
      }
    },
    [enabled, threshold, onSwipeLeft, onSwipeRight],
  );

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    dragDx,
    isDragging: activeRef.current,
  };
}
