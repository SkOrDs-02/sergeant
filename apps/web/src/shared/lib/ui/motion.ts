/**
 * Motion-preference helpers for imperative (JS-initiated) animations.
 *
 * The global `@media (prefers-reduced-motion: reduce)` CSS guard collapses
 * declarative `animation`/`transition` durations, but it cannot reach
 * JS-initiated smooth scrolling: `scrollIntoView` / `scrollTo` called with
 * an explicit `behavior: "smooth"` option override the CSS `scroll-behavior`
 * property outright. Call sites must resolve the behavior themselves so a
 * reduced-motion user gets an instant jump rather than an animated scroll
 * (WCAG 2.3.3 — Animation from Interactions).
 */

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Resolve the `ScrollBehavior` for an imperative scroll, honoring the user's
 * reduced-motion preference: `"auto"` (instant) when reduce is set, otherwise
 * `"smooth"`.
 */
export function motionScrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth";
}
