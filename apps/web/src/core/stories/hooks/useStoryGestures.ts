import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  HOLD_THRESHOLD_MS,
  MAX_DRAG_TRANSLATE,
  SWIPE_CLOSE_THRESHOLD,
} from "../constants";
import type { TapZone } from "../types";

interface Options {
  // Target whose transform/opacity we animate during drag. Mutated
  // imperatively — using React state here would render 60× per second.
  targetRef: RefObject<HTMLElement | null>;
  // CSS selector for interactive chrome (close button, progress bars).
  // Pointer releases that originate on these elements suppress tap-nav.
  // Defaults to `[data-story-ui]` matching the existing markup contract.
  chromeSelector?: string;
  onTap: (zone: TapZone) => void;
  onHoldStart?: () => void;
  onHoldEnd?: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onSwipeDown?: () => void;
}

interface SurfaceProps {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void;
}

/**
 * Single unified pointer pipeline for tap / press-and-hold / swipe-down.
 *
 * Only one pointer is tracked at a time — a second finger mid-gesture is
 * ignored outright. Duplicate `pointerup` events (which iOS PWA + React's
 * root-level event delegation occasionally re-fire when setPointerCapture
 * is in use — see facebook/react#17685) are dropped by latching on the
 * opening `pointerId`.
 *
 * The hook converts raw pointer events into **semantic** callbacks so
 * autoplay/navigation/pause state can be tested independently without
 * knowing anything about PointerEvent internals.
 */
export function useStoryGestures({
  targetRef,
  chromeSelector = "[data-story-ui]",
  onTap,
  onHoldStart,
  onHoldEnd,
  onDragStart,
  onDragEnd,
  onSwipeDown,
}: Options): SurfaceProps {
  const activePointerIdRef = useRef<number | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const dragYRef = useRef(0);
  const draggingRef = useRef(false);
  const heldRef = useRef(false);

  const resetDragStyles = useCallback(() => {
    const el = targetRef.current;
    if (el) {
      el.style.transform = "";
      el.style.opacity = "";
    }
    dragYRef.current = 0;
    startRef.current = null;
  }, [targetRef]);

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current !== null) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  // Clean up on unmount — a long-press timer outliving its host would
  // eventually fire into stale callbacks.
  useEffect(() => {
    return () => {
      clearHoldTimer();
    };
  }, [clearHoldTimer]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (activePointerIdRef.current !== null) return;
      activePointerIdRef.current = e.pointerId;
      try {
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } catch {
        /* best-effort */
      }
      startRef.current = { x: e.clientX, y: e.clientY };
      dragYRef.current = 0;
      draggingRef.current = false;
      heldRef.current = false;
      holdTimerRef.current = setTimeout(() => {
        heldRef.current = true;
        holdTimerRef.current = null;
        onHoldStart?.();
      }, HOLD_THRESHOLD_MS);
    },
    [onHoldStart],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (activePointerIdRef.current !== e.pointerId) return;
      if (!startRef.current) return;
      const dy = e.clientY - startRef.current.y;
      if (dy <= 0) return;
      dragYRef.current = dy;
      // First frame of downward motion promotes to "drag" — also pauses
      // autoplay via onDragStart so progress doesn't tick under a finger
      // that's on the way to closing the overlay.
      if (!draggingRef.current && dy > 4) {
        draggingRef.current = true;
        onDragStart?.();
      }
      const el = targetRef.current;
      if (el) {
        el.style.transform = `translateY(${Math.min(dy, MAX_DRAG_TRANSLATE)}px)`;
        el.style.opacity = String(Math.max(0.4, 1 - dy / 400));
      }
    },
    [targetRef, onDragStart],
  );

  const endCommon = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    activePointerIdRef.current = null;
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      /* best-effort */
    }
  }, []);

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (activePointerIdRef.current !== e.pointerId) return;
      const wasHeld = heldRef.current;
      const wasDragging = draggingRef.current;
      const dy = dragYRef.current;
      clearHoldTimer();
      endCommon(e);

      // Swipe-down-to-close wins over everything. If the user dragged
      // past the threshold we don't care whether the press was long
      // enough to register as "hold" — the dominant intent is close.
      if (dy > SWIPE_CLOSE_THRESHOLD) {
        if (wasHeld) onHoldEnd?.();
        if (wasDragging) onDragEnd?.();
        resetDragStyles();
        onSwipeDown?.();
        heldRef.current = false;
        draggingRef.current = false;
        return;
      }

      // Finger lifted after a hold, but not past swipe threshold: the
      // user meant to pause-and-resume, not navigate. Releasing only
      // resumes autoplay; no tap zone dispatch.
      if (wasHeld || wasDragging) {
        if (wasHeld) onHoldEnd?.();
        if (wasDragging) onDragEnd?.();
        resetDragStyles();
        heldRef.current = false;
        draggingRef.current = false;
        return;
      }

      resetDragStyles();

      // Suppress tap-navigation if the press originated on interactive
      // chrome (close button, progress bar). We could rely on the
      // chrome stopping propagation itself, but double-guarding here
      // means new chrome elements just need the shared data attr.
      const target = e.target as Element | null;
      if (target?.closest?.(chromeSelector)) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      onTap(x < rect.width / 3 ? "prev" : "next");
    },
    [
      chromeSelector,
      clearHoldTimer,
      endCommon,
      onDragEnd,
      onHoldEnd,
      onSwipeDown,
      onTap,
      resetDragStyles,
    ],
  );

  const onPointerCancel = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (activePointerIdRef.current !== e.pointerId) return;
      const wasHeld = heldRef.current;
      const wasDragging = draggingRef.current;
      clearHoldTimer();
      endCommon(e);
      if (wasHeld) onHoldEnd?.();
      if (wasDragging) onDragEnd?.();
      resetDragStyles();
      heldRef.current = false;
      draggingRef.current = false;
    },
    [clearHoldTimer, endCommon, onDragEnd, onHoldEnd, resetDragStyles],
  );

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
