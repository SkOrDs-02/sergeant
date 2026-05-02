import { useEffect, useRef, type RefObject } from "react";

/**
 * Hook to trap focus within a container element.
 * Used for modals, dialogs, and other overlay components.
 *
 * - Traps Tab/Shift+Tab focus cycling within the container
 * - Auto-focuses first focusable element on mount
 * - Restores focus to previously focused element on unmount
 * - Handles Escape key to close
 */
export function useFocusTrap<T extends HTMLElement>(
  enabled: boolean,
  onClose?: () => void,
): RefObject<T> {
  const containerRef = useRef<T>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!enabled) return;

    // Store currently focused element
    previousFocusRef.current = document.activeElement as HTMLElement;

    const container = containerRef.current;
    if (!container) return;

    // Get all focusable elements
    const getFocusableElements = () => {
      const focusableSelectors = [
        "button:not([disabled])",
        "input:not([disabled])",
        "select:not([disabled])",
        "textarea:not([disabled])",
        "a[href]",
        '[tabindex]:not([tabindex="-1"])',
      ].join(", ");

      return Array.from(
        container.querySelectorAll<HTMLElement>(focusableSelectors),
      ).filter(
        (el) => !el.hasAttribute("disabled") && el.offsetParent !== null, // visible
      );
    };

    // Focus first focusable element
    const focusables = getFocusableElements();
    if (focusables.length > 0) {
      // Small delay to ensure modal is fully rendered
      requestAnimationFrame(() => {
        focusables[0].focus();
      });
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // Handle Escape
      if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
        return;
      }

      // Handle Tab
      if (e.key === "Tab") {
        const focusables = getFocusableElements();
        if (focusables.length === 0) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        // Shift+Tab on first element -> focus last
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
          return;
        }

        // Tab on last element -> focus first
        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
          return;
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);

      // Restore focus to previously focused element
      if (
        previousFocusRef.current &&
        typeof previousFocusRef.current.focus === "function"
      ) {
        previousFocusRef.current.focus();
      }
    };
  }, [enabled, onClose]);

  return containerRef;
}
