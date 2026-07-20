/**
 * Last validated: 2026-07-20
 * Status: Active
 */

import { describe, expect, it, vi } from "vitest";
import type { KeyboardEvent } from "react";
import { arrayMove, handleNativeSortableKeyDown } from "./nativeSortable";

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
