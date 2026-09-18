import { useEffect } from "react";

interface Options {
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  onToggleExplicitPause: () => void;
  enabled?: boolean;
}

const INTERACTIVE_SELECTOR =
  'button,a,input,textarea,select,[role="button"],[contenteditable="true"]';

/**
 * Window-level keyboard shortcuts for the stories overlay.
 *
 * Space/Enter/Arrow events are ignored when the current focus target is
 * already an interactive element — otherwise Space on the close button
 * would toggle pause instead of activating the button (a11y regression).
 */
export function useStoriesKeyboard({
  onNext,
  onPrev,
  onClose,
  onToggleExplicitPause,
  enabled = true,
}: Options): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        target.closest(INTERACTIVE_SELECTOR)
      ) {
        // Let buttons/links/inputs handle their native keyboard semantics.
        return;
      }
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") onNext();
      else if (e.key === "ArrowLeft") onPrev();
      else if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        onToggleExplicitPause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, onNext, onPrev, onClose, onToggleExplicitPause]);
}
