import { useCallback, useState } from "react";
import type { PauseReason } from "../types";

interface Api {
  reason: PauseReason | null;
  isPaused: boolean;
  setHold: (held: boolean) => void;
  setDragging: (dragging: boolean) => void;
  toggleExplicit: () => void;
  clearExplicit: () => void;
}

/**
 * Reason-tagged pause state. `paused: boolean` alone couldn't distinguish
 * "user is holding a finger down" from "user pressed Space to pause", so a
 * stray `pointercancel` would unintentionally resume a deliberate pause.
 *
 * Priority (when multiple reasons are active simultaneously, the highest
 * in the list wins for display purposes; any non-null `reason` halts
 * autoplay):
 *   drag  →  hold  →  explicit
 *
 * Hold and drag are transient gestures; explicit is only toggled by
 * keyboard Space and is never cleared by gesture handlers.
 */
export function useStoriesPause(): Api {
  const [hold, setHoldState] = useState(false);
  const [dragging, setDraggingState] = useState(false);
  const [explicit, setExplicit] = useState(false);

  const setHold = useCallback((held: boolean) => setHoldState(held), []);
  const setDragging = useCallback((d: boolean) => setDraggingState(d), []);
  const toggleExplicit = useCallback(() => setExplicit((e) => !e), []);
  const clearExplicit = useCallback(() => setExplicit(false), []);

  const reason: PauseReason | null = dragging
    ? "drag"
    : hold
      ? "hold"
      : explicit
        ? "explicit"
        : null;

  return {
    reason,
    isPaused: reason !== null,
    setHold,
    setDragging,
    toggleExplicit,
    clearExplicit,
  };
}
