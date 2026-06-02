import { useEffect } from "react";

// Module-level refcount so nested overlays don't clobber each other's
// restoration. The first caller snapshots the original overflow; the last
// caller restores it. Intermediate mount/unmount pairs are no-ops.
let lockCount = 0;
let savedOverflow: string | null = null;

/**
 * Locks body scroll while mounted. Safe to nest: only the outermost
 * caller's mount snapshots and the outermost unmount restores.
 *
 * Use this for any overlay that covers the full viewport (modals, drawers,
 * radial menus with a backdrop) so the page beneath cannot be scrolled
 * while the overlay is open.
 */
export function useBodyScrollLock(active: boolean = true): void {
  useEffect(() => {
    if (!active) return;
    if (typeof document === "undefined") return;
    if (lockCount === 0) {
      savedOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    lockCount += 1;
    return () => {
      lockCount -= 1;
      if (lockCount === 0) {
        document.body.style.overflow = savedOverflow ?? "";
        savedOverflow = null;
      }
    };
  }, [active]);
}
