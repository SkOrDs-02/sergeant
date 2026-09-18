import {
  safeReadLS,
  safeRemoveLS,
  safeWriteLS,
  webKVStore,
} from "@shared/lib/storage/storage";
import { STORAGE_KEYS, normalizeDashboardOrder } from "@sergeant/shared";

/**
 * `KVStore` adapter backed by `window.localStorage`. Used by shared
 * onboarding/engagement helpers (`countRealEntries`, `getActiveNudge`,
 * `recordLastActiveDate`, `shouldShowReengagement`) that are agnostic to
 * the storage backend (web LS vs. mobile MMKV).
 *
 * Re-exported under the legacy name for callers that imported the
 * adapter from this module before the `@sergeant/shared/storage/kv`
 * unification (PR #006). New code should import `webKVStore` directly
 * from `@shared/lib/storage`.
 */
export const localStorageStore = webKVStore;

const DASHBOARD_ORDER_KEY = STORAGE_KEYS.DASHBOARD_ORDER;

export function loadDashboardOrder() {
  return normalizeDashboardOrder(safeReadLS(DASHBOARD_ORDER_KEY, null));
}

export function saveDashboardOrder(order: string[]) {
  safeWriteLS(DASHBOARD_ORDER_KEY, order);
}

export function resetDashboardOrder() {
  safeRemoveLS(DASHBOARD_ORDER_KEY);
}
