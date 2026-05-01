import { STORAGE_KEYS } from "@sergeant/shared";

/**
 * Registry of sync modules and the localStorage keys that belong to each.
 * Extracted verbatim from the original `useCloudSync.js` so that behavior
 * (including ordering-dependent iterations like `Object.keys(SYNC_MODULES)`)
 * stays identical.
 */
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
      // Monobank PAT lives only on the server (`mono_connection.token_ciphertext`,
      // see `useMonoTokenMigration` for the legacy LS/sessionStorage cleanup).
      // Intentionally NOT in this list: dehydrating it through cloud-sync would
      // leak the cleartext token into `module_data.finyk` JSONB on every push.
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
      STORAGE_KEYS.FIZRUK_PLAN_TEMPLATE,
      STORAGE_KEYS.FIZRUK_MONTHLY_PLAN,
      STORAGE_KEYS.FIZRUK_WELLBEING,
    ],
  },
  routine: {
    keys: [STORAGE_KEYS.ROUTINE],
  },
  nutrition: {
    keys: [
      STORAGE_KEYS.NUTRITION_LOG,
      STORAGE_KEYS.NUTRITION_PANTRIES,
      STORAGE_KEYS.NUTRITION_ACTIVE_PANTRY,
      STORAGE_KEYS.NUTRITION_PREFS,
    ],
  },
  profile: {
    keys: [STORAGE_KEYS.USER_PROFILE],
  },
} as const;

export type ModuleName = keyof typeof SYNC_MODULES;

export const SYNC_EVENT = "hub-cloud-sync-dirty";
export const SYNC_STATUS_EVENT = "hub-cloud-sync-status";

export const SYNC_VERSION_KEY = STORAGE_KEYS.SYNC_VERSIONS;
export const DIRTY_MODULES_KEY = STORAGE_KEYS.SYNC_DIRTY_MODULES;
export const MODULE_MODIFIED_KEY = STORAGE_KEYS.SYNC_MODULE_MODIFIED;
export const OFFLINE_QUEUE_KEY = STORAGE_KEYS.SYNC_OFFLINE_QUEUE;
export const MIGRATION_DONE_KEY = STORAGE_KEYS.SYNC_MIGRATION_DONE;

/**
 * Hard cap on offline queue length. Beyond this we drop the oldest entries to
 * keep localStorage usage bounded for users offline for extended periods.
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
