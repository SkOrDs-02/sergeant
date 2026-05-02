/**
 * Sergeant Design System — useReducedMotion hook (Web)
 *
 * Returns `true` when the user has enabled "Reduce motion" in their OS
 * accessibility settings. Components should respect this by:
 *  - Skipping non-essential animations (confetti, celebrations, list stagger)
 *  - Using instant transitions instead of timed ones
 *  - Keeping functional animations (loading spinners) but simplifying them
 *
 * Subscribes to the `prefers-reduced-motion` media query and updates
 * reactively if the user toggles the setting while the app is open.
 *
 * @see docs/planning/ux-enhancement-plan.md — Section 7.2 (Reduced motion)
 */

import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * React hook that reactively tracks the user's reduced-motion preference.
 *
 * @returns `true` if the user prefers reduced motion, `false` otherwise.
 *
 * @example
 * ```tsx
 * const prefersReduced = useReducedMotion();
 * const duration = prefersReduced ? 0 : 250;
 * ```
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(QUERY);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return reduced;
}
