import { useSyncExternalStore } from "react";

const LOCATION_CHANGE_EVENT = "sergeant:browser-location-change";

let historyPatched = false;
let browserLocationChangeCount = 0;

function emitLocationChange(): void {
  browserLocationChangeCount += 1;
  window.dispatchEvent(new Event(LOCATION_CHANGE_EVENT));
}

function ensureHistoryPatch(): void {
  if (historyPatched || typeof window === "undefined") return;
  historyPatched = true;

  const { history } = window;
  const pushState = history.pushState.bind(history);
  const replaceState = history.replaceState.bind(history);

  history.pushState = (...args) => {
    const result = pushState(...args);
    emitLocationChange();
    return result;
  };

  history.replaceState = (...args) => {
    const result = replaceState(...args);
    emitLocationChange();
    return result;
  };
}

function getSnapshot(): string {
  if (typeof window === "undefined") return "0\n/";
  return `${browserLocationChangeCount}\n${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function subscribe(onStoreChange: () => void): () => void {
  ensureHistoryPatch();
  const onNativeLocationChange = () => emitLocationChange();
  window.addEventListener(LOCATION_CHANGE_EVENT, onStoreChange);
  window.addEventListener("popstate", onNativeLocationChange);
  window.addEventListener("hashchange", onNativeLocationChange);
  return () => {
    window.removeEventListener(LOCATION_CHANGE_EVENT, onStoreChange);
    window.removeEventListener("popstate", onNativeLocationChange);
    window.removeEventListener("hashchange", onNativeLocationChange);
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
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => "0\n/");
  const separatorIndex = snapshot.indexOf("\n");
  const changeCount =
    separatorIndex >= 0 ? Number(snapshot.slice(0, separatorIndex)) : 0;

  if (changeCount === 0 && routerLocation) {
    return routerLocation;
  }

  const locationPart =
    separatorIndex >= 0 ? snapshot.slice(separatorIndex + 1) : snapshot;
  const hashIndex = locationPart.indexOf("#");
  const withoutHash =
    hashIndex >= 0 ? locationPart.slice(0, hashIndex) : locationPart;
  const hash = hashIndex >= 0 ? locationPart.slice(hashIndex) : "";
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
