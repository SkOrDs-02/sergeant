// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSwipeToDismiss } from "./useSwipeToDismiss";

// Minimal pointer event mock — Pointer Events aren't constructible
// in jsdom out of the box, but the hook only reads `pointerId`,
// `pointerType`, `clientX`, `clientY`, `button`, and `target`.
function makePointer(
  overrides: Partial<{
    clientX: number;
    clientY: number;
    pointerId: number;
    pointerType: string;
    button: number;
    target: HTMLElement;
  }>,
): React.PointerEvent {
  const target =
    overrides.target ??
    Object.assign(document.createElement("div"), {
      setPointerCapture: vi.fn(),
    });
  return {
    clientX: overrides.clientX ?? 0,
    clientY: overrides.clientY ?? 0,
    pointerId: overrides.pointerId ?? 1,
    pointerType: overrides.pointerType ?? "touch",
    button: overrides.button ?? 0,
    target,
  } as unknown as React.PointerEvent;
}

describe("useSwipeToDismiss", () => {
  it("calls onDismiss when downward drag exceeds threshold", () => {
    const onDismiss = vi.fn();
    const { result } = renderHook(() =>
      useSwipeToDismiss({ threshold: 80, onDismiss }),
    );

    act(() => {
      result.current.bind.onPointerDown(makePointer({ clientY: 100 }));
    });
    act(() => {
      result.current.bind.onPointerMove(makePointer({ clientY: 200 }));
    });
    expect(result.current.dragOffset).toBe(100);
    act(() => {
      result.current.bind.onPointerUp(makePointer({ clientY: 200 }));
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(result.current.dragging).toBe(false);
  });

  it("snaps back when drag is below threshold", () => {
    const onDismiss = vi.fn();
    const { result } = renderHook(() =>
      useSwipeToDismiss({ threshold: 80, onDismiss }),
    );

    act(() => {
      result.current.bind.onPointerDown(makePointer({ clientY: 100 }));
      result.current.bind.onPointerMove(makePointer({ clientY: 140 }));
      result.current.bind.onPointerUp(makePointer({ clientY: 140 }));
    });

    expect(onDismiss).not.toHaveBeenCalled();
    expect(result.current.dragOffset).toBe(0);
  });

  it("ignores upward drags for direction=down", () => {
    const onDismiss = vi.fn();
    const { result } = renderHook(() =>
      useSwipeToDismiss({ threshold: 80, onDismiss }),
    );

    act(() => {
      result.current.bind.onPointerDown(makePointer({ clientY: 200 }));
      result.current.bind.onPointerMove(makePointer({ clientY: 50 }));
    });
    expect(result.current.dragOffset).toBe(0);
  });

  it("dismisses on rightward drag for direction=right", () => {
    const onDismiss = vi.fn();
    const { result } = renderHook(() =>
      useSwipeToDismiss({ threshold: 80, direction: "right", onDismiss }),
    );

    act(() => {
      result.current.bind.onPointerDown(makePointer({ clientX: 0 }));
      result.current.bind.onPointerMove(makePointer({ clientX: 120 }));
      result.current.bind.onPointerUp(makePointer({ clientX: 120 }));
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("is inert when enabled=false", () => {
    const onDismiss = vi.fn();
    const { result } = renderHook(() =>
      useSwipeToDismiss({ threshold: 80, onDismiss, enabled: false }),
    );

    act(() => {
      result.current.bind.onPointerDown(makePointer({ clientY: 100 }));
      result.current.bind.onPointerMove(makePointer({ clientY: 300 }));
      result.current.bind.onPointerUp(makePointer({ clientY: 300 }));
    });

    expect(onDismiss).not.toHaveBeenCalled();
    expect(result.current.dragOffset).toBe(0);
  });

  it("ignores secondary mouse buttons", () => {
    const onDismiss = vi.fn();
    const { result } = renderHook(() =>
      useSwipeToDismiss({ threshold: 80, onDismiss }),
    );

    act(() => {
      result.current.bind.onPointerDown(
        makePointer({ clientY: 0, pointerType: "mouse", button: 2 }),
      );
      result.current.bind.onPointerMove(makePointer({ clientY: 200 }));
      result.current.bind.onPointerUp(makePointer({ clientY: 200 }));
    });

    expect(onDismiss).not.toHaveBeenCalled();
  });
});
