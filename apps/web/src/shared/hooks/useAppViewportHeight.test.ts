// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAppViewportHeight } from "./useAppViewportHeight";

type Listener = () => void;

function mockVisualViewport(height: number) {
  const listeners = new Set<Listener>();
  const vv = {
    height,
    addEventListener: vi.fn((_: string, cb: Listener) => listeners.add(cb)),
    removeEventListener: vi.fn((_: string, cb: Listener) => {
      listeners.delete(cb);
    }),
  };
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: vv,
  });
  return {
    vv,
    fire: () => listeners.forEach((cb) => cb()),
    setHeight: (h: number) => {
      vv.height = h;
    },
  };
}

afterEach(() => {
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: undefined,
  });
  document.documentElement.style.removeProperty("--app-dvh");
  document.body.innerHTML = "";
});

describe("useAppViewportHeight", () => {
  it("виставляє --app-dvh з visualViewport.height на маунті", () => {
    mockVisualViewport(700);
    renderHook(() => useAppViewportHeight());
    expect(document.documentElement.style.getPropertyValue("--app-dvh")).toBe(
      "700px",
    );
  });

  it("оновлює --app-dvh на resize", () => {
    const m = mockVisualViewport(700);
    renderHook(() => useAppViewportHeight());
    m.setHeight(812);
    m.fire();
    expect(document.documentElement.style.getPropertyValue("--app-dvh")).toBe(
      "812px",
    );
  });

  it("ігнорує resize, поки сфокусований editable (клавіатура)", () => {
    const m = mockVisualViewport(812);
    renderHook(() => useAppViewportHeight());
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    m.setHeight(500);
    m.fire();
    expect(document.documentElement.style.getPropertyValue("--app-dvh")).toBe(
      "812px",
    );
  });

  it("прибирає слухач і змінну на анмаунті", () => {
    const m = mockVisualViewport(700);
    const { unmount } = renderHook(() => useAppViewportHeight());
    unmount();
    expect(m.vv.removeEventListener).toHaveBeenCalled();
    expect(document.documentElement.style.getPropertyValue("--app-dvh")).toBe(
      "",
    );
  });

  it("no-op без visualViewport (jsdom/старі браузери)", () => {
    expect(() => renderHook(() => useAppViewportHeight())).not.toThrow();
    expect(document.documentElement.style.getPropertyValue("--app-dvh")).toBe(
      "",
    );
  });

  it("re-syncs after a route key changes without clearing the old value", () => {
    const m = mockVisualViewport(700);
    const { rerender } = renderHook(
      ({ routeKey }) => useAppViewportHeight(routeKey),
      { initialProps: { routeKey: "welcome" } },
    );
    m.setHeight(812);
    rerender({ routeKey: "sign-in" });
    expect(document.documentElement.style.getPropertyValue("--app-dvh")).toBe(
      "812px",
    );
  });
});
