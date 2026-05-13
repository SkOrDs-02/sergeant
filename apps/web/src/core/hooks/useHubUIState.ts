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

// Onboarding is now a URL-addressable route (`/welcome`) owned by
// `AppInner`; it no longer lives in hub UI state. The chat panel was
// also lifted out to its own route (`/chat`) — see `HubChatPage` — so
// this hook tracks only search/hub-view.
export interface HubUIState {
  searchOpen: boolean;
  hubView: HubView;
  setHubView: (view: HubView) => void;
  setSearchOpen: (value: boolean) => void;
  closeSearch: () => void;
}

export function useHubUIState(): HubUIState {
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

    // NOTE: scroll-to-top on tab switch is handled by `HubMainContent`
    // на внутрішньому scroll-контейнері `PullToRefresh`. Раніше тут стояв
    // `window.scrollTo({ top: 0, behavior: "smooth" })`, але документ
    // взагалі не скролиться (#root = `100dvh` + HubHomeView `overflow-hidden`),
    // і виклик `smooth`-скролу на iOS Safari / Capacitor триггерив візуальний
    // viewport jump: на мить з'являвся UI-бар браузера, верх отримував зайвий
    // safe-area простір, а низ підрізав bottom-nav (user feedback 2026-05-13).
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

  const closeSearch = useCallback(() => setSearchOpen(false), []);

  return {
    searchOpen,
    hubView,
    setHubView,
    setSearchOpen,
    closeSearch,
  };
}
