/**
 * Logout data-purge for `apps/web` (shared-device privacy fix).
 *
 * Signing out drops the **server** session, but historically left every
 * local-first store in place: the next person on a shared device could open
 * DevTools and read the previous user's transactions, water log, hub prefs,
 * etc. (browser-QA finding 2026-06-15). `AuthContext.logout` calls
 * {@link purgeAppOwnedLocalData} to clear the app-owned slices of every
 * physical store the previous user populated.
 *
 * **Allowlist, not denylist.** We only remove keys we recognise as app-owned
 * (the `@sergeant/shared` `STORAGE_KEYS` registry + the prefix families below +
 * the sqlite-wasm `kvvfs-*` backing store). Foreign keys — PostHog (`ph_*`),
 * Sentry, Better-Auth — are never matched, so we don't nuke another origin's
 * data blindly.
 *
 * Scope (what this clears):
 *   - physical `localStorage` app keys, incl. the LS-only fallback copies that
 *     never travel through `webKVStore` and the `kvvfs-*` SQLite store;
 *   - the in-memory SQLite warm-cache (`resetKvStoreBoot`);
 *   - the React-Query IndexedDB persister snapshot (a cache of server data).
 *
 * Deliberately **out of scope** (see PR notes — owner decision):
 *   - the per-user OPFS SQLite DB file → handled by `wipeSqliteDb()` in
 *     `AuthContext.logout`; other users' files stay isolated by filename;
 *   - the authoritative nutrition IndexedDB stores (saved recipes, meal
 *     photos, food/barcode catalogue) and the `sync_meta` offline-op queue —
 *     clearing those risks losing un-synced local-first data, so they want a
 *     per-user partition (or flush-then-clear) rather than a blind wipe.
 */

import { STORAGE_KEYS } from "@sergeant/shared";
// eslint-disable-next-line sergeant-design/no-flat-shared-lib -- log/ is a real subdir; mirrors storageManager.ts.
import { logger } from "../log";
import { SERGEANT_STORE, dbDel } from "../idb/sergeantDb";
import { resolveLsStore } from "./storage";
import { resetKvStoreBoot } from "../../../core/db/kvStoreBoot";

/**
 * Prefix families for app-owned `localStorage` keys whose exact names are
 * versioned / dynamic (e.g. `hub_weekly_digest_<date>`,
 * `finyk_tx_day_collapse_v1`, `sergeant.profile.<x>.open`) and so are not all
 * enumerable from {@link STORAGE_KEYS}. `kvvfs-` is the sqlite-wasm
 * `JsStorageDb("local")` backing store (the `kvvfs-local-*` keys), and
 * `finto_` is the pre-rename legacy Finyk prefix still drained by
 * `storageManager`.
 */
const APP_OWNED_LS_PREFIXES = [
  "hub_",
  "finyk_",
  "finto_",
  "fizruk_",
  "fizruk-",
  "nutrition_",
  "routine_",
  "pwa_",
  "sync_origin_device_id",
  "sergeant.",
  "kvvfs-",
] as const;

/**
 * Exact app-owned keys: every literal in the central registry plus the two
 * non-prefixed bootstrap keys. Building from `STORAGE_KEYS` means a future key
 * added there is covered automatically.
 */
const APP_OWNED_LS_EXACT: ReadonlySet<string> = new Set<string>([
  ...Object.values(STORAGE_KEYS),
  "ios_install_banner_dismissed",
  "storageManager_ran_migrations",
]);

/** Whether `key` belongs to a Sergeant app store (vs a third-party origin). */
export function isAppOwnedLocalStorageKey(key: string): boolean {
  if (APP_OWNED_LS_EXACT.has(key)) return true;
  return APP_OWNED_LS_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/**
 * Remove every app-owned key from physical `localStorage` (the raw keyspace,
 * via {@link resolveLsStore} — NOT the SQLite-overlaid `webKVStore`). Returns
 * the number of keys removed. Never throws; storage errors are swallowed by the
 * underlying adapter.
 */
export function purgeAppOwnedLocalStorage(): number {
  const store = resolveLsStore();
  if (!store) return 0;
  let removed = 0;
  // Snapshot keys first — removing while iterating a live keyspace is unsafe.
  for (const key of [...store.listKeys()]) {
    if (isAppOwnedLocalStorageKey(key)) {
      store.remove(key);
      removed += 1;
    }
  }
  return removed;
}

/**
 * Drop the React-Query IndexedDB persister snapshot. It is keyed by build-id
 * (not user-id), so the previous user's non-sensitive finyk / nutrition /
 * routine query data would otherwise warm-hydrate for the next user. It holds
 * only cached server responses, so dropping it is loss-free — the next session
 * revalidates from the API.
 */
export async function purgeQueryCacheSnapshot(): Promise<void> {
  await dbDel(SERGEANT_STORE.RQ_CACHE, STORAGE_KEYS.WEB_QUERY_CACHE);
}

/**
 * Purge all app-owned local-first stores. Best-effort: each step is isolated
 * so a failure in one (e.g. IndexedDB unavailable in Safari private mode) never
 * blocks the others or the logout flow.
 */
export async function purgeAppOwnedLocalData(): Promise<void> {
  try {
    purgeAppOwnedLocalStorage();
  } catch (err) {
    logger.warn("[purgeLocalData] localStorage purge failed", err);
  }
  try {
    resetKvStoreBoot();
  } catch (err) {
    logger.warn("[purgeLocalData] kv warm-cache reset failed", err);
  }
  try {
    await purgeQueryCacheSnapshot();
  } catch (err) {
    logger.warn("[purgeLocalData] query-cache snapshot purge failed", err);
  }
}
