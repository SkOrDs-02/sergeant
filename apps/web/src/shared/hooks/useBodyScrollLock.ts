import { useEffect } from "react";

// Module-level refcount so nested overlays don't clobber each other's
// restoration. The first caller snapshots the original styles/scroll
// position; the last caller restores them. Intermediate mount/unmount
// pairs are no-ops.
let lockCount = 0;
let savedOverflow: string | null = null;
let savedPosition: string | null = null;
let savedTop: string | null = null;
let savedWidth: string | null = null;
let savedScrollY = 0;

/**
 * Locks body scroll while mounted. Safe to nest: only the outermost
 * caller's mount snapshots and the outermost unmount restores.
 *
 * Use this for any overlay that covers the full viewport (modals, drawers,
 * radial menus with a backdrop) so the page beneath cannot be scrolled
 * while the overlay is open.
 *
 * `overflow: hidden` alone does not stop scrolling on iOS Safari — the
 * visual viewport still rubber-bands and drags the body behind a `fixed`
 * overlay (round-2 UI audit X2: this was the root cause of the chat sheet
 * feeling "scroll-locked" from the wrong side — the SHEET's own inner
 * scroll worked, but the PAGE behind it kept moving, which read as broken
 * scroll and a light rubber-band edge around the sheet). Pinning body to
 * `position: fixed` at its current scroll offset is the standard
 * cross-browser fix; scroll position is restored on unlock.
 */
export function useBodyScrollLock(active: boolean = true): void {
  useEffect(() => {
    if (!active) return;
    if (typeof document === "undefined") return;
    if (lockCount === 0) {
      savedScrollY = window.scrollY;
      savedOverflow = document.body.style.overflow;
      savedPosition = document.body.style.position;
      savedTop = document.body.style.top;
      savedWidth = document.body.style.width;
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.top = `-${savedScrollY}px`;
      document.body.style.width = "100%";
    }
    lockCount += 1;

    // iOS Safari still auto-scrolls the document to bring a focused
    // input above the keyboard even though `position: fixed` stops the
    // user from dragging the page — that OS-level scroll-into-view
    // step ignores the CSS lock. Left uncorrected, `window.scrollY`
    // drifts on every focus change inside the locked sheet, which is
    // exactly what fed the keyboard-inset jitter and the "jumping"
    // sheet (spec `docs/90-work/planning/specs/keyboard-and-scroll.md`
    // § H1, design decision §1). Snap it straight back to the pinned
    // offset on every focus change while any lock is active.
    const resetScroll = () => {
      if (window.scrollY !== savedScrollY) {
        window.scrollTo(0, savedScrollY);
      }
    };
    document.addEventListener("focusin", resetScroll);

    return () => {
      document.removeEventListener("focusin", resetScroll);
      lockCount -= 1;
      if (lockCount === 0) {
        document.body.style.overflow = savedOverflow ?? "";
        document.body.style.position = savedPosition ?? "";
        document.body.style.top = savedTop ?? "";
        document.body.style.width = savedWidth ?? "";
        window.scrollTo(0, savedScrollY);
        savedOverflow = null;
        savedPosition = null;
        savedTop = null;
        savedWidth = null;
      }
    };
  }, [active]);
}
