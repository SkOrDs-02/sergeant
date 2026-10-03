// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useBodyScrollLock } from "./useBodyScrollLock";

describe("useBodyScrollLock", () => {
  afterEach(() => {
    document.body.style.overflow = "";
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.width = "";
  });

  it("locks body overflow on mount and restores on unmount", () => {
    document.body.style.overflow = "auto";
    const { unmount } = renderHook(() => useBodyScrollLock());
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("pins body to fixed position at the current scroll offset (iOS rubber-band fix)", () => {
    Object.defineProperty(window, "scrollY", {
      value: 240,
      configurable: true,
    });
    const { unmount } = renderHook(() => useBodyScrollLock());
    expect(document.body.style.position).toBe("fixed");
    expect(document.body.style.top).toBe("-240px");
    expect(document.body.style.width).toBe("100%");
    unmount();
    expect(document.body.style.position).toBe("");
    expect(document.body.style.top).toBe("");
    expect(document.body.style.width).toBe("");
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  });

  it("is refcounted: nested overlays share the lock, last unmount restores", () => {
    document.body.style.overflow = "scroll";
    const a = renderHook(() => useBodyScrollLock());
    const b = renderHook(() => useBodyScrollLock());
    expect(document.body.style.overflow).toBe("hidden");
    a.unmount();
    expect(document.body.style.overflow).toBe("hidden");
    b.unmount();
    expect(document.body.style.overflow).toBe("scroll");
  });

  it("no-op when active=false", () => {
    document.body.style.overflow = "visible";
    const { unmount } = renderHook(() => useBodyScrollLock(false));
    expect(document.body.style.overflow).toBe("visible");
    unmount();
    expect(document.body.style.overflow).toBe("visible");
  });

  it("corrects window.scrollY back to the pinned offset on focusin while locked (iOS keyboard auto-scroll)", () => {
    Object.defineProperty(window, "scrollY", {
      value: 240,
      configurable: true,
    });
    const scrollToSpy = vi
      .spyOn(window, "scrollTo")
      .mockImplementation(() => {});
    const { unmount } = renderHook(() => useBodyScrollLock());

    // iOS drifts the document scroll while auto-scrolling a focused
    // input above the keyboard — simulate that drift, then the focus
    // event that should trigger the correction.
    Object.defineProperty(window, "scrollY", {
      value: 300,
      configurable: true,
    });
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

    expect(scrollToSpy).toHaveBeenCalledWith(0, 240);

    document.body.removeChild(input);
    unmount();
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  });
});
