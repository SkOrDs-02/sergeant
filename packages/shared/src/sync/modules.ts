/**
 * Cross-platform cloud-sync module registry.
 *
 * Single source of truth for which `STORAGE_KEYS.*` belong to which
 * sync module on web (localStorage) and mobile (MMKV). Lives in
 * `@sergeant/shared` so the two platforms cannot drift — see PR #007
 * in `docs/planning/storage-roadmap.md`.
 *
 * The values listed here are the **union** across platforms. Each
 * platform's sync engine collects only the keys that actually exist
 * in its local store; missing keys are omitted from the push payload
 * via `collectModuleData` / `buildModulesPayload` (see
 * `apps/{web,mobile}/src/{core/cloudSync,sync}/engine/buildPayload.ts`).
 *
 * **Why list keys from the other platform?** The server stores
 * `module_data.<module>` as a single JSONB blob. If web pushes a
 * blob without `FIZRUK_DAILY_LOG`, the server overwrites the field
 * on disk and mobile gets it nulled on the next pull. Listing the
 * key here makes both clients aware of it; the platform that does
 * not store the key simply skips it during build (round-trip is
 * lossless from the other platform's perspective).
 *
 * Storage keys themselves live in `../lib/storageKeys`. Platform
 * sync-bookkeeping keys (e.g. `SYNC_VERSIONS`, `MOBILE_SYNC_VERSIONS`)
 * are intentionally NOT in this registry — they are metadata, not
 * payload, and live in each platform's `config.ts`.
 */
import { STORAGE_KEYS } from "../lib/storageKeys";

export const SYNC_MODULES = {
  finyk: {
    keys: [
      STORAGE_KEYS.FINYK_HIDDEN,
      STORAGE_KEYS.FINYK_BUDGETS,
      STORAGE_KEYS.FINYK_SUBS,
      STORAGE_KEYS.FINYK_ASSETS,
      STORAGE_KEYS.FINYK_DEBTS,
      STORAGE_KEYS.FINYK_RECV,
      STORAGE_KEYS.FINYK_HIDDEN_TXS,
      STORAGE_KEYS.FINYK_MONTHLY_PLAN,
      STORAGE_KEYS.FINYK_TX_CATS,
      STORAGE_KEYS.FINYK_MONO_DEBT_LINKED,
      STORAGE_KEYS.FINYK_NETWORTH_HISTORY,
      STORAGE_KEYS.FINYK_TX_SPLITS,
      STORAGE_KEYS.FINYK_CUSTOM_CATS,
      STORAGE_KEYS.FINYK_TX_CACHE,
      STORAGE_KEYS.FINYK_INFO_CACHE,
      STORAGE_KEYS.FINYK_TX_CACHE_LAST_GOOD,
      STORAGE_KEYS.FINYK_SHOW_BALANCE,
      STORAGE_KEYS.FINYK_MANUAL_EXPENSES,
      STORAGE_KEYS.FINYK_TX_FILTERS,
      // Monobank PAT (FINYK_TOKEN) intentionally excluded — server-only,
      // see `no-finyk-token-in-storage` ESLint rule and PR #002.
    ],
  },
  fizruk: {
    keys: [
      STORAGE_KEYS.FIZRUK_WORKOUTS,
      STORAGE_KEYS.FIZRUK_CUSTOM_EXERCISES,
      STORAGE_KEYS.FIZRUK_MEASUREMENTS,
      STORAGE_KEYS.FIZRUK_TEMPLATES,
      STORAGE_KEYS.FIZRUK_SELECTED_TEMPLATE,
      STORAGE_KEYS.FIZRUK_ACTIVE_WORKOUT,
      STORAGE_KEYS.FIZRUK_ACTIVE_PROGRAM,
      STORAGE_KEYS.FIZRUK_PLAN_TEMPLATE,
      STORAGE_KEYS.FIZRUK_MONTHLY_PLAN,
      STORAGE_KEYS.FIZRUK_WELLBEING,
      STORAGE_KEYS.FIZRUK_DAILY_LOG,
    ],
  },
  nutrition: {
    keys: [
      STORAGE_KEYS.NUTRITION_LOG,
      STORAGE_KEYS.NUTRITION_PANTRIES,
      STORAGE_KEYS.NUTRITION_ACTIVE_PANTRY,
      STORAGE_KEYS.NUTRITION_PREFS,
      STORAGE_KEYS.NUTRITION_SAVED_RECIPES,
    ],
  },
  profile: {
    keys: [STORAGE_KEYS.USER_PROFILE],
  },
} as const;

export type ModuleName = keyof typeof SYNC_MODULES;

/**
 * DOM event name web dispatches when a sync-tracked write happens.
 * Mobile re-uses the same string so cross-platform diff tools
 * (Sentry breadcrumbs, dashboards) bucket the events together.
 */
export const SYNC_EVENT = "hub-cloud-sync-dirty";

/** Status broadcast event (push start / success / error). */
export const SYNC_STATUS_EVENT = "hub-cloud-sync-status";

/**
 * Hard cap on the offline queue length. Beyond this we drop the
 * oldest entries to keep storage usage bounded for users offline
 * for extended periods. Same value on web (localStorage) and
 * mobile (MMKV); raised together when sync metadata moves to IDB
 * (PR #009 in the storage roadmap).
 */
export const MAX_OFFLINE_QUEUE = 50;

/**
 * Flat read-only view of every storage key registered with any sync
 * module. Used by web's `storagePatch` to decide whether a write
 * should be enqueued, and by mobile's `useSyncedStorage` to
 * detect tracked keys at hook-call time.
 */
export const ALL_TRACKED_KEYS: ReadonlySet<string> = new Set(
  Object.values(SYNC_MODULES).flatMap((m) => m.keys),
);

/**
 * Reverse lookup: which module owns a given storage key, or `null`
 * if it is not tracked. Linear scan is fine because the registry is
 * small (~30 entries) and lookups happen at write-time, not in hot
 * paths.
 */
export function keyToModule(key: string): ModuleName | null {
  for (const [mod, config] of Object.entries(SYNC_MODULES)) {
    if ((config.keys as readonly string[]).includes(key)) {
      return mod as ModuleName;
    }
  }
  return null;
}
