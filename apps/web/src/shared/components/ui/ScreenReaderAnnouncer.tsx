/**
 * Sergeant Design System — ScreenReaderAnnouncer
 *
 * An invisible `aria-live` region that announces dynamic content changes
 * to screen readers. Useful for:
 *  - Toast messages
 *  - Loading state changes ("Loading complete")
 *  - Counter updates ("Balance: 15,000 UAH")
 *  - Action confirmations ("Transaction saved")
 *
 * Mount once at the root of the app. Use `announce()` imperatively
 * from anywhere via the exported ref or `useAnnounce()` hook.
 *
 * @see docs/planning/ux-enhancement-plan.md — Section 7.2 (Screen reader support)
 * @see https://www.w3.org/WAI/WCAG21/Understanding/status-messages.html
 */

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Politeness = "polite" | "assertive";

interface AnnounceOptions {
  /** How urgently to announce. Default: "polite" */
  politeness?: Politeness;
}

interface AnnounceContextValue {
  /** Announce a message to screen readers */
  announce: (message: string, options?: AnnounceOptions) => void;
}

const AnnounceContext = createContext<AnnounceContextValue>({
  announce: () => {
    /* noop until provider mounts */
  },
});

/**
 * Hook to announce messages to screen readers.
 *
 * @example
 * ```tsx
 * const { announce } = useAnnounce();
 * announce("Transaction saved successfully");
 * announce("Error: invalid amount", { politeness: "assertive" });
 * ```
 */
export function useAnnounce(): AnnounceContextValue {
  return useContext(AnnounceContext);
}

/**
 * Provider that renders two invisible `aria-live` regions (polite + assertive)
 * and exposes the `announce()` function to descendants via context.
 *
 * Mount once at the app root, above any component that needs to announce.
 */
export function ScreenReaderAnnouncerProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [politeMessage, setPoliteMessage] = useState("");
  const [assertiveMessage, setAssertiveMessage] = useState("");
  const clearTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const announce = useCallback((message: string, options?: AnnounceOptions) => {
    const { politeness = "polite" } = options ?? {};

    // Clear current message first so repeated identical messages
    // still trigger a DOM change that screen readers detect.
    if (politeness === "assertive") {
      setAssertiveMessage("");
      requestAnimationFrame(() => setAssertiveMessage(message));
    } else {
      setPoliteMessage("");
      requestAnimationFrame(() => setPoliteMessage(message));
    }

    // Auto-clear after 5s to avoid stale announcements
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    clearTimerRef.current = setTimeout(() => {
      setPoliteMessage("");
      setAssertiveMessage("");
    }, 5000);
  }, []);

  return (
    <AnnounceContext.Provider value={{ announce }}>
      {children}
      {/* Visually hidden but accessible to screen readers */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {politeMessage}
      </div>
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      >
        {assertiveMessage}
      </div>
    </AnnounceContext.Provider>
  );
}
