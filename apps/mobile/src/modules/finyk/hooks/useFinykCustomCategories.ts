/**
 * Hook for Finyk custom categories — mobile canonical read/write path.
 *
 * Replaces the legacy `useLocalStorage(STORAGE_KEYS.FINYK_CUSTOM_CATS, [])`
 * pattern that wrote directly to MMKV. The read source is now the SQLite
 * warm cache (`finyk_custom_categories` table) populated by
 * `bootFinykSqliteReadPath`. Writes go exclusively through the dual-write
 * pipeline (`triggerFinykDualWrite`) so they land in SQLite and propagate
 * through cloud-sync — no MMKV write.
 *
 * The `useFinykSqliteReadTick()` subscription ensures the returned list
 * re-renders whenever the cache is refreshed (boot or write-through).
 *
 * Part of the dual-write teardown migration tracked in the storage-roadmap.
 */

import { useCallback, useState } from "react";

import { getCachedFinykSqliteState } from "../lib/sqliteReader";
import { useFinykSqliteReadTick } from "../lib/sqliteReadGate";
import { blobsFromArray, stateWithSlice } from "../lib/sqliteWriter/extract";
import { triggerFinykDualWrite } from "../lib/sqliteWriter";

export interface CustomCategory {
  id: string;
  label: string;
}

type SetCustomCategories = (
  updater: (prev: CustomCategory[]) => CustomCategory[],
) => void;

export interface UseFinykCustomCategoriesReturn {
  customCategories: CustomCategory[];
  setCustomCategories: SetCustomCategories;
}

/**
 * Read custom categories from the SQLite warm cache and write mutations
 * through the dual-write pipeline. Reactivity is provided by
 * `useFinykSqliteReadTick`.
 */
export function useFinykCustomCategories(): UseFinykCustomCategoriesReturn {
  const [customCategories, setLocalState] = useState<CustomCategory[]>(() => {
    const cached = getCachedFinykSqliteState().customCategories;
    // Strip optional `emoji` field — the settings screen only needs
    // `id` and `label` for its add/remove affordances.
    return cached.map(({ id, label }) => ({ id, label: label ?? "" }));
  });

  // Overlay from the warm cache every time the SQLite tick advances
  // (after boot or after a write-through). Render-time update avoids
  // the `react-hooks/set-state-in-effect` violation (initiative 0021).
  const sqliteCacheTick = useFinykSqliteReadTick();
  const [prevTick, setPrevTick] = useState(sqliteCacheTick);
  if (sqliteCacheTick !== prevTick) {
    setPrevTick(sqliteCacheTick);
    const cache = getCachedFinykSqliteState();
    if (cache.refreshedAt !== null) {
      setLocalState(
        cache.customCategories.map(({ id, label }) => ({
          id,
          label: label ?? "",
        })),
      );
    }
  }

  const setCustomCategories: SetCustomCategories = useCallback((updater) => {
    setLocalState((prev) => {
      const next = updater(prev);
      triggerFinykDualWrite(
        stateWithSlice("customCategories", blobsFromArray(prev)),
        stateWithSlice("customCategories", blobsFromArray(next)),
      );
      return next;
    });
  }, []);

  return { customCategories, setCustomCategories };
}
