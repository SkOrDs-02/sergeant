/**
 * Mobile cloud-sync configuration. Mirrors
 * `apps/web/src/core/cloudSync/config.ts` in spirit: same `SYNC_MODULES`
 * registry, same retry caps, same event names — but all storage
 * metadata keys are mobile-specific and prefixed `mobile:` so an MMKV
 * instance on device never collides with web localStorage keys that
 * happen to share the same string (see `docs/mobile/react-native-migration.md`
 * § 6.1).
 *
 * The `ModuleName` identifiers (`finyk`, `fizruk`, `routine`,
 * `nutrition`) are kept identical to web because the server's
 * `/api/v1/sync/*` endpoints key module payloads by these exact names.
 * Changing them would break the LWW resolver.
 */
import { STORAGE_KEYS } from "@sergeant/shared";

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
      // Monobank PAT lives only on the server (`mono_connection.token_ciphertext`).
      // Intentionally NOT mirrored into MMKV/cloud-sync: pushing it through
      // `module_data.finyk` would leak cleartext PAT (mobile mirror of the
      // web-side comment in `apps/web/src/core/cloudSync/config.ts`).
      STORAGE_KEYS.FINYK_MANUAL_EXPENSES,
      STORAGE_KEYS.FINYK_TX_FILTERS,
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
} as const;

export type ModuleName = keyof typeof SYNC_MODULES;

export const SYNC_EVENT = "hub-cloud-sync-dirty";
export const SYNC_STATUS_EVENT = "hub-cloud-sync-status";

export const SYNC_VERSION_KEY = STORAGE_KEYS.MOBILE_SYNC_VERSIONS;
export const DIRTY_MODULES_KEY = STORAGE_KEYS.MOBILE_SYNC_DIRTY_MODULES;
export const MODULE_MODIFIED_KEY = STORAGE_KEYS.MOBILE_SYNC_MODULE_MODIFIED;
export const OFFLINE_QUEUE_KEY = STORAGE_KEYS.MOBILE_SYNC_OFFLINE_QUEUE;
export const MIGRATION_DONE_KEY = STORAGE_KEYS.MOBILE_SYNC_MIGRATION_DONE;
export const QUERY_CACHE_KEY = STORAGE_KEYS.MOBILE_QUERY_CACHE;

/**
 * Hard cap on offline queue length. Beyond this we drop the oldest
 * entries to keep MMKV usage bounded for users offline for extended
 * periods. Same cap as web so behavior is directly comparable.
 */
export const MAX_OFFLINE_QUEUE = 50;

export const ALL_TRACKED_KEYS: Set<string> = new Set(
  Object.values(SYNC_MODULES).flatMap((m) => m.keys),
);

export function keyToModule(key: string): ModuleName | null {
  for (const [mod, config] of Object.entries(SYNC_MODULES)) {
    if ((config.keys as readonly string[]).includes(key)) {
      return mod as ModuleName;
    }
  }
  return null;
}
