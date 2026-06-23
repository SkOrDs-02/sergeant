// @vitest-environment jsdom
/**
 * Tests for `useFocusTrap` — focus cycling + Escape handling for overlays.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { useFocusTrap } from "./useFocusTrap";

function Trap({
  enabled = true,
  onClose,
}: {
  enabled?: boolean;
  onClose?: () => void;
}) {
  const ref = useFocusTrap<HTMLDivElement>(enabled, onClose);
  return (
    <div ref={ref} data-testid="container">
      <button>first</button>
      <button>second</button>
      <button>last</button>
    </div>
  );
}

describe("useFocusTrap", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom requestAnimationFrame may be undefined; provide a deterministic one.
    vi.stubGlobal(
      "requestAnimationFrame",
      (cb: FrameRequestCallback): number => {
        cb(0);
        return 0;
      },
    );
    // offsetParent is null in jsdom by default → treat buttons as visible.
    Object.defineProperty(HTMLElement.prototype, "offsetParent", {
      configurable: true,
      get() {
        return document.body;
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("focuses the first focusable element on mount", () => {
    const { getByText } = render(<Trap />);
    expect(document.activeElement).toBe(getByText("first"));
  });

  it("calls onClose on Escape", () => {
    const onClose = vi.fn();
    render(<Trap onClose={onClose} />);
    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("wraps focus from last → first on Tab", () => {
    const { getByText } = render(<Trap />);
    const last = getByText("last");
    last.focus();
    act(() => {
      fireEvent.keyDown(document, { key: "Tab" });
    });
    expect(document.activeElement).toBe(getByText("first"));
  });

  it("wraps focus from first → last on Shift+Tab", () => {
    const { getByText } = render(<Trap />);
    const first = getByText("first");
    first.focus();
    act(() => {
      fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    });
    expect(document.activeElement).toBe(getByText("last"));
  });

  it("does nothing when disabled", () => {
    const onClose = vi.fn();
    const before = document.activeElement;
    render(<Trap enabled={false} onClose={onClose} />);
    expect(document.activeElement).toBe(before);
    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("restores focus to the previously focused element on unmount", () => {
    const outside = document.createElement("button");
    outside.textContent = "outside";
    document.body.appendChild(outside);
    outside.focus();
    expect(document.activeElement).toBe(outside);

    const { unmount } = render(<Trap />);
    // trap moved focus to "first"
    expect(document.activeElement).not.toBe(outside);
    unmount();
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});
