import { useSyncExternalStore } from "react";

const LOCATION_CHANGE_EVENT = "sergeant:browser-location-change";

// Snapshot is captured at event time (popstate / hashchange), not read lazily
// from window.location in getSnapshot(). Reading window.location lazily inside
// getSnapshot would cause React's useSyncExternalStore tearing-check to see a
// snapshot change on every pushState (because window.location mutates
// synchronously) — even without calling onStoreChange. React would then fire an
// urgent synchronous re-render to fix the "tearing", which preempts React
// Router 7's startTransition-based location transition, causing RouterProvider's
// useState to never commit the new route. Capturing the snapshot at event time
// means getSnapshot returns a stable value between events, letting RR's
// transition commit uninterrupted.
let locationSnapshot = "";

function captureSnapshot(): void {
  locationSnapshot = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.dispatchEvent(new Event(LOCATION_CHANGE_EVENT));
}

function getSnapshot(): string {
  if (typeof window === "undefined") return "";
  return locationSnapshot;
}

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener(LOCATION_CHANGE_EVENT, onStoreChange);
  window.addEventListener("popstate", captureSnapshot);
  window.addEventListener("hashchange", captureSnapshot);
  return () => {
    window.removeEventListener(LOCATION_CHANGE_EVENT, onStoreChange);
    window.removeEventListener("popstate", captureSnapshot);
    window.removeEventListener("hashchange", captureSnapshot);
  };
}

export interface BrowserLocationSnapshot {
  pathname: string;
  search: string;
  hash: string;
}

export function useBrowserLocation(
  routerLocation?: BrowserLocationSnapshot,
): BrowserLocationSnapshot {
  // snapshot is "" until the first popstate/hashchange event fires
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => "");

  if (!snapshot && routerLocation) {
    // No native location event yet — defer to React Router's own location
    // (the normal case for all pushState-driven navigations).
    return routerLocation;
  }

  // A popstate or hashchange event fired: parse the captured snapshot.
  const hashIndex = snapshot.indexOf("#");
  const withoutHash = hashIndex >= 0 ? snapshot.slice(0, hashIndex) : snapshot;
  const hash = hashIndex >= 0 ? snapshot.slice(hashIndex) : "";
  const searchIndex = withoutHash.indexOf("?");
  const pathname =
    searchIndex >= 0 ? withoutHash.slice(0, searchIndex) : withoutHash;
  const search = searchIndex >= 0 ? withoutHash.slice(searchIndex) : "";

  return {
    pathname: pathname || "/",
    search,
    hash,
  };
}
