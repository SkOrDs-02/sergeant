import { useEffect, useRef, type RefObject } from "react";

export interface DialogFocusTrapOptions {
  onEscape?: () => void;
}

/**
 * Tab циклічно лишається в межах контейнера; Escape викликає onEscape.
 *
 * On open, focus is moved into the panel (first focusable, or the panel
 * itself as a fallback). This is required for the trap to actually
 * function — if focus stays on a control outside the panel (e.g. on
 * `<body>` or a skip-link when a modal is auto-opened on mount), the
 * cycle-at-edges check below never fires and Tab silently escapes the
 * dialog. WCAG 2.4.3 — initial focus must land inside the dialog.
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

    // Move initial focus into the panel. Without this, modals opened
    // without a user-driven trigger (e.g. the WhatsNew release-notes
    // overlay that auto-mounts on first paint) leave focus on whatever
    // was active beforehand — usually `<body>` or the skip-link — and
    // Tab silently walks the page chrome behind the dialog. We focus
    // the first interactive descendant when one exists, falling back
    // to the panel itself (with a transient `tabindex="-1"`) so that
    // even a content-only dialog keeps focus inside.
    if (!panel.contains(document.activeElement)) {
      const initial = getFocusable()[0];
      if (initial) {
        initial.focus({ preventScroll: true });
      } else {
        const hadTabIndex = panel.hasAttribute("tabindex");
        if (!hadTabIndex) panel.setAttribute("tabindex", "-1");
        panel.focus({ preventScroll: true });
      }
    }

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
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      // If focus has somehow escaped the panel (programmatic blur, an
      // unmount that re-parented the focused node, an Esc-cancelled
      // close handler, etc.), pull it back to the appropriate edge of
      // the trap instead of letting Tab continue out of the dialog.
      if (!panel.contains(document.activeElement)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
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
