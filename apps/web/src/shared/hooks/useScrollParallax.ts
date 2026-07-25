/**
 * #19 — Scroll parallax effect.
 *
 * Returns a `translateY` offset (in px) that moves at `speed` × scroll
 * progress. Attach it as `style={{ transform: `translateY(${offsetPx}px)` }}`
 * on the element you want to scroll more slowly than the page.
 *
 * Designed for the hub hero block: the hero drifts upward at 30 % of
 * normal scroll speed, creating a layered-depth effect without a library.
 *
 * Implementation notes:
 * - Uses `requestAnimationFrame` to batch reads, avoiding layout thrash.
 * - `passive: true` on the scroll listener so it never blocks painting.
 * - Returns 0 immediately under `prefers-reduced-motion` (Hard Rule §17).
 * - Cleans up the listener on unmount / container change.
 */

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "./useReducedMotion";

export interface UseScrollParallaxOptions {
  /** The element whose scroll position drives the parallax. Falls back to
   *  `window` when `null`. */
  containerRef: React.RefObject<HTMLElement | null>;
  /**
   * Parallax speed factor (0–1). 0 = no movement (static), 1 = moves with
   * scroll (no parallax), 0.3 = 30 % of scroll speed. Default: 0.25.
   */
  speed?: number;
  /** Maximum absolute offset in px to prevent the element from travelling
   *  too far off-screen. Default: 60. */
  maxOffsetPx?: number;
}

export function useScrollParallax({
  containerRef,
  speed = 0.25,
  maxOffsetPx = 60,
}: UseScrollParallaxOptions): number {
  const reducedMotion = useReducedMotion();
  // Initialize to 0; when reducedMotion is true the effect simply never
  // attaches a scroll listener, so the value stays at 0 for the life of the
  // component — no synchronous setState needed inside the effect body.
  const [offsetPx, setOffsetPx] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // Hard Rule §17: respect prefers-reduced-motion. Do NOT call setState
    // here — just skip subscribing. The initial 0 from useState is correct.
    if (reducedMotion) return;

    const container = containerRef.current;

    function read() {
      const scrollTop = container ? container.scrollTop : window.scrollY;
      const raw = scrollTop * speed;
      const clamped = Math.min(Math.abs(raw), maxOffsetPx) * Math.sign(raw);
      setOffsetPx(clamped);
      rafRef.current = null;
    }

    function handleScroll() {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(read);
    }

    const target: EventTarget = container ?? window;
    target.addEventListener("scroll", handleScroll, { passive: true });

    // Seed the initial value in case the page is already scrolled.
    read();

    return () => {
      target.removeEventListener("scroll", handleScroll);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [containerRef, maxOffsetPx, reducedMotion, speed]);

  return offsetPx;
}
