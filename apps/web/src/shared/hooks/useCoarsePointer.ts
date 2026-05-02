import { useEffect, useState } from "react";

/**
 * useCoarsePointer
 *
 * Returns `true` when the device's primary pointer is "coarse" — i.e.
 * a touch screen — so callers can swap UI affordances built for fine
 * cursor input (centered modals, hover-only menus) for the touch
 * equivalents (bottom sheets, persistent action rows).
 *
 * Implementation notes:
 *  - SSR-safe: starts at `false` so the first server / hydration pass
 *    renders the desktop layout, then upgrades on mount.
 *  - Re-evaluates on `(pointer: coarse)` matchMedia changes so users
 *    plugging in a mouse mid-session (Android tablets, iPad with
 *    Magic Keyboard, Surface) flip back to the fine-pointer layout
 *    without a reload.
 */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarse(mq.matches);
    update();
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", update);
      return () => mq.removeEventListener("change", update);
    }
    // Safari < 14 fallback
    mq.addListener(update);
    return () => mq.removeListener(update);
  }, []);

  return coarse;
}
