/**
 * Sergeant Design System — View Transitions helper (R2-V-1 / R2-V-2)
 *
 * A thin, dependency-free wrapper around the native
 * [View Transitions API](https://developer.mozilla.org/docs/Web/API/View_Transitions_API)
 * used for the hub ↔ module navigation crossfade + shared-element morph.
 *
 * Design goals:
 *  - **Progressive enhancement.** Where the API is missing (Firefox at
 *    time of writing, older Safari) or the user prefers reduced motion,
 *    we run the DOM mutation immediately with no animation — the app
 *    behaves exactly as before this feature landed.
 *  - **Synchronous commit.** The browser snapshots the "old" state when
 *    `startViewTransition` is called and the "new" state when the passed
 *    callback returns. Because our navigation mutates React state, we
 *    wrap the callback in `flushSync` so React commits the new tree
 *    *before* the browser takes the second snapshot — otherwise the
 *    morph captures a stale frame and nothing animates.
 *  - **No throwing.** A failed transition must never block navigation.
 *    Any error falls through to running the mutation directly.
 *
 * The visual choreography (crossfade + which elements morph) lives in
 * CSS via `::view-transition-*` pseudo-elements and `view-transition-name`
 * — see `styles/animations.css`. This module only orchestrates *when* a
 * transition happens.
 */
import { flushSync } from "react-dom";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

interface DocumentWithViewTransition extends Document {
  startViewTransition?: (callback: () => void) => {
    finished: Promise<void>;
  };
}

/** Non-hook reduced-motion read for use outside React render. */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  try {
    return window.matchMedia(REDUCED_MOTION_QUERY).matches;
  } catch {
    return false;
  }
}

/** Whether the current environment can run a native view transition. */
export function supportsViewTransitions(): boolean {
  if (typeof document === "undefined") return false;
  return typeof (document as DocumentWithViewTransition).startViewTransition ===
    "function";
}

/**
 * Run `mutate` inside a view transition when possible, otherwise run it
 * directly. `mutate` should perform the synchronous state change that
 * swaps the view (e.g. `setActiveModule(id)` + `navigate(...)`).
 *
 * Safe to call unconditionally from navigation handlers — it degrades to
 * a plain function call when transitions aren't available or wanted.
 */
export function startViewTransition(mutate: () => void): void {
  const doc =
    typeof document === "undefined"
      ? undefined
      : (document as DocumentWithViewTransition);

  // Fallback path: no API, SSR, or reduced motion → mutate immediately.
  if (!doc?.startViewTransition || prefersReducedMotion()) {
    mutate();
    return;
  }

  try {
    doc.startViewTransition(() => {
      // Force React to commit synchronously so the browser's "new"
      // snapshot reflects the post-navigation tree.
      flushSync(mutate);
    });
  } catch {
    // Any failure (e.g. flushSync called from an unexpected context)
    // must not swallow the navigation itself.
    mutate();
  }
}
