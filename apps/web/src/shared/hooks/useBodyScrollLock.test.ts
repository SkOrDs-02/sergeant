// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useBodyScrollLock } from "./useBodyScrollLock";

describe("useBodyScrollLock", () => {
  afterEach(() => {
    document.body.style.overflow = "";
  });

  it("locks body overflow on mount and restores on unmount", () => {
    document.body.style.overflow = "auto";
    const { unmount } = renderHook(() => useBodyScrollLock());
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("auto");
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
});
