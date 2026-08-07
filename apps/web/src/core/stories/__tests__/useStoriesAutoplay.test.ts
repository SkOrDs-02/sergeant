// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useStoriesAutoplay } from "../hooks/useStoriesAutoplay";

// Helper: drive requestAnimationFrame with a fake clock, advancing in
// ~16ms frames. jsdom provides `performance.now` already, so we alias
// `vi.advanceTimersByTime` via the rAF polyfill below.
// vitest's fake timers already advance `performance.now()`, so the fake
// rAF just replays queued callbacks at the current (fake) clock value.
// Captured once, at module load, so a test that throws before its own
// `raf.restore()` can't leave a fake installed for the next test to capture
// as its "original" — that cascade turns one red test into three.
const originalRaf = globalThis.requestAnimationFrame;
const originalCancel = globalThis.cancelAnimationFrame;

function restoreRaf() {
  globalThis.requestAnimationFrame = originalRaf;
  globalThis.cancelAnimationFrame = originalCancel;
}

function installFakeRaf() {
  let id = 0;
  const callbacks = new Map<number, (t: number) => void>();
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
    id += 1;
    callbacks.set(id, cb);
    return id;
  };
  globalThis.cancelAnimationFrame = (handle: number) => {
    callbacks.delete(handle);
  };
  const flush = () => {
    const list = Array.from(callbacks.entries());
    callbacks.clear();
    const now = performance.now();
    for (const [, cb] of list) cb(now);
  };
  return { flush, restore: restoreRaf };
}

describe("useStoriesAutoplay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    // Both of these must come off even when an assertion throws first — a
    // leaked getter or a leaked rAF stub silently reshapes every later test.
    restoreRaf();
    vi.restoreAllMocks();
  });

  it("starts at 0 progress", () => {
    const raf = installFakeRaf();
    const { result } = renderHook(() =>
      useStoriesAutoplay({
        key: 0,
        durationMs: 1000,
        paused: false,
        onAdvance: () => {},
      }),
    );
    expect(result.current).toBe(0);
    raf.restore();
  });

  it("calls onAdvance after durationMs elapses", () => {
    const raf = installFakeRaf();
    const onAdvance = vi.fn();
    renderHook(() =>
      useStoriesAutoplay({
        key: 0,
        durationMs: 1000,
        paused: false,
        onAdvance,
      }),
    );
    act(() => {
      vi.advanceTimersByTime(500);
      raf.flush();
    });
    expect(onAdvance).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(600);
      raf.flush();
    });
    expect(onAdvance).toHaveBeenCalledTimes(1);
    raf.restore();
  });

  it("does not tick while paused", () => {
    const raf = installFakeRaf();
    const onAdvance = vi.fn();
    const { result, rerender } = renderHook(
      ({ paused }: { paused: boolean }) =>
        useStoriesAutoplay({
          key: 0,
          durationMs: 1000,
          paused,
          onAdvance,
        }),
      { initialProps: { paused: true } },
    );
    act(() => {
      vi.advanceTimersByTime(2000);
      raf.flush();
    });
    expect(onAdvance).not.toHaveBeenCalled();
    expect(result.current).toBe(0);

    rerender({ paused: false });
    act(() => {
      vi.advanceTimersByTime(1100);
      raf.flush();
    });
    expect(onAdvance).toHaveBeenCalledTimes(1);
    raf.restore();
  });

  it("resets progress to 0 when key changes", () => {
    const raf = installFakeRaf();
    const { result, rerender } = renderHook(
      ({ key }: { key: number }) =>
        useStoriesAutoplay({
          key,
          durationMs: 1000,
          paused: false,
          onAdvance: () => {},
        }),
      { initialProps: { key: 0 } },
    );
    act(() => {
      vi.advanceTimersByTime(500);
      raf.flush();
    });
    expect(result.current).toBeGreaterThan(0);
    rerender({ key: 1 });
    expect(result.current).toBe(0);
    raf.restore();
  });

  it("interval fallback advances even when rAF stops firing", () => {
    // Install fake rAF but never flush it — simulates iOS dropping rAF.
    const raf = installFakeRaf();
    const onAdvance = vi.fn();
    renderHook(() =>
      useStoriesAutoplay({
        key: 0,
        durationMs: 1000,
        paused: false,
        onAdvance,
      }),
    );
    // Only advance timers (fires setInterval callbacks via fake timers)
    // but do NOT flush rAF — simulates rAF being suspended.
    act(() => {
      vi.advanceTimersByTime(1300);
    });
    expect(onAdvance).toHaveBeenCalledTimes(1);
    raf.restore();
  });

  // Regression: an iOS PWA resumed from the background can be left with its
  // page-visibility state machine stuck — rAF never resumes *and*
  // `visibilityState` keeps reporting "hidden" while the page is on screen.
  // The interval fallback used to poll that value and no-op, so both drivers
  // died together: the progress bar froze at 0 and slides stopped advancing
  // while taps still worked.
  it("keeps ticking when rAF is suspended and visibilityState is stuck hidden", () => {
    const raf = installFakeRaf();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    const onAdvance = vi.fn();
    const { result } = renderHook(() =>
      useStoriesAutoplay({
        key: 0,
        durationMs: 1000,
        paused: false,
        onAdvance,
      }),
    );

    // Neither flush the fake rAF nor dispatch a visibilitychange — the page
    // simply never tells us it came back.
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current).toBeGreaterThan(0);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onAdvance).toHaveBeenCalledTimes(1);
    raf.restore();
  });

  it("does not credit backgrounded time to the current slide", () => {
    const raf = installFakeRaf();
    const onAdvance = vi.fn();
    const { result } = renderHook(() =>
      useStoriesAutoplay({
        key: 0,
        durationMs: 10_000,
        paused: false,
        onAdvance,
      }),
    );
    act(() => {
      vi.advanceTimersByTime(500);
    });
    const beforeBackground = result.current;
    expect(beforeBackground).toBeGreaterThan(0);

    const hidden = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      vi.advanceTimersByTime(60_000);
    });
    hidden.mockRestore();
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      vi.advanceTimersByTime(300);
    });

    // A minute in the background must not consume the slide.
    expect(onAdvance).not.toHaveBeenCalled();
    expect(result.current).toBeLessThan(beforeBackground + 10);
    raf.restore();
  });

  it("onAdvance is called only once even with both rAF and interval", () => {
    const raf = installFakeRaf();
    const onAdvance = vi.fn();
    renderHook(() =>
      useStoriesAutoplay({
        key: 0,
        durationMs: 1000,
        paused: false,
        onAdvance,
      }),
    );
    act(() => {
      vi.advanceTimersByTime(1100);
      raf.flush();
    });
    // Both rAF and interval had a chance to fire — only one advance.
    expect(onAdvance).toHaveBeenCalledTimes(1);
    raf.restore();
  });
});
