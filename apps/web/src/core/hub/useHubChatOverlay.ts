import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

/**
 * Sergeant v2 Phase 7 D5 — HubChat bottom-sheet overlay.
 *
 * Locked product call (`docs/design/redesign-v2/phase-7-product-decisions-2026-05-22.md`
 * D5): HubChat opens as a bottom-sheet overlay on top of the current
 * route instead of navigating to `/chat`. The full-screen `/chat` route
 * stays mounted so notifications, push-link emails and the AIPill voice
 * commit flow (`navigate('/chat?q=…')`) still resolve to a real URL.
 *
 * In-memory only — chat state persistence is owned by `useChatSessions`
 * inside HubChat itself; reopening the overlay rehydrates from there.
 */
export interface HubChatOverlayState {
  open: boolean;
  initialMessage: string;
  autoSendInitial: boolean;
}

export interface HubChatOverlayApi extends HubChatOverlayState {
  openChat: (opts?: { initialMessage?: string; autoSend?: boolean }) => void;
  closeChat: () => void;
}

const HubChatOverlayContext = createContext<HubChatOverlayApi | null>(null);

export function useHubChatOverlayState(): HubChatOverlayApi {
  const [open, setOpen] = useState(false);
  const [initialMessage, setInitialMessage] = useState("");
  const [autoSendInitial, setAutoSendInitial] = useState(false);

  const openChat = useCallback(
    (opts?: { initialMessage?: string; autoSend?: boolean }) => {
      setInitialMessage(opts?.initialMessage ?? "");
      setAutoSendInitial(!!opts?.autoSend);
      setOpen(true);
    },
    [],
  );

  const closeChat = useCallback(() => {
    setOpen(false);
    // Clear prefill on close so the next open from Hub UX (no args)
    // starts from a fresh state rather than re-seeding the last
    // imperative prompt.
    setInitialMessage("");
    setAutoSendInitial(false);
  }, []);

  return useMemo(
    () => ({
      open,
      initialMessage,
      autoSendInitial,
      openChat,
      closeChat,
    }),
    [open, initialMessage, autoSendInitial, openChat, closeChat],
  );
}

export const HubChatOverlayProvider = HubChatOverlayContext.Provider;

/**
 * Read the overlay API from any descendant of `<HubChatOverlayProvider>`.
 * Returns a noop-shaped fallback when no provider is mounted (e.g. in
 * standalone routes like `/sign-in`) so callers don't need to null-check
 * before wiring an `onClick`.
 */
export function useHubChatOverlay(): HubChatOverlayApi {
  const ctx = useContext(HubChatOverlayContext);
  if (ctx) return ctx;
  return NOOP_API;
}

const NOOP_API: HubChatOverlayApi = {
  open: false,
  initialMessage: "",
  autoSendInitial: false,
  openChat: () => {},
  closeChat: () => {},
};
