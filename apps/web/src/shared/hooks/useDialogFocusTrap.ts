import { useEffect, useRef, type RefObject } from "react";

export interface DialogFocusTrapOptions {
  onEscape?: (() => void) | undefined;
  /**
   * Hide everything outside the dialog from assistive tech + pointer
   * while the dialog is open (`inert` + `aria-hidden`). Opt-in because
   * this same hook also powers non-modal surfaces (Popover, radial
   * menus, the FAB speed-dial, the non-blocking workout-finish flash)
   * whose background must stay live. Pass `true` only for blocking
   * modal dialogs. See the background-inert manager below.
   */
  inertBackground?: boolean | undefined;
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
 *
 * AI-CONTEXT: The Tab-cycle above is a *keyboard-only* trap. The
 * screen-reader virtual cursor (VoiceOver/TalkBack swipe navigation)
 * ignores the Tab order and would otherwise wander the ~25+ background
 * controls behind an open modal (a11y QA prod Batch 5; WCAG 4.1.2 /
 * 1.3.1). When `inertBackground` is set we additionally mark everything
 * outside the dialog's overlay as `inert` (+ `aria-hidden` for engines
 * predating `inert`). The keyboard trap is left untouched — inert is
 * layered on top, never instead of it.
 */
export function useDialogFocusTrap(
  open: boolean,
  containerRef: RefObject<HTMLElement | null>,
  options: DialogFocusTrapOptions = {},
): void {
  const { onEscape, inertBackground } = options;
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

    // Hide the rest of the document from AT + pointer once focus is
    // safely inside the panel. We register the dialog's *overlay* (the
    // nearest fixed-position ancestor of the panel, e.g. the
    // `fixed inset-0` scrim wrapper) — not the inner panel — so the
    // scrim/backdrop that lives alongside the panel inside that overlay
    // stays interactive (tap-outside-to-dismiss keeps working).
    const inertRoot =
      inertBackground && typeof document !== "undefined"
        ? getDialogRoot(panel)
        : null;
    if (inertRoot) registerInertRoot(inertRoot);

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
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!first || !last) return;
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
      // Un-inert the background BEFORE restoring focus: the restore
      // target lives in the subtree we just inerted, and `.focus()` is a
      // no-op on an element inside an `inert` subtree.
      if (inertRoot) unregisterInertRoot(inertRoot);
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
  }, [open, containerRef, inertBackground]);
}

/* ------------------------------------------------------------------ *
 * Background-inert manager
 *
 * A single document-wide controller shared by every dialog that opts
 * into `inertBackground`. It keeps a set of open dialog *roots* (the
 * fixed overlays) and, on every change, recomputes which elements must
 * be `inert` + `aria-hidden`.
 *
 * The algorithm is the standard "hide the rest of the document" walk
 * (cf. the `aria-hidden` package used by Radix): for the union of all
 * open roots, walk each root up to <body> and mark every *sibling* on
 * that path that does not itself lead to (contain) an open root.
 *
 * Why a shared controller rather than per-hook bookkeeping:
 *   - Portal-aware. Sheet/Modal portal their overlay to <body>; an
 *     inline ConfirmDialog lives deep inside `#root`. A single body-only
 *     pass would inert nothing for the inline case; the per-level
 *     sibling walk handles both.
 *   - Stacking. A ConfirmDialog opens *inside* `#root` while a portaled
 *     Sheet has already inerted `#root`. Recomputing across all open
 *     roots un-inerts `#root` (it now contains the ConfirmDialog) and
 *     pushes inert deeper, so the top dialog never ends up inside an
 *     inert subtree. This is the real Фінік/Рутина "confirm over sheet"
 *     case.
 *   - Idempotence. We only ever remove `inert`/`aria-hidden` from
 *     elements we ourselves added it to, leaving pre-existing values
 *     (set by the app for other reasons) untouched.
 * ------------------------------------------------------------------ */

const inertRoots = new Set<HTMLElement>();
const managedEls = new Map<Element, { inert: boolean; ariaHidden: boolean }>();

/**
 * The element to keep interactive is the dialog's overlay, not the inner
 * panel: the scrim/backdrop is usually a *sibling* of the panel inside a
 * `fixed inset-0` wrapper, and inerting the panel's siblings would kill
 * tap-outside-to-dismiss. Walk up to the nearest fixed-position
 * ancestor (the overlay); fall back to the panel itself when none is
 * found. `classList` check is a jsdom-friendly fallback for Tailwind's
 * `fixed` utility, which `getComputedStyle` cannot resolve without a
 * real stylesheet.
 */
function getDialogRoot(panel: HTMLElement): HTMLElement {
  let el: HTMLElement | null = panel;
  while (el && el !== document.body) {
    let position = "";
    try {
      position = window.getComputedStyle(el).position;
    } catch {
      /* jsdom / no layout engine */
    }
    if (position === "fixed" || el.classList.contains("fixed")) return el;
    el = el.parentElement;
  }
  return panel;
}

function registerInertRoot(root: HTMLElement): void {
  inertRoots.add(root);
  syncInert();
}

function unregisterInertRoot(root: HTMLElement): void {
  inertRoots.delete(root);
  syncInert();
}

function syncInert(): void {
  // Drop roots that have been detached without a clean unregister
  // (defensive — React always runs effect cleanup, but tests wipe the
  // body directly).
  for (const root of inertRoots) {
    if (!root.isConnected) inertRoots.delete(root);
  }

  // keepAlive = every open root + all of its ancestors up to <body>.
  // These are the nodes on a path to a live dialog and must never be
  // inerted (the panel + its overlay live below a root and are reached
  // because we only ever inert *siblings*, never descendants).
  const keepAlive = new Set<Element>();
  for (const root of inertRoots) {
    let node: Element | null = root;
    while (node) {
      keepAlive.add(node);
      if (node === document.body) break;
      node = node.parentElement;
    }
  }

  // desired = siblings of every keepAlive node along each root's path
  // that do not themselves lead to an open dialog.
  const desired = new Set<Element>();
  for (const root of inertRoots) {
    let node: Element | null = root;
    while (node && node !== document.body) {
      const parent: HTMLElement | null = node.parentElement;
      if (!parent) break;
      for (const sibling of Array.from(parent.children)) {
        if (sibling === node) continue;
        if (keepAlive.has(sibling)) continue;
        desired.add(sibling);
      }
      if (parent === document.body) break;
      node = parent;
    }
  }

  // Remove inert we previously set that is no longer wanted (or whose
  // element has detached).
  for (const [el, record] of managedEls) {
    if (desired.has(el) && el.isConnected) continue;
    if (record.inert) el.removeAttribute("inert");
    if (record.ariaHidden) el.removeAttribute("aria-hidden");
    managedEls.delete(el);
  }

  // Add inert to newly-wanted elements, leaving any pre-existing
  // `inert` / `aria-hidden` (set by the app) in place so we don't clear
  // it on the way out.
  for (const el of desired) {
    if (managedEls.has(el)) continue;
    const record = { inert: false, ariaHidden: false };
    if (!el.hasAttribute("inert")) {
      el.setAttribute("inert", "");
      record.inert = true;
    }
    if (!el.hasAttribute("aria-hidden")) {
      el.setAttribute("aria-hidden", "true");
      record.ariaHidden = true;
    }
    if (record.inert || record.ariaHidden) managedEls.set(el, record);
  }
}

/**
 * Test-only: clear all manager state and any attributes we set. Unit
 * tests share this module-level controller across cases, so reset it in
 * `afterEach` to keep cases independent.
 */
export function __resetDialogInertForTests(): void {
  for (const [el, record] of managedEls) {
    if (record.inert) el.removeAttribute("inert");
    if (record.ariaHidden) el.removeAttribute("aria-hidden");
  }
  managedEls.clear();
  inertRoots.clear();
}
