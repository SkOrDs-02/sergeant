import { useCallback, useRef, useState, type RefCallback } from "react";

/**
 * `useInView` — viewport-gating primitive for lazy initialisation of heavy
 * work that would otherwise block the cold open of a screen.
 *
 * Returns `[ref, inView]`. Attach `ref` to the element whose visibility
 * gates the work. `inView` flips to `true` the first time the element
 * crosses the IntersectionObserver threshold (extended by `rootMargin`)
 * and **stays true forever** — once a section has been seen, restarting
 * the observer on every scroll just to flip the boolean back to `false`
 * would cancel in-flight queries and re-trigger boot work every time the
 * user scrolled away. The component owns the lifecycle of any state it
 * derived while in view.
 *
 * Default `rootMargin: "400px 0px"` — a one-screen buffer on mobile so
 * the query/import starts before the section is actually visible and the
 * user lands on real content, not a skeleton.
 *
 * Initiative 0017 Sprint 1 PR-1.2 — used by Settings cross-module
 * sections (`FinykSection` today, others when their hooks grow heavy
 * enough to justify the gate).
 */
export function useInView(
  rootMargin = "400px 0px",
): [RefCallback<Element>, boolean] {
  const [inView, setInView] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const ref: RefCallback<Element> = useCallback(
    (node) => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      if (!node || inView) return;
      // Feature-detect: SSR / very old browsers fall through to "always
      // in view" via the early return on first render — callers see
      // `inView === false` until hydration, then never reattach.
      if (typeof IntersectionObserver === "undefined") {
        setInView(true);
        return;
      }
      observerRef.current = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (entry?.isIntersecting) setInView(true);
        },
        { rootMargin },
      );
      observerRef.current.observe(node);
    },
    [inView, rootMargin],
  );

  return [ref, inView];
}
