/**
 * Active modules — derived from the user's onboarding "vibe picks"
 * plus a "hide inactive" UI toggle.
 *
 * The onboarding wizard step 2 ("Що тобі важливо?") writes the user's
 * selection to {@link VIBE_PICKS_KEY}. Any module not in that list is
 * considered *inactive* on the Hub dashboard:
 *  - it still renders, but in a muted/greyed-out state;
 *  - its quick-add affordance is suppressed;
 *  - a hint points the user at Hub Settings to reactivate it.
 *
 * If the persisted picks list is missing or empty (e.g. fresh install,
 * cleared storage, or the user tapped through the wizard without
 * selecting anything — see `buildFinalPicks`'s ALL_MODULES fallback),
 * we fall back to "all modules active" so existing accounts behave
 * identically to before this feature landed.
 *
 * The {@link HIDE_INACTIVE_MODULES_KEY} toggle (default: `false`)
 * lets the user collapse the inactive tiles entirely instead of
 * showing them muted.
 *
 * DOM-free: callers wire the platform-specific {@link KVStore}
 * (localStorage on web, MMKV on mobile).
 */

import { type DashboardModuleId } from "./dashboard";
import { type KVStore } from "./kvStore";
import { ALL_MODULES, getVibePicks, saveVibePicks } from "./vibePicks";

/**
 * localStorage / MMKV key for the "hide inactive modules" boolean
 * toggle. Stored as the literal string `"1"` when on; absent or any
 * other value means off.
 */
export const HIDE_INACTIVE_MODULES_KEY = "hub_hide_inactive_modules_v1";

/**
 * Return the set of modules the user marked as active during
 * onboarding (or via Hub Settings). Falls back to {@link ALL_MODULES}
 * when the picks list is missing or empty so legacy accounts and
 * fresh installs render every module by default.
 */
export function getActiveModules(store: KVStore): DashboardModuleId[] {
  const picks = getVibePicks(store);
  return picks.length > 0 ? picks : [...ALL_MODULES];
}

/**
 * Persist the user's active-module selection. A no-op-style empty
 * input is intentionally allowed — `getActiveModules` will then fall
 * back to "all modules" until the user picks again.
 */
export function setActiveModules(
  store: KVStore,
  ids: readonly DashboardModuleId[],
): void {
  saveVibePicks(store, ids);
}

/** True when {@link id} is in the user's active-module list. */
export function isActiveModule(
  active: readonly DashboardModuleId[],
  id: DashboardModuleId,
): boolean {
  return active.includes(id);
}

/** True when the user has opted to hide inactive modules entirely. */
export function getHideInactiveModules(store: KVStore): boolean {
  return store.getString(HIDE_INACTIVE_MODULES_KEY) === "1";
}

/**
 * Persist the "hide inactive modules" toggle. `true` writes `"1"`,
 * `false` removes the key so a future read returns the default
 * (`false`).
 */
export function setHideInactiveModules(store: KVStore, hide: boolean): void {
  if (hide) {
    store.setString(HIDE_INACTIVE_MODULES_KEY, "1");
  } else {
    store.remove(HIDE_INACTIVE_MODULES_KEY);
  }
}

/**
 * Flip the "hide inactive modules" toggle. Returns the new value so
 * callers can update local component state without a second read.
 */
export function toggleHideInactiveModules(store: KVStore): boolean {
  const next = !getHideInactiveModules(store);
  setHideInactiveModules(store, next);
  return next;
}
