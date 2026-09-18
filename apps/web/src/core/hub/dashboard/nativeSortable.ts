/**
 * Last validated: 2026-07-20
 * Status: Active
 *
 * Native pointer + keyboard reorder for Hub module bento cards.
 * Replaces `@dnd-kit/*` (S10-T2 bundle cut) while keeping:
 * - grip-handle activation in edit mode (no accidental scroll-hijack)
 * - 250ms touch long-press before drag starts
 * - keyboard Arrow* reorder when the grip is focused
 * - screen-reader announcements via caller-provided callbacks
 */

import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";

export function arrayMove<T>(
  items: readonly T[],
  from: number,
  to: number,
): T[] {
  if (from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return [...items];
  }
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return [...items];
  next.splice(to, 0, moved);
  return next;
}

export type NativeDragPayload = {
  activeId: string;
  overId: string | null;
};

export type NativeSortableHandlers = {
  onDragStart: (payload: { activeId: string }) => void;
  onDragEnd: (payload: NativeDragPayload) => void;
};

const TOUCH_DELAY_MS = 250;
const TOUCH_TOLERANCE_PX = 5;
const MOUSE_DISTANCE_PX = 8;

/**
 * Attach pointer-based drag to a grip handle (or other activator).
 * Call from `onPointerDown` on the activator element.
 */
export function beginNativeSortablePointerDrag(options: {
  event: ReactPointerEvent;
  activeId: string;
  getOrder: () => readonly string[];
  handlers: NativeSortableHandlers;
  /** Called while dragging so the card can show opacity / drop target. */
  onDraggingChange?: (dragging: boolean) => void;
  onOverIdChange?: (overId: string | null) => void;
}): void {
  const {
    event,
    activeId,
    getOrder,
    handlers,
    onDraggingChange,
    onOverIdChange,
  } = options;

  // Only primary button / touch.
  if (event.button !== 0 && event.pointerType === "mouse") return;

  const activator = event.currentTarget as HTMLElement;
  const startX = event.clientX;
  const startY = event.clientY;
  const isTouch = event.pointerType === "touch";
  let activated = false;
  let overId: string | null = null;
  let delayTimer: ReturnType<typeof setTimeout> | null = null;
  const pointerId = event.pointerId;

  const cleanup = () => {
    if (delayTimer) clearTimeout(delayTimer);
    delayTimer = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    try {
      activator.releasePointerCapture(pointerId);
    } catch {
      // already released
    }
    onDraggingChange?.(false);
    onOverIdChange?.(null);
  };

  const activate = () => {
    if (activated) return;
    activated = true;
    handlers.onDragStart({ activeId });
    onDraggingChange?.(true);
    try {
      activator.setPointerCapture(pointerId);
    } catch {
      // ignore
    }
  };

  const hitTestOverId = (clientX: number, clientY: number): string | null => {
    const el = document.elementFromPoint(clientX, clientY);
    const card = el?.closest?.("[data-sortable-id]") as HTMLElement | null;
    const id = card?.dataset["sortableId"];
    if (!id || id === activeId) return null;
    const order = getOrder();
    return order.includes(id) ? id : null;
  };

  const onMove = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const dist = Math.hypot(dx, dy);

    if (!activated) {
      if (isTouch) {
        if (dist > TOUCH_TOLERANCE_PX && delayTimer) {
          clearTimeout(delayTimer);
          delayTimer = null;
          cleanup();
        }
        return;
      }
      if (dist >= MOUSE_DISTANCE_PX) activate();
      else return;
    }

    e.preventDefault();
    const nextOver = hitTestOverId(e.clientX, e.clientY);
    if (nextOver !== overId) {
      overId = nextOver;
      onOverIdChange?.(overId);
    }
  };

  const onUp = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    if (activated) {
      handlers.onDragEnd({ activeId, overId });
    }
    cleanup();
  };

  window.addEventListener("pointermove", onMove, { passive: false });
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);

  if (isTouch) {
    delayTimer = setTimeout(() => {
      delayTimer = null;
      activate();
    }, TOUCH_DELAY_MS);
  }
}

/**
 * Keyboard reorder when the grip handle is focused.
 * Arrow keys move within the current visual order; Home/End jump.
 */
export function handleNativeSortableKeyDown(options: {
  event: ReactKeyboardEvent;
  activeId: string;
  order: readonly string[];
  columns: number;
  handlers: NativeSortableHandlers;
}): void {
  const { event, activeId, order, columns, handlers } = options;
  const index = order.indexOf(activeId);
  if (index < 0) return;

  let target = index;
  switch (event.key) {
    case "ArrowLeft":
      target = index - 1;
      break;
    case "ArrowRight":
      target = index + 1;
      break;
    case "ArrowUp":
      target = index - columns;
      break;
    case "ArrowDown":
      target = index + columns;
      break;
    case "Home":
      target = 0;
      break;
    case "End":
      target = order.length - 1;
      break;
    default:
      return;
  }

  if (target < 0 || target >= order.length || target === index) return;
  event.preventDefault();
  const overId = order[target];
  if (!overId) return;
  handlers.onDragStart({ activeId });
  handlers.onDragEnd({ activeId, overId });
}
