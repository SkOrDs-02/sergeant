import { useEffect, useRef, useState } from "react";

interface Options {
  // Resetting `key` (typically the current slide index) restarts progress.
  key: number | string;
  durationMs: number;
  paused: boolean;
  onAdvance: () => void;
}

// Cadence of the timer that drives progress when rAF is unavailable. Fast
// enough to read as motion rather than as discrete steps, which matters
// because on a frozen WebKit page this is the *only* driver.
const TICK_MS = 100;

// Upper bound on the time credited to a single tick. Both drivers can go
// silent for minutes (backgrounded app, suspended page); without a clamp the
// first tick after a resume would jump the bar — or blow through the whole
// slide. With it, a resume costs at most one clamp window regardless of how
// long the gap was, so correctness no longer depends on the page telling us
// truthfully when it went away.
const MAX_TICK_MS = 500;

/**
 * rAF-driven progress (0–100). Resets to 0 whenever `key` changes, halts
 * while `paused` is true, and calls `onAdvance` at 100%.
 *
 * Progress is accumulated from clamped wall-clock deltas rather than derived
 * from a fixed start timestamp, and a `setInterval` runs alongside rAF so the
 * bar keeps moving on platforms that throttle or suspend rAF callbacks (iOS
 * Safari standalone-PWA, low power mode, WKWebView in Capacitor).
 *
 * AI-CONTEXT: the interval used to no-op whenever
 * `document.visibilityState === "hidden"`, which disabled the fallback in
 * exactly the situation it exists for. An iOS PWA resumed from the background
 * can be left with its page-visibility state machine stuck: rAF is never
 * resumed *and* `visibilityState` keeps reporting `"hidden"` while the page is
 * on screen and repainting. Both drivers died together, so the bar froze and
 * slides stopped advancing while taps (event-driven) still worked. We now
 * track visibility from `visibilitychange` *transitions* only — an event that
 * fires when the app genuinely leaves the foreground — and start from
 * "visible", since the overlay only ever mounts behind a user gesture. A lying
 * `visibilityState` can no longer freeze autoplay; the delta clamp above keeps
 * a genuine background stint from being credited to the current slide.
 */
export function useStoriesAutoplay({
  key,
  durationMs,
  paused,
  onAdvance,
}: Options): number {
  const [progressState, setProgressState] = useState({ key, value: 0 });
  const progressRef = useRef(0);
  const activeKeyRef = useRef(key);
  // Keep `onAdvance` behind a ref so the animation loop doesn't need to
  // restart every time a parent re-renders with a new callback identity.
  const onAdvanceRef = useRef(onAdvance);
  useEffect(() => {
    onAdvanceRef.current = onAdvance;
  }, [onAdvance]);

  useEffect(() => {
    if (paused) return;
    if (typeof window === "undefined") return;

    let rafId: number | null = null;
    let cancelled = false;
    let advanced = false;
    // Only a `visibilitychange` to "hidden" sets this — never a poll of
    // `document.visibilityState`, which is the value we cannot trust.
    let hidden = false;

    if (activeKeyRef.current !== key) {
      activeKeyRef.current = key;
      progressRef.current = 0;
    }

    // Date.now keeps advancing on iOS standalone PWA even when the WebKit
    // performance clock/rAF timestamp is temporarily frozen in low-power mode.
    let elapsedMs = (progressRef.current / 100) * durationMs;
    let lastTs = Date.now();

    const doAdvance = () => {
      if (advanced || cancelled) return;
      advanced = true;
      setProgressState({ key, value: 100 });
      onAdvanceRef.current();
    };

    const update = () => {
      if (cancelled || advanced) return;
      const now = Date.now();
      elapsedMs += Math.min(Math.max(now - lastTs, 0), MAX_TICK_MS);
      lastTs = now;
      const pct = Math.min(100, (elapsedMs / durationMs) * 100);
      progressRef.current = pct;
      setProgressState({ key, value: pct });
      if (pct >= 100) {
        doAdvance();
      }
    };

    const tick = () => {
      if (cancelled || advanced) return;
      update();
      if (!cancelled && !advanced) {
        rafId = window.requestAnimationFrame(tick);
      }
    };
    rafId = window.requestAnimationFrame(tick);

    const intervalId = window.setInterval(() => {
      if (hidden) return;
      update();
    }, TICK_MS);

    const onVisibility = () => {
      hidden = document.visibilityState === "hidden";
      if (hidden || cancelled || advanced) return;
      // Coming back: drop the gap that accrued while we were away, then
      // re-kick rAF — some browsers discard the pending callback when the
      // page was hidden, and the interval alone would leave the bar steppy.
      lastTs = Date.now();
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(tick);
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [key, durationMs, paused]);

  return progressState.key === key ? progressState.value : 0;
}
