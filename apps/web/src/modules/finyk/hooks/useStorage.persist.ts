import { useState, useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { readJSON, writeJSONDebounced } from "../lib/finykStorage";

export function reportSilentError(scope: string, error: unknown) {
  console.warn(`[finyk] ${scope}`, error);
}

// Визначаємо "очікувану форму" за дефолтом: array / plain-object / скаляр.
// Це дозволяє тихо відкинути пошкоджений JSON у localStorage (наприклад,
// коли ключ випадково був перезаписаний іншим модулем або ручною правкою)
// і ввімкнути модуль з дефолтом, замість того щоб падати на мапах/фільтрах.
export function matchesShape(value: unknown, defaultVal: unknown): boolean {
  if (Array.isArray(defaultVal)) return Array.isArray(value);
  if (defaultVal && typeof defaultVal === "object") {
    return value != null && typeof value === "object" && !Array.isArray(value);
  }
  return true;
}

/**
 * LS-backed persisted slot. Reads from localStorage on init, writes
 * back via debounced `writeJSONDebounced` on every state change.
 *
 * Stage 8 PR #057k-tombstone: only used for the 3 keys that are NOT
 * yet mirrored to SQLite (`excludedStatTxIds`, `dismissedRecurring`,
 * `networthSnapshotRef`). The 14 dual-write-covered keys have moved
 * to {@link useReadonlyPersist} — LS read for first-paint fallback,
 * no LS write (dual-write pipeline handles persistence).
 */
export function usePersist<T>(
  key: string,
  defaultVal: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [val, setVal] = useState<T>(() => {
    const stored = readJSON(key, defaultVal);
    if (!matchesShape(stored, defaultVal)) {
      reportSilentError(`usePersist shape mismatch ("${key}")`, stored);
      return defaultVal;
    }
    return stored as T;
  });
  useEffect(() => {
    writeJSONDebounced(key, val);
  }, [key, val]);
  return [val, setVal];
}

/**
 * Read-only persisted slot — reads from localStorage on init as a
 * synchronous first-paint fallback, but does NOT write back to LS.
 *
 * Stage 8 PR #057k-tombstone: replaces `usePersist` for the 14 Finyk
 * keys that are covered by the SQLite dual-write pipeline. The SQLite
 * overlay (`useFinykStorageSlots` → `useEffect` on `sqliteCacheTick`)
 * snaps in the canonical values once the cache is warm; mutations flow
 * through `useFinykDualWriteSync` → `triggerFinykDualWrite` only.
 */
export function useReadonlyPersist<T>(
  key: string,
  defaultVal: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [val, setVal] = useState<T>(() => {
    const stored = readJSON(key, defaultVal);
    if (!matchesShape(stored, defaultVal)) {
      reportSilentError(`useReadonlyPersist shape mismatch ("${key}")`, stored);
      return defaultVal;
    }
    return stored as T;
  });
  return [val, setVal];
}
