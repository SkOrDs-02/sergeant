import { useCallback, useRef, useState } from "react";

/**
 * Sergeant Design System — useSwipeToDismiss
 *
 * Drag-to-dismiss for bottom sheets and side drawers. Mirrors iOS
 * Maps / Apple Pay sheet behaviour: pointer-down on the panel, drag
 * past `threshold` in the configured `direction`, release →
 * `onDismiss()`. Releasing before threshold snaps the panel back.
 *
 * The hook is **headless** — it returns:
 *   - `bind`: spread onto the panel element to capture pointer events.
 *   - `dragOffset`: signed offset along the drag axis (px) — host
 *     applies it via transform/opacity for the visual feedback.
 *   - `dragging`: whether the user is actively dragging.
 *
 * Why not `touchstart`/`touchmove`? Pointer Events unify mouse, touch,
 * and stylus, work in iOS Safari ≥ 13 (our floor), and let us call
 * `setPointerCapture` so the gesture keeps tracking even if the
 * pointer leaves the element bounds — important when a downward drag
 * escapes past the viewport bottom.
 *
 * Why per-direction? Bottom sheets only dismiss downward; right-side
 * drawers only dismiss rightward. We never accept multi-direction
 * dismiss because that fights with horizontal swipes used by other
 * UI (carousels, tab swipes in Finyk).
 */
export type SwipeDirection = "down" | "right";

export interface UseSwipeToDismissOptions {
  /** Pixels of drag along `direction` required to dismiss. Default 80px. */
  threshold?: number;
  /**
   * Multiplier applied to drag distance once it exceeds the threshold.
   * Lower than 1 means the panel "fights back" past the threshold —
   * matches iOS rubber-band feel. Default 1 (no resistance).
   */
  overshootResistance?: number;
  /**
   * Which axis & sign counts as "dismiss".
   *   - `"down"` (default): positive Y delta dismisses; negative is ignored.
   *   - `"right"`: positive X delta dismisses; negative is ignored.
   */
  direction?: SwipeDirection;
  /** Called when the user releases past `threshold`. */
  onDismiss: () => void;
  /** When false, the hook is inert (gesture is ignored). Default true. */
  enabled?: boolean;
}

export interface SwipeBind {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
}

export interface UseSwipeToDismissReturn {
  bind: SwipeBind;
  /** Signed drag offset along the configured axis (always ≥ 0). */
  dragOffset: number;
  dragging: boolean;
}

export function useSwipeToDismiss({
  threshold = 80,
  overshootResistance = 1,
  direction = "down",
  onDismiss,
  enabled = true,
}: UseSwipeToDismissOptions): UseSwipeToDismissReturn {
  const startXRef = useRef<number | null>(null);
  const startYRef = useRef<number | null>(null);
  // We capture the pointerId so subsequent move/up events from a
  // different finger/mouse don't poison the gesture.
  const pointerIdRef = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);

  const reset = useCallback(() => {
    startXRef.current = null;
    startYRef.current = null;
    pointerIdRef.current = null;
    setDragOffset(0);
    setDragging(false);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled) return;
      // Mouse: only primary button. Touch / pen: always allow.
      if (e.pointerType === "mouse" && e.button !== 0) return;
      startXRef.current = e.clientX;
      startYRef.current = e.clientY;
      pointerIdRef.current = e.pointerId;
      setDragging(true);
      // Pointer capture keeps subsequent move/up events targeted at
      // this element even if the pointer leaves the bounds — critical
      // for a drag that escapes past the viewport edge.
      try {
        (e.target as Element).setPointerCapture?.(e.pointerId);
      } catch {
        // Older browsers may throw if the target is detached; ignore.
      }
    },
    [enabled],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled) return;
      if (startXRef.current === null || startYRef.current === null) return;
      if (e.pointerId !== pointerIdRef.current) return;
      const delta =
        direction === "down"
          ? e.clientY - startYRef.current
          : e.clientX - startXRef.current;
      // Drags in the wrong direction are ignored (panel doesn't move).
      // Past the threshold we apply optional rubber-band resistance.
      if (delta <= 0) {
        setDragOffset(0);
        return;
      }
      if (delta <= threshold || overshootResistance === 1) {
        setDragOffset(delta);
      } else {
        const overshoot = delta - threshold;
        setDragOffset(threshold + overshoot * overshootResistance);
      }
    },
    [enabled, threshold, overshootResistance, direction],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled) {
        reset();
        return;
      }
      if (startXRef.current === null || startYRef.current === null) {
        reset();
        return;
      }
      if (e.pointerId !== pointerIdRef.current) return;
      const delta =
        direction === "down"
          ? e.clientY - startYRef.current
          : e.clientX - startXRef.current;
      if (delta >= threshold) {
        onDismiss();
      }
      // Snap back regardless — host will unmount on dismiss path.
      reset();
    },
    [enabled, threshold, direction, onDismiss, reset],
  );

  const onPointerCancel = useCallback(() => {
    reset();
  }, [reset]);

  return {
    bind: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
    dragOffset,
    dragging,
  };
}
