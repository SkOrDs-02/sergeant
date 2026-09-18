/**
 * Mobile hook that feeds the `StatusRow` preview section.
 *
 * Reads raw per-module quick-stats JSON from MMKV (keys
 * `finyk_quick_stats`, `fizruk_quick_stats`, `routine_quick_stats`,
 * `nutrition_quick_stats` — same names as web localStorage) and
 * delegates to the pure `selectModulePreview` helper from
 * `@sergeant/shared` to compute `{main, sub, progress?}`.
 *
 * Writers for the mobile side land module-by-module as part of the
 * migration plan (finyk / fizruk / routine already on web, nutrition
 * gated until Phase 7). Until a writer ships for a given module
 * MMKV returns `null`, the pure helper returns `{main: null, sub:
 * null}`, and `StatusRow` renders without a preview — graceful
 * degradation by construction.
 *
 * Today we poll lazily (compute once per mount + on any navigation-
 * driven refocus). A follow-up PR will swap this for an MMKV event
 * subscription once `react-native-mmkv` exposes per-key listeners
 * through our storage adapter.
 */

import { useMemo, useSyncExternalStore } from "react";

import {
  QUICK_STATS_MODULE_IDS,
  type ModulePreview,
  selectModulePreview,
} from "@sergeant/shared";
import type { DashboardModuleId } from "@sergeant/shared";

import { _getMMKVInstance, safeReadStringLS } from "@/lib/storage";

export type ModulePreviewsMap = Partial<
  Record<DashboardModuleId, ModulePreview | null>
>;

const QUICK_STATS_KEYS: ReadonlyArray<{
  moduleId: DashboardModuleId;
  key: string;
}> = QUICK_STATS_MODULE_IDS.map((moduleId) => ({
  moduleId,
  key: `${moduleId}_quick_stats`,
}));

type QuickStatsSnapshot = Readonly<Record<string, string | null>>;

// Module-scoped cache of the last snapshot returned to React.
// `useSyncExternalStore` requires getSnapshot() to return the same
// reference unless the underlying data actually changed — otherwise
// it treats every call as a state change and re-renders forever.
let cachedSnapshot: QuickStatsSnapshot | null = null;

function readCurrentSnapshot(): QuickStatsSnapshot {
  const next: Record<string, string | null> = {};
  for (const { key } of QUICK_STATS_KEYS) {
    next[key] = safeReadStringLS(key);
  }
  if (cachedSnapshot) {
    let equal = true;
    for (const { key } of QUICK_STATS_KEYS) {
      if (cachedSnapshot[key] !== next[key]) {
        equal = false;
        break;
      }
    }
    if (equal) return cachedSnapshot;
  }
  cachedSnapshot = next;
  return cachedSnapshot;
}

/**
 * Build a live snapshot of MMKV reads across every quick-stats key.
 * `useSyncExternalStore` treats referentially-equal snapshots as
 * "no change" — so we memoise on the concatenation of the raw
 * strings per key and only rebuild the map when at least one of
 * them actually differs.
 */
function useQuickStatsSnapshot(): QuickStatsSnapshot {
  return useSyncExternalStore(
    (onStoreChange) => {
      const mmkv = _getMMKVInstance();
      const sub = mmkv.addOnValueChangedListener((changedKey) => {
        if (QUICK_STATS_KEYS.some(({ key }) => key === changedKey)) {
          cachedSnapshot = null;
          onStoreChange();
        }
      });
      return () => sub.remove();
    },
    readCurrentSnapshot,
    // SSR snapshot is meaningless on native; keep symmetry with web.
    readCurrentSnapshot,
  );
}

export function useModulePreviews(): ModulePreviewsMap {
  const snapshot = useQuickStatsSnapshot();

  return useMemo(() => {
    const map: ModulePreviewsMap = {};
    for (const { moduleId, key } of QUICK_STATS_KEYS) {
      map[moduleId] = selectModulePreview(moduleId, snapshot[key] ?? null);
    }
    return map;
  }, [snapshot]);
}
