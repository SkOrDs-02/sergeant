import { useEffect, useRef, type RefObject } from "react";

export interface DialogFocusTrapOptions {
  onEscape?: () => void;
}

/**
 * Tab циклічно лишається в межах контейнера; Escape викликає onEscape.
 *
 * Additionally, the element that was focused when the dialog opened is
 * remembered and receives focus back after the dialog closes. This is a
 * WCAG 2.4.3 (Focus Order) requirement — otherwise a keyboard user who
 * triggers a modal and dismisses it is dropped on `<body>` and has to
 * re-traverse the whole page to get back to where they were.
 *
 * If the previously focused element is no longer in the DOM when the
 * dialog closes (e.g. a sheet that unmounts its own trigger), we quietly
 * skip the restore instead of throwing.
 *
 * `onEscape` is intentionally NOT in the effect dependency array. It is
 * stored in a ref and read on each keydown. Most callers pass an inline
 * arrow (`onEscape: () => setOpen(false)`) whose identity changes on
 * every parent render — if we depended on it, every parent re-render
 * while the dialog was open would tear down the effect and run the
 * focus-restore cleanup, yanking focus out of the open dialog back to
 * the trigger element. This is the "Store Event Handlers in Refs" rule
 * from AGENTS.md §8.3.
 */
export function useDialogFocusTrap(
  open: boolean,
  containerRef: RefObject<HTMLElement | null>,
  options: DialogFocusTrapOptions = {},
): void {
  const { onEscape } = options;
  const onEscapeRef = useRef(onEscape);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Keep the latest onEscape callable without re-running the trap effect.
  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!open) return;
    const panel = containerRef.current;
    if (!panel) return;

    // Snapshot the currently-focused element so we can restore focus
    // after the dialog closes. Skip body itself — restoring focus to
    // <body> is identical to losing focus entirely.
    const active = document.activeElement;
    previouslyFocusedRef.current =
      active instanceof HTMLElement && active !== document.body ? active : null;

    const getFocusable = (): HTMLElement[] =>
      Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(
        (el) =>
          !el.hasAttribute("disabled") &&
          el.getAttribute("aria-hidden") !== "true",
      );

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const cb = onEscapeRef.current;
        if (cb) {
          e.preventDefault();
          cb();
          return;
        }
      }
      if (e.key !== "Tab") return;
      const nodes = getFocusable();
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last!.focus()!;
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first!.focus()!;
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const el = previouslyFocusedRef.current;
      previouslyFocusedRef.current = null;
      if (!el) return;
      // The trigger may have unmounted while the dialog was open
      // (e.g. tapping a card button that is re-rendered into a new
      // position). Guard against focusing an orphaned node.
      if (!el.isConnected) return;
      try {
        el.focus({ preventScroll: true });
      } catch {
        /* ignore — element became non-focusable */
      }
    };
    // onEscape is read via a ref — see block comment above.
  }, [open, containerRef]);
}
