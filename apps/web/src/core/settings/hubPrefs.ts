import { useEffect, useState } from "react";
import { STORAGE_KEYS } from "@sergeant/shared";
import { safeReadLSValidated, safeWriteLS } from "@shared/lib/storage";
import { HubPrefsSchema, type HubPrefs } from "./hubPrefs.schema";

const HUB_PREFS_KEY = STORAGE_KEYS.HUB_PREFS;

function loadHubPrefs(): HubPrefs {
  return safeReadLSValidated(HUB_PREFS_KEY, HubPrefsSchema, {});
}

function saveHubPref(key: string, value: unknown): void {
  const prefs = loadHubPrefs();
  safeWriteLS(HUB_PREFS_KEY, { ...prefs, [key]: value });
  window.dispatchEvent(new StorageEvent("storage", { key: HUB_PREFS_KEY }));
}

/**
 * Reactive single-pref hook that stays in sync with cross-tab `storage`
 * events and the same-tab StorageEvent dispatched by `saveHubPref`.
 */
export function useHubPref<T>(
  key: string,
  defaultValue: T,
): [T, (next: T) => void] {
  const read = (): T => {
    const prefs = loadHubPrefs();
    return key in prefs ? (prefs[key] as T) : defaultValue;
  };
  const [value, setValue] = useState<T>(read);

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === HUB_PREFS_KEY || e.key === null) setValue(read());
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
    // `read`/`setValue` excluded — `read` is stable for a given `key`,
    // `setValue` is a React setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = (next: T) => {
    setValue(next);
    saveHubPref(key, next);
  };

  return [value, update];
}
