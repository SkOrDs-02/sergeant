/**
 * Sergeant Design System — `useFloatingPanelPosition`.
 *
 * Shared measure + scroll/resize reposition loop for portal-mounted
 * floating panels (Tooltip, Popover, DropdownMenu). Geometry itself
 * lives in `floatingPosition.ts`; this hook owns the React lifecycle:
 *
 *   1. `useLayoutEffect` — measure trigger + panel and set coords
 *      before paint (no one-frame flash at 0,0).
 *   2. `useEffect` — remeasure on capture-phase scroll + window resize
 *      so the panel tracks the trigger when the page reflows.
 *   3. Clear coords when `open` flips to false.
 *
 * Callers keep their own parking strategy for the first frame
 * (`top/left: -9999` vs `visibility: hidden`) and their own focus /
 * dismiss / a11y contracts — this hook intentionally does NOT unify
 * those policies.
 *
 * Status: Active.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  type RefObject,
} from "react";
import {
  computeFloatingPosition,
  type FloatingPlacementInput,
} from "./floatingPosition";

export interface FloatingPanelCoords {
  top: number;
  left: number;
  /** Trigger width at last measure — for `width: "trigger"` menus. */
  triggerWidth: number;
  triggerHeight: number;
}

export interface UseFloatingPanelPositionOptions {
  open: boolean;
  triggerRef: RefObject<HTMLElement | null>;
  panelRef: RefObject<HTMLElement | null>;
  placement: FloatingPlacementInput;
  /** Gap between trigger and panel in px. Default 8. */
  offset?: number;
  /**
   * Extra dependency that should force remeasure (content / header /
   * footer / width mode changes that alter panel size without
   * toggling `open`).
   */
  contentKey?: unknown;
}

export function useFloatingPanelPosition({
  open,
  triggerRef,
  panelRef,
  placement,
  offset = 8,
  contentKey,
}: UseFloatingPanelPositionOptions): FloatingPanelCoords | null {
  const [coords, setCoords] = useState<FloatingPanelCoords | null>(null);

  const measure = useCallback(() => {
    const trig = triggerRef.current;
    const panel = panelRef.current;
    if (!trig || !panel) return;
    const tRect = trig.getBoundingClientRect();
    // Prefer getBoundingClientRect; fall back to offset* when the
    // panel is visibility:hidden in some engines (DropdownMenu park).
    const pW = panel.getBoundingClientRect().width || panel.offsetWidth || 0;
    const pH = panel.getBoundingClientRect().height || panel.offsetHeight || 0;
    const pos = computeFloatingPosition(
      {
        top: tRect.top,
        left: tRect.left,
        width: tRect.width,
        height: tRect.height,
      },
      { width: pW, height: pH },
      placement,
      offset,
    );
    setCoords({
      top: pos.top,
      left: pos.left,
      triggerWidth: tRect.width,
      triggerHeight: tRect.height,
    });
  }, [triggerRef, panelRef, placement, offset]);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
  }, [open, measure, contentKey]);

  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      measure();
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, measure]);

  // Expose null while closed without setState-in-effect (react-hooks
  // v7). Stale coords stay in state until the next open measure.
  return open ? coords : null;
}
