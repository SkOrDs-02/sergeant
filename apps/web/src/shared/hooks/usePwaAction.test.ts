// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePwaAction } from "./usePwaAction";

describe("usePwaAction", () => {
  it("does nothing when action is null/undefined", () => {
    const handler = vi.fn();
    renderHook(() => usePwaAction(null, undefined, { foo: handler }));
    expect(handler).not.toHaveBeenCalled();
  });

  it("does nothing when action has no matching handler", () => {
    const handler = vi.fn();
    const onConsumed = vi.fn();
    renderHook(() =>
      usePwaAction("unknown_action", onConsumed, { foo: handler }),
    );
    expect(handler).not.toHaveBeenCalled();
    expect(onConsumed).not.toHaveBeenCalled();
  });

  it("invokes the matching handler and calls onConsumed", () => {
    const handler = vi.fn();
    const onConsumed = vi.fn();
    renderHook(() =>
      usePwaAction("start_workout", onConsumed, { start_workout: handler }),
    );
    expect(handler).toHaveBeenCalledTimes(1);
    expect(onConsumed).toHaveBeenCalledTimes(1);
  });

  it("runs the cleanup function returned by the handler on unmount", () => {
    const cleanup = vi.fn();
    const handler = vi.fn(() => cleanup);
    const { unmount } = renderHook(() =>
      usePwaAction("action", undefined, { action: handler }),
    );
    expect(cleanup).not.toHaveBeenCalled();
    unmount();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("always reads the latest handlers map even without a dep-array change", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ handlers }) => usePwaAction("action", undefined, handlers),
      { initialProps: { handlers: { action: first } } },
    );
    expect(first).toHaveBeenCalledTimes(1);

    // Re-render with the SAME action string but a fresh handlers object —
    // effect deps ([action, onConsumed]) don't change, but the ref should
    // still be updated to the new handler for the next actual trigger.
    rerender({ handlers: { action: second } });
    expect(second).not.toHaveBeenCalled(); // effect didn't re-run (same action)
  });

  it("re-runs when the action string changes", () => {
    const handlerA = vi.fn();
    const handlerB = vi.fn();
    const { rerender } = renderHook(
      ({ action }) =>
        usePwaAction(action, undefined, { a: handlerA, b: handlerB }),
      { initialProps: { action: "a" } },
    );
    expect(handlerA).toHaveBeenCalledTimes(1);
    rerender({ action: "b" });
    expect(handlerB).toHaveBeenCalledTimes(1);
  });
});
