// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useStoriesKeyboard } from "../hooks/useStoriesKeyboard";

function dispatch(key: string, target: EventTarget = window) {
  const e = new KeyboardEvent("keydown", { key, bubbles: true });
  target.dispatchEvent(e);
}

describe("useStoriesKeyboard", () => {
  it("ArrowRight calls onNext, ArrowLeft calls onPrev", () => {
    const onNext = vi.fn();
    const onPrev = vi.fn();
    renderHook(() =>
      useStoriesKeyboard({
        onNext,
        onPrev,
        onClose: () => {},
        onToggleExplicitPause: () => {},
      }),
    );
    act(() => dispatch("ArrowRight"));
    act(() => dispatch("ArrowLeft"));
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it("Escape calls onClose", () => {
    const onClose = vi.fn();
    renderHook(() =>
      useStoriesKeyboard({
        onNext: () => {},
        onPrev: () => {},
        onClose,
        onToggleExplicitPause: () => {},
      }),
    );
    act(() => dispatch("Escape"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Space toggles explicit pause and preventDefaults", () => {
    const onToggleExplicitPause = vi.fn();
    renderHook(() =>
      useStoriesKeyboard({
        onNext: () => {},
        onPrev: () => {},
        onClose: () => {},
        onToggleExplicitPause,
      }),
    );
    const e = new KeyboardEvent("keydown", {
      key: " ",
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      window.dispatchEvent(e);
    });
    expect(onToggleExplicitPause).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);
  });

  it("ignores keys when focus is on an interactive element", () => {
    const onToggleExplicitPause = vi.fn();
    const onClose = vi.fn();
    renderHook(() =>
      useStoriesKeyboard({
        onNext: () => {},
        onPrev: () => {},
        onClose,
        onToggleExplicitPause,
      }),
    );
    const button = document.createElement("button");
    document.body.appendChild(button);
    act(() => dispatch(" ", button));
    act(() => dispatch("Escape", button));
    expect(onToggleExplicitPause).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    button.remove();
  });

  it("unmount removes the listener", () => {
    const onNext = vi.fn();
    const { unmount } = renderHook(() =>
      useStoriesKeyboard({
        onNext,
        onPrev: () => {},
        onClose: () => {},
        onToggleExplicitPause: () => {},
      }),
    );
    unmount();
    act(() => dispatch("ArrowRight"));
    expect(onNext).not.toHaveBeenCalled();
  });
});
