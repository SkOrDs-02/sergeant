// @vitest-environment jsdom
/**
 * `useResetPinchZoomAfterCameraCapture` — recovers from iOS Safari leaving
 * the page pinch-zoomed after the native camera sheet (triggered by a photo
 * picker like `PhotoAnalyzeCard`) closes.
 *
 * Ключова частина контракту, яку тут пінимо: скидання спрацьовує ЛИШЕ після
 * `armReset()`. До 2026-08-16 хук слухав глобально й розтискав сторінку на
 * будь-якому поверненні в застосунок — включно зі свідомим зумом людини,
 * яка просто перемкнула вкладку.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useResetPinchZoomAfterCameraCapture } from "./useResetPinchZoomOnResume";

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

function meta(): HTMLMetaElement {
  return document.querySelector<HTMLMetaElement>('meta[name="viewport"]')!;
}

function becomeVisible(): void {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("useResetPinchZoomAfterCameraCapture", () => {
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

  it("після armReset() перемикає maximum-scale=1 і вертає оригінал", () => {
    const { result } = renderHook(() => useResetPinchZoomAfterCameraCapture());
    result.current();

    becomeVisible();
    expect(meta().getAttribute("content")).toBe(
      `${ORIGINAL_CONTENT}, maximum-scale=1`,
    );

    vi.advanceTimersByTime(50);
    expect(meta().getAttribute("content")).toBe(ORIGINAL_CONTENT);
  });

  it("БЕЗ armReset() не чіпає масштаб — зум користувача лишається його", () => {
    // Регресія на побічний ефект глобального варіанта: повернення у
    // застосунок без жодної камери не має нічого скидати.
    renderHook(() => useResetPinchZoomAfterCameraCapture());

    becomeVisible();
    window.dispatchEvent(new Event("pageshow"));

    expect(meta().getAttribute("content")).toBe(ORIGINAL_CONTENT);
  });

  it("одне озброєння — рівно одне скидання", () => {
    const { result } = renderHook(() => useResetPinchZoomAfterCameraCapture());
    result.current();

    becomeVisible();
    vi.advanceTimersByTime(50);
    expect(meta().getAttribute("content")).toBe(ORIGINAL_CONTENT);

    // Друге повернення вже без камери — хук роззброєний.
    becomeVisible();
    expect(meta().getAttribute("content")).toBe(ORIGINAL_CONTENT);
  });

  it("нічого не робить, поки сторінка ховається", () => {
    const { result } = renderHook(() => useResetPinchZoomAfterCameraCapture());
    result.current();

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(meta().getAttribute("content")).toBe(ORIGINAL_CONTENT);
  });

  it("спрацьовує і на pageshow — iOS не завжди шле visibilitychange", () => {
    const { result } = renderHook(() => useResetPinchZoomAfterCameraCapture());
    result.current();

    window.dispatchEvent(new Event("pageshow"));

    expect(meta().getAttribute("content")).toBe(
      `${ORIGINAL_CONTENT}, maximum-scale=1`,
    );
    vi.advanceTimersByTime(50);
    expect(meta().getAttribute("content")).toBe(ORIGINAL_CONTENT);
  });

  it("знімає слухачів на unmount", () => {
    const removeDocSpy = vi.spyOn(document, "removeEventListener");
    const removeWinSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useResetPinchZoomAfterCameraCapture());
    unmount();

    expect(removeDocSpy).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function),
    );
    expect(removeWinSpy).toHaveBeenCalledWith("pageshow", expect.any(Function));
  });
});
