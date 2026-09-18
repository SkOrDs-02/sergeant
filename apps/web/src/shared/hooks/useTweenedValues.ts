import { useEffect, useRef, useState } from "react";

/**
 * Tween an array of numbers toward a new target array (V-18).
 *
 * SVG geometry attributes (`points`, `d`) are not CSS-transitionable, so a
 * chart whose values change — a period toggle, an account filter, a fresh
 * data point — repaints its line/area instantly, which reads as a jarring
 * snap. This hook interpolates each element from its previous value to the
 * next over `duration` ms with an easeOutCubic curve, so the caller can
 * recompute `points` from the interpolated values every frame and get a
 * smooth morph instead.
 *
 * Contract & guarantees:
 *  - Respects `prefers-reduced-motion`: jumps straight to `target`, no RAF.
 *  - Length changes (e.g. 7-day → 30-day window) are NOT interpolated —
 *    element-wise tweening across differing lengths produces garbage, so we
 *    snap to the new array and let the next same-length change animate.
 *  - Cleans up its RAF on unmount and on every retarget.
 */
export function useTweenedValues(
  target: readonly number[],
  duration = 320,
): number[] {
  const [values, setValues] = useState<number[]>(() => [...target]);
  const fromRef = useRef<number[]>([...target]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    // Bail on reduced motion or a length change — either way, snap.
    if (prefersReduced || fromRef.current.length !== target.length) {
      fromRef.current = [...target];
      setValues([...target]);
      return;
    }

    const from = fromRef.current;
    const to = target;
    const start = performance.now();
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const animate = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = easeOutCubic(progress);
      const next = to.map((toVal, i) => {
        const fromVal = from[i] ?? toVal;
        return fromVal + (toVal - fromVal) * eased;
      });
      setValues(next);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        fromRef.current = [...to];
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      // Preserve the last painted frame as the next tween's origin.
      fromRef.current = values;
    };
    // `values` intentionally omitted: including it would restart the tween
    // every frame. We only retarget when `target`/`duration` change.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `values` навмисно поза deps: інакше tween рестартує щокадру; retarget лише на `target`
  }, [target, duration]);

  return values;
}
