/**
 * `useDashboardOrder` — MMKV-backed hook that owns the Hub dashboard
 * module order on mobile.
 *
 * Responsibilities:
 *  - Read/write the persisted `STORAGE_KEYS.DASHBOARD_ORDER` blob.
 *  - Normalise malformed legacy values through the shared
 *    `normalizeDashboardOrder` helper on every read.
 *  - Expose the *visible* subset of modules in the current phase plus
 *    a drop-handler (`reorderVisible(fromIdx, toIdx)`) that delegates
 *    to `reorderWithHidden` so hidden modules keep their slots.
 *
 * Cloud-sync note:
 * The `DASHBOARD_ORDER` key is deliberately *not* a tracked cloud-sync
 * key on web either (see `apps/web/src/core/cloudSync/config.ts` —
 * no registration). Matching that contract on mobile keeps the two
 * platforms in lockstep for now; promoting this key to a synced slice
 * is a separate decision tracked in the migration doc.
 */

import { useCallback, useMemo } from "react";

import {
  type DashboardModuleId,
  DEFAULT_DASHBOARD_ORDER,
  STORAGE_KEYS,
  normalizeDashboardOrder,
  reorderWithHidden,
  selectVisibleModules,
} from "@sergeant/shared";

import { useLocalStorage } from "@/lib/storage";

import { VISIBLE_DASHBOARD_MODULES } from "./dashboardModuleConfig";

export interface UseDashboardOrderReturn {
  /** Full persisted order, always normalised (length 4, known ids). */
  readonly fullOrder: readonly DashboardModuleId[];
  /** Subset of `fullOrder` currently rendered (Nutrition hidden for now). */
  readonly visibleOrder: readonly DashboardModuleId[];
  /** Move a module within the visible list; persists the new full order. */
  readonly reorderVisible: (fromIndex: number, toIndex: number) => void;
  /** Wipe the persisted order so next read returns `DEFAULT_DASHBOARD_ORDER`. */
  readonly resetOrder: () => void;
}

export function useDashboardOrder(
  visibleIds: readonly DashboardModuleId[] = VISIBLE_DASHBOARD_MODULES,
): UseDashboardOrderReturn {
  const [rawOrder, setRawOrder, removeRawOrder] = useLocalStorage<
    DashboardModuleId[]
  >(STORAGE_KEYS.DASHBOARD_ORDER, [...DEFAULT_DASHBOARD_ORDER]);

  // Defensive normalisation on every render — `useLocalStorage` hands
  // us the parsed JSON verbatim, so a legacy shorter array or an
  // unknown id would otherwise leak into the render tree.
  const fullOrder = useMemo(
    () => normalizeDashboardOrder(rawOrder),
    [rawOrder],
  );

  const visibleOrder = useMemo(
    () => selectVisibleModules(fullOrder, visibleIds),
    [fullOrder, visibleIds],
  );

  const reorderVisible = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      setRawOrder((prev) => {
        const prevNormalised = normalizeDashboardOrder(prev);
        return reorderWithHidden(
          prevNormalised,
          visibleIds,
          fromIndex,
          toIndex,
        );
      });
    },
    [setRawOrder, visibleIds],
  );

  const resetOrder = useCallback(() => {
    removeRawOrder();
  }, [removeRawOrder]);

  return { fullOrder, visibleOrder, reorderVisible, resetOrder };
}
