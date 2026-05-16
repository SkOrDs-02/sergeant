import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

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
  const navigate = useNavigate();
  const [hubView, setHubViewRaw] = useState<HubView>(() =>
    readViewFromSearch(location.search),
  );

  // Keep latest location accessible to a stable `setHubView` callback so
  // we can preserve pathname + hash without re-creating the callback on
  // every location change (which would break referential equality for
  // `HubBottomNav`'s `onChange` prop).
  const locationRef = useRef(location);
  locationRef.current = location;

  const setHubView = useCallback(
    (view: HubView) => {
      setHubViewRaw(view);

      // Sync the tab to URL search params so deep-links and back button work.
      // CRITICAL: must go through react-router's `navigate` — calling
      // `window.history.pushState` directly does NOT notify the
      // `createBrowserRouter` data router (it owns its own history and only
      // listens for `popstate`), which desyncs `useLocation()` consumers
      // across the tree. The visible failure mode: subsequent `navigate()`
      // calls (e.g. clicking «Увійти» → `/sign-in`) change the URL but the
      // rendered view stays on `HubHomeView` because `AppInner`'s
      // `useLocation().pathname` still reads the stale pre-`pushState`
      // value, so `renderStandaloneRoute` falls through. See
      // `docs/initiatives/0006-frontend-routing-and-code-split.md`.
      const current = locationRef.current;
      const params = new URLSearchParams(current.search);
      if (view === "dashboard") {
        params.delete("tab");
      } else {
        params.set("tab", view);
      }
      const qs = params.toString();
      navigate(
        {
          pathname: current.pathname,
          search: qs ? `?${qs}` : "",
          hash: current.hash,
        },
        { replace: false },
      );

      // NOTE: scroll-to-top on tab switch is handled by `HubMainContent`
      // на внутрішньому scroll-контейнері `PullToRefresh`. Раніше тут стояв
      // `window.scrollTo({ top: 0, behavior: "smooth" })`, але документ
      // взагалі не скролиться (#root = `100dvh` + HubHomeView `overflow-hidden`),
      // і виклик `smooth`-скролу на iOS Safari / Capacitor триггерив візуальний
      // viewport jump: на мить з'являвся UI-бар браузера, верх отримував зайвий
      // safe-area простір, а низ підрізав bottom-nav (user feedback 2026-05-13).
    },
    [navigate],
  );

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
