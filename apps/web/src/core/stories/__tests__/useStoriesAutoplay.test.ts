// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useStoriesAutoplay } from "../hooks/useStoriesAutoplay";

// The hook deliberately does NOT use requestAnimationFrame — the progress bar
// is animated by the compositor, so the timer only has to decide when a slide
// is over. Stubbing rAF to never fire proves the timer stands on its own.
const originalRaf = globalThis.requestAnimationFrame;
const originalCancel = globalThis.cancelAnimationFrame;

function suspendRaf() {
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
}

function restoreRaf() {
  globalThis.requestAnimationFrame = originalRaf;
  globalThis.cancelAnimationFrame = originalCancel;
}

describe("useStoriesAutoplay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    // These must come off even when an assertion throws first — a leaked
    // getter or rAF stub silently reshapes every later test.
    restoreRaf();
    vi.restoreAllMocks();
  });

  it("calls onAdvance after durationMs elapses", () => {
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
    });
    expect(onAdvance).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });

  it("advances only once per slide", () => {
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
      vi.advanceTimersByTime(5000);
    });
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });

  it("does not tick while paused, and resumes where it left off", () => {
    const onAdvance = vi.fn();
    const { rerender } = renderHook(
      ({ paused }: { paused: boolean }) =>
        useStoriesAutoplay({
          key: 0,
          durationMs: 1000,
          paused,
          onAdvance,
        }),
      { initialProps: { paused: false } },
    );
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(onAdvance).not.toHaveBeenCalled();

    rerender({ paused: true });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onAdvance).not.toHaveBeenCalled();

    // Only the remaining ~400ms should be needed after resuming.
    rerender({ paused: false });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });

  it("restarts the countdown when key changes", () => {
    const onAdvance = vi.fn();
    const { rerender } = renderHook(
      ({ key }: { key: number }) =>
        useStoriesAutoplay({
          key,
          durationMs: 1000,
          paused: false,
          onAdvance,
        }),
      { initialProps: { key: 0 } },
    );
    act(() => {
      vi.advanceTimersByTime(900);
    });
    rerender({ key: 1 });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    // The 900ms spent on the previous slide must not carry over.
    expect(onAdvance).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });

  // Regression: an iOS PWA resumed from the background can be left with its
  // page-visibility state machine stuck — rAF never resumes *and*
  // `visibilityState` keeps reporting "hidden" while the page is on screen.
  // The timer used to depend on rAF and to no-op whenever a poll of
  // `visibilityState` said "hidden", so both drivers died together and slides
  // stopped advancing while taps still worked.
  it("advances with rAF suspended and visibilityState stuck hidden", () => {
    suspendRaf();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    const onAdvance = vi.fn();
    renderHook(() =>
      useStoriesAutoplay({
        key: 0,
        durationMs: 1000,
        paused: false,
        onAdvance,
      }),
    );

    // Never dispatch a visibilitychange — the page simply never tells us it
    // came back.
    act(() => {
      vi.advanceTimersByTime(1400);
    });
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });

  it("does not credit backgrounded time to the current slide", () => {
    const onAdvance = vi.fn();
    renderHook(() =>
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
  });
});
