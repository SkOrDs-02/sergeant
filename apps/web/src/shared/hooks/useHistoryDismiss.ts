/**
 * Last validated: 2026-08-02
 * Status: Active
 *
 * Makes the browser Back button close an open dialog instead of leaving
 * the route.
 *
 * On Android and in an installed PWA, Back is the primary dismiss gesture.
 * Without this, opening a sheet and pressing Back navigates the user out of
 * the module entirely and loses the half-filled form.
 *
 * Contract: while any dialog is open, exactly ONE history entry belongs to
 * the dialog layer as a whole.
 *   - `popstate` (Back pressed) → close the topmost dialog; re-arm the entry
 *     if dialogs remain open beneath it
 *   - last dialog closed any other way → pop the layer's entry
 *
 * AI-DANGER: both the one-entry-per-layer model and the `queueMicrotask` in
 * cleanup are load-bearing. The obvious per-dialog version (each `open`
 * pushes its own entry and pops it in cleanup) breaks every sheet→sheet
 * handoff. `history.back()` is asynchronous: when a click closes sheet A and
 * opens sheet B in one commit, A's cleanup queues the pop, B pushes
 * synchronously right after, and the popstate lands on B — which reads it as
 * "user pressed Back" and closes itself instantly. Measured in Chromium on
 * the Routine habit-edit flow: `back → push → popstate`, and the edit sheet
 * never became visible (`@critical deep module CRUD › routine`).
 *
 * The microtask is what makes the handoff invisible to history: React flushes
 * all passive cleanups and all passive effects synchronously in one batch, so
 * by the time the microtask runs, a sheet that took over has already
 * registered. If one did, we keep the entry and never call `back()` at all.
 * When the layer really is empty, the resulting popstate finds no dialog to
 * close and harmlessly no-ops — which is why no "ignore my own pop" flag is
 * needed. Do not replace the microtask with a synchronous check.
 *
 * Multi-step sheets are one level by design (see the beta-input-boundaries
 * spec): Back closes the whole sheet, it does not step back inside it.
 */
import { useEffect, useRef } from "react";

const MARKER = "sergeantDialog";

/** Dismiss callbacks of the currently open dialogs — topmost last. */
const openDialogs: Array<() => void> = [];
/** Whether the dialog layer currently owns a history entry. */
let entryOwned = false;
let listening = false;

function armEntry(): void {
  if (entryOwned) return;
  window.history.pushState({ [MARKER]: true }, "");
  entryOwned = true;
}

function handlePopState(): void {
  entryOwned = false;
  const top = openDialogs[openDialogs.length - 1];
  // No dialog left — this is the pop we issued when the layer closed.
  if (!top) return;
  // Re-arm before closing so the dialogs still open underneath keep Back.
  if (openDialogs.length > 1) armEntry();
  top();
}

export function useHistoryDismiss(open: boolean, onClose: () => void): void {
  // Keep the latest callback without re-running the effect — a caller
  // passing an inline arrow would otherwise push a new entry every render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    if (typeof window === "undefined" || !window.history) return;

    const close = () => onCloseRef.current();
    openDialogs.push(close);
    armEntry();
    if (!listening) {
      window.addEventListener("popstate", handlePopState);
      listening = true;
    }

    return () => {
      const index = openDialogs.lastIndexOf(close);
      if (index >= 0) openDialogs.splice(index, 1);
      queueMicrotask(() => {
        // Another dialog took over the layer — the entry stays with it.
        if (openDialogs.length > 0) return;
        if (!entryOwned) return;
        entryOwned = false;
        window.history.back();
      });
    };
  }, [open]);
}
