// @vitest-environment jsdom
/**
 * Last validated: 2026-07-20
 * Status: Active
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import {
  arrayMove,
  beginNativeSortablePointerDrag,
  handleNativeSortableKeyDown,
} from "./nativeSortable";

describe("arrayMove", () => {
  it("moves an item forward", () => {
    expect(arrayMove(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
  });

  it("moves an item backward", () => {
    expect(arrayMove(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });

  it("returns a copy for out-of-range indexes", () => {
    expect(arrayMove(["a", "b"], -1, 0)).toEqual(["a", "b"]);
  });
});

describe("handleNativeSortableKeyDown", () => {
  it("reorders on ArrowRight", () => {
    const onDragStart = vi.fn();
    const onDragEnd = vi.fn();
    const event = {
      key: "ArrowRight",
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;
    handleNativeSortableKeyDown({
      event,
      activeId: "a",
      order: ["a", "b", "c"],
      columns: 2,
      handlers: { onDragStart, onDragEnd },
    });
    expect(event.preventDefault).toHaveBeenCalled();
    expect(onDragStart).toHaveBeenCalledWith({ activeId: "a" });
    expect(onDragEnd).toHaveBeenCalledWith({ activeId: "a", overId: "b" });
  });
});

function pointerEvent(
  type: "pointermove" | "pointerup" | "pointercancel",
  init: { pointerId: number; clientX?: number; clientY?: number },
): PointerEvent {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: init.pointerId },
    clientX: { value: init.clientX ?? 0 },
    clientY: { value: init.clientY ?? 0 },
  });
  event.preventDefault = vi.fn();
  return event as PointerEvent;
}

function reactPointerDown(
  overrides: Partial<{
    button: number;
    pointerType: string;
    clientX: number;
    clientY: number;
    pointerId: number;
    currentTarget: HTMLElement;
  }> = {},
): ReactPointerEvent {
  const currentTarget =
    overrides.currentTarget ?? document.createElement("button");
  currentTarget.setPointerCapture = vi.fn();
  currentTarget.releasePointerCapture = vi.fn();
  return {
    button: overrides.button ?? 0,
    pointerType: overrides.pointerType ?? "mouse",
    clientX: overrides.clientX ?? 0,
    clientY: overrides.clientY ?? 0,
    pointerId: overrides.pointerId ?? 1,
    currentTarget,
  } as unknown as ReactPointerEvent;
}

describe("beginNativeSortablePointerDrag", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("activates mouse drag after distance threshold and reports the hovered card", () => {
    const over = document.createElement("div");
    over.dataset["sortableId"] = "b";
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => over),
    });
    const handlers = { onDragStart: vi.fn(), onDragEnd: vi.fn() };
    const onDraggingChange = vi.fn();
    const onOverIdChange = vi.fn();

    beginNativeSortablePointerDrag({
      event: reactPointerDown(),
      activeId: "a",
      getOrder: () => ["a", "b", "c"],
      handlers,
      onDraggingChange,
      onOverIdChange,
    });

    window.dispatchEvent(
      pointerEvent("pointermove", { pointerId: 1, clientX: 9 }),
    );
    window.dispatchEvent(
      pointerEvent("pointerup", { pointerId: 1, clientX: 9 }),
    );

    expect(handlers.onDragStart).toHaveBeenCalledWith({ activeId: "a" });
    expect(onDraggingChange).toHaveBeenCalledWith(true);
    expect(onOverIdChange).toHaveBeenCalledWith("b");
    expect(handlers.onDragEnd).toHaveBeenCalledWith({
      activeId: "a",
      overId: "b",
    });
    expect(onDraggingChange).toHaveBeenLastCalledWith(false);
  });

  it("ignores non-primary mouse buttons", () => {
    const handlers = { onDragStart: vi.fn(), onDragEnd: vi.fn() };
    beginNativeSortablePointerDrag({
      event: reactPointerDown({ button: 1 }),
      activeId: "a",
      getOrder: () => ["a", "b"],
      handlers,
    });

    window.dispatchEvent(
      pointerEvent("pointermove", { pointerId: 1, clientX: 20 }),
    );
    window.dispatchEvent(
      pointerEvent("pointerup", { pointerId: 1, clientX: 20 }),
    );

    expect(handlers.onDragStart).not.toHaveBeenCalled();
    expect(handlers.onDragEnd).not.toHaveBeenCalled();
  });

  it("activates touch after long-press delay and cancels when the finger drifts first", () => {
    vi.useFakeTimers();
    const handlers = { onDragStart: vi.fn(), onDragEnd: vi.fn() };
    const cancelledHandlers = { onDragStart: vi.fn(), onDragEnd: vi.fn() };

    beginNativeSortablePointerDrag({
      event: reactPointerDown({ pointerType: "touch", pointerId: 2 }),
      activeId: "a",
      getOrder: () => ["a", "b"],
      handlers,
    });
    vi.advanceTimersByTime(250);
    window.dispatchEvent(pointerEvent("pointerup", { pointerId: 2 }));

    beginNativeSortablePointerDrag({
      event: reactPointerDown({ pointerType: "touch", pointerId: 3 }),
      activeId: "a",
      getOrder: () => ["a", "b"],
      handlers: cancelledHandlers,
    });
    window.dispatchEvent(
      pointerEvent("pointermove", { pointerId: 3, clientX: 6 }),
    );
    vi.advanceTimersByTime(250);

    expect(handlers.onDragStart).toHaveBeenCalledWith({ activeId: "a" });
    expect(handlers.onDragEnd).toHaveBeenCalledWith({
      activeId: "a",
      overId: null,
    });
    expect(cancelledHandlers.onDragStart).not.toHaveBeenCalled();
    expect(cancelledHandlers.onDragEnd).not.toHaveBeenCalled();
  });
});
