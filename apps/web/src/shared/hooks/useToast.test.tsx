// @vitest-environment jsdom
import { type ReactNode } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { ToastProvider, useToast, type ToastAction } from "./useToast";

function wrapper({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

describe("useToast", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("requires ToastProvider", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    expect(() => renderHook(() => useToast())).toThrow(
      "useToast must be used within <ToastProvider>",
    );
    expect(consoleError).toHaveBeenCalled();
  });

  it("shows typed toasts with normalized actions and keeps the newest five", () => {
    vi.useFakeTimers();
    const actionClick = vi.fn();
    const { result, unmount } = renderHook(() => useToast(), { wrapper });

    act(() => {
      result.current.success("saved", 10_000, {
        label: "",
        onClick: actionClick,
      });
      result.current.error("failed", 10_000, {
        label: "Retry",
        onClick: actionClick,
      });
      result.current.info("info", 10_000);
      result.current.warning("warning", 10_000);
      result.current.show("plain", undefined, 10_000, {
        label: "Ignored",
      } as unknown as ToastAction);
      result.current.show("latest", "info", 10_000);
    });

    expect(result.current.toasts).toHaveLength(5);
    expect(result.current.toasts.map((toast) => toast.msg)).toEqual([
      "failed",
      "info",
      "warning",
      "plain",
      "latest",
    ]);
    expect(result.current.toasts[0]).toMatchObject({
      type: "error",
      action: { label: "Retry", onClick: actionClick },
      duration: 10_000,
    });
    expect(result.current.toasts[3]?.action).toBeNull();

    unmount();
  });

  it("captures default durations by type", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useToast(), { wrapper });

    act(() => {
      result.current.success("success");
      result.current.info("info");
      result.current.warning("warning");
      result.current.error("error");
    });

    expect(result.current.toasts.map((toast) => toast.duration)).toEqual([
      3500, 3500, 5000, 5000,
    ]);

    unmount();
  });

  it("marks a toast as leaving before removing it on dismiss", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useToast(), { wrapper });

    let id = 0;
    act(() => {
      id = result.current.info("dismiss me", 10_000);
    });
    act(() => result.current.dismiss(id));

    expect(result.current.toasts).toMatchObject([{ leaving: true }]);

    act(() => vi.advanceTimersByTime(199));
    expect(result.current.toasts).toHaveLength(1);

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.toasts).toHaveLength(0);

    unmount();
  });

  it("auto-dismisses after the configured duration and exit transition", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useToast(), { wrapper });

    act(() => {
      result.current.show("short lived", "success", 100);
    });

    act(() => vi.advanceTimersByTime(99));
    expect(result.current.toasts).toHaveLength(1);

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.toasts).toMatchObject([{ leaving: true }]);

    act(() => vi.advanceTimersByTime(200));
    expect(result.current.toasts).toHaveLength(0);

    unmount();
  });

  it("pauses and resumes the remaining auto-dismiss countdown", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { result, unmount } = renderHook(() => useToast(), { wrapper });

    let id = 0;
    act(() => {
      id = result.current.warning("read me", 1000);
    });

    act(() => vi.advanceTimersByTime(400));
    act(() => result.current.pause(id));
    act(() => result.current.pause(id));

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.toasts).toHaveLength(1);

    act(() => result.current.resume(999));
    act(() => result.current.resume(id));
    act(() => result.current.resume(id));

    act(() => vi.advanceTimersByTime(599));
    expect(result.current.toasts).toHaveLength(1);

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.toasts).toMatchObject([{ leaving: true }]);

    act(() => vi.advanceTimersByTime(200));
    expect(result.current.toasts).toHaveLength(0);

    unmount();
  });
});
