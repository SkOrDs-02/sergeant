/**
 * useChartScrub — #1 interactive chart scrubbing
 *
 * Tracks the pointer/touch position over a SVG chart and computes the
 * nearest data-point index.  Supports:
 *  - Mouse (pointermove / pointerleave)
 *  - Touch (touchmove / touchend) for mobile PWA
 *  - Haptic feedback on index change (via useHaptic)
 *  - `prefers-reduced-motion` — disables the crosshair animation but
 *    still fires index changes so tooltips work
 *
 * Usage:
 *
 *   const svgRef = useRef<SVGSVGElement>(null);
 *   const { activeIndex, x, y, bind } = useChartScrub({
 *     svgRef,
 *     pointCount: data.length,
 *     xPositions,          // px x-coords of each data point in viewBox space
 *     viewBoxWidth: 320,
 *   });
 *
 * The returned `bind` object should be spread onto the `<svg>` element.
 * `activeIndex` is null when the pointer is outside the chart.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useHaptic } from "./useHaptic";
import { useReducedMotion } from "./useReducedMotion";

export interface UseChartScrubOptions {
  /** Ref to the <svg> element. */
  svgRef: RefObject<SVGSVGElement | null>;
  /** Total number of data points. */
  pointCount: number;
  /**
   * x-coordinate of each data point in SVG viewBox space (same units as
   * viewBox width).  Length must equal `pointCount`.
   */
  xPositions: number[];
  /** Width of the SVG viewBox. */
  viewBoxWidth: number;
  /** Called when the scrub index changes (including to null on leave). */
  onIndexChange?: (index: number | null) => void;
}

export interface UseChartScrubResult {
  /** Currently hovered data-point index, or null when outside the chart. */
  activeIndex: number | null;
  /** Crosshair x-position in viewBox units (undefined when not scrubbing). */
  scrubX: number | undefined;
  /** Crosshair y-position in viewBox units (undefined when not scrubbing). */
  scrubY: number | undefined;
  /**
   * Event-handler props to spread onto the SVG element.
   * `onPointerMove`, `onPointerLeave`, `onTouchMove`, `onTouchEnd`.
   */
  bind: {
    onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => void;
    onPointerLeave: () => void;
    onTouchMove: (e: React.TouchEvent<SVGSVGElement>) => void;
    onTouchEnd: () => void;
  };
}

export function useChartScrub({
  svgRef,
  pointCount,
  xPositions,
  viewBoxWidth,
  onIndexChange,
}: UseChartScrubOptions): UseChartScrubResult {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [scrubX, setScrubX] = useState<number | undefined>(undefined);

  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const prevIndexRef = useRef<number | null>(null);

  const resolveIndex = useCallback(
    (
      clientX: number,
      clientY: number,
    ): { idx: number; vx: number; vy: number } | null => {
      const svg = svgRef.current;
      if (!svg || pointCount === 0 || xPositions.length === 0) return null;

      const rect = svg.getBoundingClientRect();
      if (rect.width === 0) return null;

      // Map client coords → viewBox coords
      const vx = ((clientX - rect.left) / rect.width) * viewBoxWidth;
      const vy = (clientY - rect.top) / rect.height;

      // Find nearest point by x-distance
      let nearestIdx = 0;
      let nearestDist = Infinity;
      for (let i = 0; i < xPositions.length; i++) {
        const dist = Math.abs((xPositions[i] ?? 0) - vx);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestIdx = i;
        }
      }
      return { idx: nearestIdx, vx, vy };
    },
    [svgRef, pointCount, xPositions, viewBoxWidth],
  );

  const updateScrub = useCallback(
    (clientX: number, clientY: number) => {
      const result = resolveIndex(clientX, clientY);
      if (!result) return;
      const { idx, vx } = result;

      if (idx !== prevIndexRef.current) {
        prevIndexRef.current = idx;
        setActiveIndex(idx);
        setScrubX(xPositions[idx] ?? vx);
        onIndexChange?.(idx);
        // Haptic tick on each new point (selection-class, very subtle)
        haptic.tap();
      }
    },
    [resolveIndex, xPositions, onIndexChange, haptic],
  );

  const clearScrub = useCallback(() => {
    prevIndexRef.current = null;
    setActiveIndex(null);
    setScrubX(undefined);
    onIndexChange?.(null);
  }, [onIndexChange]);

  // Pointer handlers (mouse + stylus)
  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (e.pointerType === "touch") return; // handled by touch handlers
      updateScrub(e.clientX, e.clientY);
    },
    [updateScrub],
  );

  const onPointerLeave = useCallback(() => {
    clearScrub();
  }, [clearScrub]);

  // Touch handlers (mobile PWA)
  const onTouchMove = useCallback(
    (e: React.TouchEvent<SVGSVGElement>) => {
      const touch = e.touches[0];
      if (!touch) return;
      e.preventDefault(); // prevent page scroll while scrubbing
      updateScrub(touch.clientX, touch.clientY);
    },
    [updateScrub],
  );

  const onTouchEnd = useCallback(() => {
    clearScrub();
  }, [clearScrub]);

  // Clean up on unmount
  useEffect(
    () => () => {
      prevIndexRef.current = null;
    },
    [],
  );

  return {
    activeIndex,
    scrubX: reducedMotion ? undefined : scrubX,
    scrubY: undefined,
    bind: { onPointerMove, onPointerLeave, onTouchMove, onTouchEnd },
  };
}
