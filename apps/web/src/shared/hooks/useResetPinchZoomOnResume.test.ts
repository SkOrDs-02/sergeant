// @vitest-environment jsdom
/**
 * `useResetPinchZoomOnResume` — recovers from iOS Safari leaving the page
 * pinch-zoomed after the native camera sheet (triggered by a photo picker
 * like `PhotoAnalyzeCard`) closes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useResetPinchZoomOnResume } from "./useResetPinchZoomOnResume";

function setViewportMeta(content: string): HTMLMetaElement {
  document
    .querySelectorAll('meta[name="viewport"]')
    .forEach((el) => el.remove());
  const meta = document.createElement("meta");
  meta.setAttribute("name", "viewport");
  meta.setAttribute("content", content);
  document.head.appendChild(meta);
  return meta;
}

describe("useResetPinchZoomOnResume", () => {
  const ORIGINAL_CONTENT = "width=device-width, initial-scale=1.0";

  beforeEach(() => {
    vi.useFakeTimers();
    setViewportMeta(ORIGINAL_CONTENT);
  });

  afterEach(() => {
    vi.useRealTimers();
    document
      .querySelectorAll('meta[name="viewport"]')
      .forEach((el) => el.remove());
  });

  it("toggles maximum-scale=1 then restores the original content on visibilitychange → visible", () => {
    renderHook(() => useResetPinchZoomOnResume());
    const meta = document.querySelector<HTMLMetaElement>(
      'meta[name="viewport"]',
    )!;

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(meta.getAttribute("content")).toBe(
      `${ORIGINAL_CONTENT}, maximum-scale=1`,
    );

    vi.advanceTimersByTime(50);
    expect(meta.getAttribute("content")).toBe(ORIGINAL_CONTENT);
  });

  it("does nothing on visibilitychange → hidden", () => {
    renderHook(() => useResetPinchZoomOnResume());
    const meta = document.querySelector<HTMLMetaElement>(
      'meta[name="viewport"]',
    )!;

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(meta.getAttribute("content")).toBe(ORIGINAL_CONTENT);
  });

  it("resets on pageshow regardless of visibilityState", () => {
    renderHook(() => useResetPinchZoomOnResume());
    const meta = document.querySelector<HTMLMetaElement>(
      'meta[name="viewport"]',
    )!;

    window.dispatchEvent(new Event("pageshow"));

    expect(meta.getAttribute("content")).toBe(
      `${ORIGINAL_CONTENT}, maximum-scale=1`,
    );
    vi.advanceTimersByTime(50);
    expect(meta.getAttribute("content")).toBe(ORIGINAL_CONTENT);
  });

  it("cleans up listeners on unmount", () => {
    const removeDocSpy = vi.spyOn(document, "removeEventListener");
    const removeWinSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useResetPinchZoomOnResume());
    unmount();

    expect(removeDocSpy).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function),
    );
    expect(removeWinSpy).toHaveBeenCalledWith("pageshow", expect.any(Function));
  });
});
