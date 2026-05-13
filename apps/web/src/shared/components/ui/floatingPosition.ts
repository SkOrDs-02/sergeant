/**
 * Sergeant Design System — `floatingPosition`.
 *
 * Shared geometry helper for primitives that portal a floating panel
 * (Tooltip, Popover, …) to `document.body` so the panel escapes
 * transformed/overflow:hidden ancestors. Computes a `top` / `left`
 * pair (relative to the viewport — i.e. `position: fixed` coords) for
 * a given trigger element, a measured panel size, a placement, and a
 * pixel offset.
 *
 * Why inline-positioning (and not pure CSS like the historical
 * `placementClasses` map)? Once the panel is portaled to body, the
 * trigger is no longer an ancestor — `top-full left-0` would anchor
 * the panel to `<body>`'s top-left corner. The trigger's
 * `getBoundingClientRect()` is the only reliable source of truth
 * across transformed ancestors (see PR #2227 — the same reason
 * Modal portals to body).
 *
 * Algorithm:
 *   1. Resolve aliases (`top-center` → `top`, …) — kept for
 *      backward-compat with existing call-sites.
 *   2. Pick `top` / `left` from the trigger rect + panel rect using
 *      the placement axis (top / right / bottom / left) and the
 *      cross-axis alignment (start / center / end).
 *   3. Clamp to viewport with a small inset so the panel never
 *      bleeds off-screen on narrow viewports / orientation flips.
 *
 * This is intentionally tiny — heavy floating-ui or radix would add
 * ~12 kB gzip (per `@sergeant/web`'s `size-limit` 820 kB JS budget,
 * that's a 1.5 % chunk for two primitives). The collision-detection
 * we get for free from `clampToViewport` is enough for the in-app
 * use-cases (form-in-popover, info-card, menu, hover-tooltip).
 */

export type FloatingPlacement =
  | "top"
  | "top-start"
  | "top-end"
  | "bottom"
  | "bottom-start"
  | "bottom-end"
  | "left"
  | "left-start"
  | "left-end"
  | "right"
  | "right-start"
  | "right-end";

/**
 * Legacy/back-compat aliases tolerated by Tooltip call-sites
 * (`top-center`, `bottom-center`, …). The normalised result is
 * always one of the 12 canonical placements above.
 */
export type FloatingPlacementInput =
  | FloatingPlacement
  | "top-center"
  | "bottom-center"
  | "left-center"
  | "right-center";

export interface FloatingPositionRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface FloatingPositionResult {
  top: number;
  left: number;
  /** Final placement after alias normalisation — for callers that need it (arrows, etc.). */
  placement: FloatingPlacement;
}

const VIEWPORT_INSET = 8;

export function normalizePlacement(
  placement: FloatingPlacementInput,
): FloatingPlacement {
  switch (placement) {
    case "top-center":
      return "top";
    case "bottom-center":
      return "bottom";
    case "left-center":
      return "left";
    case "right-center":
      return "right";
    default:
      return placement;
  }
}

export function computeFloatingPosition(
  trigger: FloatingPositionRect,
  panel: { width: number; height: number },
  placement: FloatingPlacementInput,
  offset = 8,
  viewport: { width: number; height: number } = {
    width: typeof window !== "undefined" ? window.innerWidth : 0,
    height: typeof window !== "undefined" ? window.innerHeight : 0,
  },
): FloatingPositionResult {
  const p = normalizePlacement(placement);
  const { top: tT, left: tL, width: tW, height: tH } = trigger;
  const { width: pW, height: pH } = panel;

  let top = 0;
  let left = 0;

  // Main axis: which side of the trigger the panel sits on.
  if (p.startsWith("top")) {
    top = tT - pH - offset;
  } else if (p.startsWith("bottom")) {
    top = tT + tH + offset;
  } else if (p.startsWith("left")) {
    left = tL - pW - offset;
  } else {
    // right-*
    left = tL + tW + offset;
  }

  // Cross axis: alignment along the trigger edge.
  if (p === "top" || p === "bottom") {
    left = tL + tW / 2 - pW / 2;
  } else if (p === "top-start" || p === "bottom-start") {
    left = tL;
  } else if (p === "top-end" || p === "bottom-end") {
    left = tL + tW - pW;
  } else if (p === "left" || p === "right") {
    top = tT + tH / 2 - pH / 2;
  } else if (p === "left-start" || p === "right-start") {
    top = tT;
  } else if (p === "left-end" || p === "right-end") {
    top = tT + tH - pH;
  }

  // Clamp inside the viewport with a small inset so the panel
  // doesn't bleed off-screen on narrow viewports / iOS rotation.
  const maxLeft = Math.max(
    VIEWPORT_INSET,
    viewport.width - pW - VIEWPORT_INSET,
  );
  const maxTop = Math.max(
    VIEWPORT_INSET,
    viewport.height - pH - VIEWPORT_INSET,
  );
  left = Math.min(Math.max(VIEWPORT_INSET, left), maxLeft);
  top = Math.min(Math.max(VIEWPORT_INSET, top), maxTop);

  return { top, left, placement: p };
}
