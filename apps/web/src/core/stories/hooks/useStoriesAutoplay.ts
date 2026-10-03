import { useEffect, useRef } from "react";

interface Options {
  // Resetting `key` (typically the current slide index) restarts the timer.
  key: number | string;
  durationMs: number;
  paused: boolean;
  onAdvance: () => void;
}

// How often elapsed time is accumulated. Only needs to be fine enough that
// `onAdvance` lands close to the deadline — the progress bar is animated by
// the compositor now, not by this loop, so there is no per-frame work here.
const TICK_MS = 100;

// Upper bound on the time credited to a single tick. The timer can go silent
// for minutes (backgrounded app, suspended page); without a clamp the first
// tick after a resume would blow through the whole slide. With it, a resume
// costs at most one clamp window regardless of how long the gap was, so
// correctness does not depend on the page telling us truthfully when it left.
const MAX_TICK_MS = 500;

/**
 * Pause-aware slide timer: calls `onAdvance` once `durationMs` of un-paused,
 * foreground time has elapsed for the current `key`.
 *
 * AI-CONTEXT: this used to drive a 0–100 progress number through React state
 * on every `requestAnimationFrame`, which the progress bar rendered as an
 * inline `width`. Two things were wrong with that. First, an iOS PWA resumed
 * from the background can be left with its page-visibility state machine
 * stuck — rAF never resumes *and* `document.visibilityState` keeps reporting
 * `"hidden"` while the page is on screen and repainting — and the interval
 * fallback used to poll that value and no-op, so both drivers died together
 * and slides stopped advancing entirely. Second, even once the interval kept
 * the timer alive, the *bar* still moved only when rAF did: on a device where
 * rAF is dead or throttled it advanced in visible chunks, and re-rendering the
 * whole overlay ~70×/s (rAF + interval) fought the main thread for the paint.
 *
 * So the bar no longer comes from here at all — `StoriesProgressHeader`
 * animates it with a single CSS transform transition the compositor owns,
 * which needs neither rAF nor a free main thread. This hook is left with the
 * one job it can do reliably: decide when the slide is over.
 */
export function useStoriesAutoplay({
  key,
  durationMs,
  paused,
  onAdvance,
}: Options): void {
  const elapsedRef = useRef(0);
  const activeKeyRef = useRef(key);
  // Keep `onAdvance` behind a ref so the loop doesn't need to restart every
  // time a parent re-renders with a new callback identity.
  const onAdvanceRef = useRef(onAdvance);
  useEffect(() => {
    onAdvanceRef.current = onAdvance;
  }, [onAdvance]);

  useEffect(() => {
    if (paused) return;
    if (typeof window === "undefined") return;

    let cancelled = false;
    let advanced = false;
    // Only a `visibilitychange` to "hidden" sets this — never a poll of
    // `document.visibilityState`, which is the value we cannot trust.
    let hidden = false;

    if (activeKeyRef.current !== key) {
      activeKeyRef.current = key;
      elapsedRef.current = 0;
    }

    let lastTs = Date.now();

    const intervalId = window.setInterval(() => {
      if (hidden || cancelled || advanced) return;
      const now = Date.now();
      elapsedRef.current += Math.min(Math.max(now - lastTs, 0), MAX_TICK_MS);
      lastTs = now;
      if (elapsedRef.current >= durationMs) {
        advanced = true;
        onAdvanceRef.current();
      }
    }, TICK_MS);

    const onVisibility = () => {
      hidden = document.visibilityState === "hidden";
      // Coming back: drop the gap that accrued while we were away.
      if (!hidden) lastTs = Date.now();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [key, durationMs, paused]);
}
