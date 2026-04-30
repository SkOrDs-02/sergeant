import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

export type HubView = "dashboard" | "reports" | "profile" | "settings";

const VALID_VIEWS = new Set<string>([
  "dashboard",
  "reports",
  "profile",
  "settings",
]);

function readViewFromSearch(search: string): HubView {
  try {
    const param = new URLSearchParams(search).get("tab");
    if (param && VALID_VIEWS.has(param)) return param as HubView;
  } catch {
    /* SSR / non-browser */
  }
  return "dashboard";
}

/** Options for `openChat`. */
export interface OpenChatOptions {
  /**
   * If true, the assistant immediately sends `message` instead of
   * prefilling it into the input. Used by the catalogue page when the
   * user taps a `requiresInput=false` capability.
   */
  autoSend?: boolean;
}

// Onboarding is now a URL-addressable route (`/welcome`) owned by
// `AppInner`; it no longer lives in hub UI state. The router handles
// gating and redirects, so this hook only tracks chat/search/hub-view.
export interface HubUIState {
  chatOpen: boolean;
  /**
   * When `true`, the chat dialog is mounted but visually collapsed to a
   * floating "minimize FAB" — the conversation, draft input, and active
   * request are preserved so the user can consult other modules without
   * losing context. Independent of `chatOpen` so the chat can be fully
   * dismissed (`closeChat`) without going through a minimized state.
   */
  chatMinimized: boolean;
  /** Number of assistant replies that arrived while minimized; surfaces as a
   *  badge on the FAB. Reset to 0 when the chat is restored. */
  chatUnseenCount: number;
  chatInitialMessage: string | null;
  chatAutoSend: boolean;
  searchOpen: boolean;
  hubView: HubView;
  setHubView: (view: HubView) => void;
  setSearchOpen: (value: boolean) => void;
  openChat: (message?: string | null, options?: OpenChatOptions) => void;
  closeChat: () => void;
  minimizeChat: () => void;
  restoreChat: () => void;
  setChatUnseenCount: (count: number) => void;
  closeSearch: () => void;
}

export function useHubUIState(): HubUIState {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMinimized, setChatMinimized] = useState(false);
  const [chatUnseenCount, setChatUnseenCount] = useState(0);
  const [chatInitialMessage, setChatInitialMessage] = useState<string | null>(
    null,
  );
  const [chatAutoSend, setChatAutoSend] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const location = useLocation();
  const [hubView, setHubViewRaw] = useState<HubView>(() =>
    readViewFromSearch(location.search),
  );

  const setHubView = useCallback((view: HubView) => {
    setHubViewRaw(view);

    // Sync the tab to URL search params so deep-links and back button work.
    const url = new URL(window.location.href);
    if (view === "dashboard") {
      url.searchParams.delete("tab");
    } else {
      url.searchParams.set("tab", view);
    }
    window.history.pushState(null, "", url.toString());

    // Scroll to top when switching tabs.
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // Re-sync `hubView` whenever the URL search params change, regardless of
  // how the change was triggered — this covers (a) browser back/forward
  // (popstate, picked up by react-router and reflected in `useLocation()`),
  // (b) react-router `navigate()` calls that update the search string
  // without going through `setHubView` (e.g. the `/profile → /?tab=profile`
  // legacy redirect in `App.tsx`), and (c) any other code path that mutates
  // `window.history` outside this hook. Without this, an external
  // `navigate()` to `/?tab=profile` would change the address bar but leave
  // `hubView` stuck on its initial value (typically `"dashboard"`).
  useEffect(() => {
    setHubViewRaw(readViewFromSearch(location.search));
  }, [location.search]);

  const openChat = useCallback(
    (message: string | null = null, options: OpenChatOptions = {}) => {
      setChatInitialMessage(message || null);
      setChatAutoSend(Boolean(options.autoSend && message));
      setChatOpen(true);
      setChatMinimized(false);
      setChatUnseenCount(0);
    },
    [],
  );

  const closeChat = useCallback(() => {
    setChatOpen(false);
    setChatMinimized(false);
    setChatUnseenCount(0);
    setChatInitialMessage(null);
    setChatAutoSend(false);
  }, []);

  const minimizeChat = useCallback(() => {
    setChatMinimized(true);
  }, []);

  const restoreChat = useCallback(() => {
    setChatMinimized(false);
    setChatUnseenCount(0);
  }, []);

  const closeSearch = useCallback(() => setSearchOpen(false), []);

  return {
    chatOpen,
    chatMinimized,
    chatUnseenCount,
    chatInitialMessage,
    chatAutoSend,
    searchOpen,
    hubView,
    setHubView,
    setSearchOpen,
    openChat,
    closeChat,
    minimizeChat,
    restoreChat,
    setChatUnseenCount,
    closeSearch,
  };
}
