import { useEffect, useRef, useState } from "react";

interface Options {
  // Resetting `key` (typically the current slide index) restarts progress.
  key: number | string;
  durationMs: number;
  paused: boolean;
  onAdvance: () => void;
}

/**
 * rAF-driven progress (0–100). Resets to 0 whenever `key` changes, halts
 * while `paused` is true, and calls `onAdvance` at 100%.
 *
 * Uses requestAnimationFrame with wall-clock deltas so the progress bar
 * stays in sync with real time across frame drops. A secondary
 * `setInterval` guard advances progress on platforms where the browser
 * throttles or pauses rAF callbacks (iOS Safari standalone-PWA, low
 * power mode, WKWebView in Capacitor). When the tab is hidden the
 * browser stops calling rAF entirely, so we rebase the start time on
 * `visibilitychange` and re-schedule a rAF — preventing the progress
 * bar from jumping or stalling on resume.
 */
export function useStoriesAutoplay({
  key,
  durationMs,
  paused,
  onAdvance,
}: Options): number {
  const [progress, setProgress] = useState(0);
  const [progressKey, setProgressKey] = useState(key);
  if (key !== progressKey) {
    setProgressKey(key);
    setProgress(0);
  }
  // Keep `onAdvance` behind a ref so the animation loop doesn't need to
  // restart every time a parent re-renders with a new callback identity.
  const onAdvanceRef = useRef(onAdvance);
  useEffect(() => {
    onAdvanceRef.current = onAdvance;
  }, [onAdvance]);

  useEffect(() => {
    if (paused) return;
    if (typeof window === "undefined" || typeof performance === "undefined") {
      return;
    }

    let rafId: number | null = null;
    let cancelled = false;
    let advanced = false;
    // Mutable so visibilitychange can rebase without restarting the loop.
    const state = { startTs: performance.now(), lastProgress: 0 };

    const doAdvance = () => {
      if (advanced || cancelled) return;
      advanced = true;
      setProgress(100);
      onAdvanceRef.current();
    };

    const update = (now: number) => {
      if (cancelled || advanced) return;
      const pct = Math.min(100, ((now - state.startTs) / durationMs) * 100);
      state.lastProgress = pct;
      setProgress(pct);
      if (pct >= 100) {
        doAdvance();
      }
    };

    const tick = (now: number) => {
      if (cancelled || advanced) return;
      update(now);
      if (!cancelled && !advanced) {
        rafId = window.requestAnimationFrame(tick);
      }
    };
    rafId = window.requestAnimationFrame(tick);

    // Fallback: setInterval catches platforms where rAF silently stops
    // (iOS Safari PWA, WKWebView, low-power mode). Runs at ~250ms — not
    // visually smooth, but enough to keep the progress bar moving and
    // guarantee the slide advances on time.
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      update(performance.now());
    }, 250);

    const onVisibility = () => {
      if (document.visibilityState === "visible" && !cancelled && !advanced) {
        // Rebase startTs so we resume from the last observed progress
        // rather than crediting hidden-tab time to the current slide.
        state.startTs =
          performance.now() - (state.lastProgress / 100) * durationMs;
        // Re-kick rAF — some browsers drop the pending callback when the
        // page was hidden; the interval guard covers the gap in between.
        if (rafId !== null) window.cancelAnimationFrame(rafId);
        rafId = window.requestAnimationFrame(tick);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [key, durationMs, paused]);

  return progress;
}
