import { useEffect, useRef } from "react";

export type NavChordTarget =
  | "hub"
  | "finyk"
  | "fizruk"
  | "routine"
  | "nutrition";

interface HubKeyboardShortcutsOptions {
  onOpenSearch: () => void;
  onOpenShortcuts: () => void;
  /** Cmd/Ctrl+/ — open AI assistant drawer */
  onOpenAssistant?: () => void;
  /**
   * G+<letter> chord navigation.
   * H=hub, F=finyk, Z=fizruk, R=routine, N=nutrition
   */
  onNavigate?: (target: NavChordTarget) => void;
}

/** Map the second key of a G-chord to a navigation target. */
const G_CHORD_MAP: Record<string, NavChordTarget> = {
  h: "hub",
  f: "finyk",
  z: "fizruk",
  r: "routine",
  n: "nutrition",
};

/** Timeout (ms) for the G-chord second-key window. */
const CHORD_TIMEOUT_MS = 1000;

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

/**
 * Returns the nearest ancestor `<form>` element (or the element itself if it
 * is a form). Used for R6 Cmd+S context-aware save mitigation.
 */
function getNearestForm(target: EventTarget | null): HTMLFormElement | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest("form");
  return el ?? null;
}

export function useHubKeyboardShortcuts({
  onOpenSearch,
  onOpenShortcuts,
  onOpenAssistant,
  onNavigate,
}: HubKeyboardShortcutsOptions) {
  // Track whether we are in the G-chord first-key window.
  const gPendingRef = useRef(false);
  const gTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearGPending = () => {
      gPendingRef.current = false;
      if (gTimerRef.current !== null) {
        clearTimeout(gTimerRef.current);
        gTimerRef.current = null;
      }
    };

    const handler = (event: KeyboardEvent) => {
      // ── G-chord second-key resolution (runs before editable-target guard
      //    so chord stays responsive when focus happens to be in a non-editable
      //    descendant that triggered the G press). Guard still applies for the
      //    second key itself.
      if (gPendingRef.current) {
        clearGPending();
        // If the second key lands in an editable field, let it through.
        if (!isEditableTarget(event.target)) {
          const target = G_CHORD_MAP[event.key.toLowerCase()];
          if (target && onNavigate) {
            event.preventDefault();
            onNavigate(target);
            return;
          }
        }
        // Fall through — unrecognised second key or editable target.
      }

      // ── Global guard: don't steal keys from inputs/textareas/etc.
      if (isEditableTarget(event.target)) return;

      const mod = event.metaKey || event.ctrlKey;

      // Cmd/Ctrl+K — Hub Search
      if (mod && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenSearch();
        return;
      }

      // Cmd/Ctrl+/ — AI Assistant drawer
      if (mod && event.key === "/") {
        event.preventDefault();
        onOpenAssistant?.();
        return;
      }

      // Cmd/Ctrl+S — context-aware save (R6 mitigation).
      // Only preventDefault when focus is inside a <form> to avoid
      // overriding the browser Save-Page dialog in non-form contexts.
      if (mod && event.key.toLowerCase() === "s") {
        const form = getNearestForm(event.target);
        if (form) {
          event.preventDefault();
          // Dispatch a submit event so any `onSubmit` / `useApiForm`
          // handler fires — mirrors what pressing a submit-type button does.
          form.requestSubmit();
        }
        // No preventDefault and no action outside of a form context.
        return;
      }

      // ? — open shortcuts modal
      if (!mod && event.key === "?") {
        event.preventDefault();
        onOpenShortcuts();
        return;
      }

      // G — first key of chord; open a 1 s window for the second key
      if (!mod && event.key.toLowerCase() === "g" && onNavigate) {
        gPendingRef.current = true;
        gTimerRef.current = setTimeout(clearGPending, CHORD_TIMEOUT_MS);
      }
    };

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      clearGPending();
    };
  }, [onOpenSearch, onOpenShortcuts, onOpenAssistant, onNavigate]);
}
