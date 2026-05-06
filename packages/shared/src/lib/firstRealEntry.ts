/**
 * DOM-free detection of the user's first *real* (non-demo) entry
 * across any Hub module. Ported from
 * `apps/web/src/core/onboarding/firstRealEntry.ts`.
 *
 * Mobile and web share the same storage-key contract for domain
 * blobs (finyk manual expenses, fizruk workouts, routine habits,
 * nutrition meal log), so the detection rules live here; the
 * `KVStore` abstraction decides whether it reads localStorage or
 * MMKV. Analytics dispatch is injected so this module stays free of
 * `@sergeant/shared`-external side-effects.
 */

import {
  FIRST_ACTION_STARTED_AT_KEY,
  TTV_MS_KEY,
  getFirstActionStartedAt,
  isFirstActionCompletedForModule,
  isFirstRealEntryDone,
  markFirstActionCompletedForModule,
  markFirstRealEntryDone,
  saveTimeToValueMs,
} from "./vibePicks";
import { ANALYTICS_EVENTS } from "./analyticsEvents";
import { readJSON, type KVStore } from "../storage/kv";
import { DASHBOARD_MODULE_IDS, type DashboardModuleId } from "./dashboard";

// Storage keys inspected by `hasAnyRealEntry`. Centralised here so
// the web and mobile adapters don't drift.
export const FIRST_REAL_ENTRY_SOURCES = {
  FINYK_MANUAL: "finyk_manual_expenses_v1",
  FINYK_TX_CACHE: "finyk_tx_cache",
  FIZRUK_WORKOUTS: "fizruk_workouts_v1",
  ROUTINE: "hub_routine_v1",
  NUTRITION_LOG: "nutrition_log_v1",
} as const;

function hasNonDemoItem(list: unknown): boolean {
  if (!Array.isArray(list)) return false;
  return list.some(
    (item) =>
      item && typeof item === "object" && !(item as { demo?: unknown }).demo,
  );
}

/**
 * PR-08 — per-module non-demo presence check. Used by `hasAnyRealEntry`,
 * `getFirstRealEntryModule` *and* `detectFirstActionCompletedPerModule`
 * so the four scan branches stay in lockstep across read paths and
 * across modules. Pure (no side effects) and cheap (only the slot for
 * the requested module is read).
 */
export function moduleHasRealEntry(
  store: KVStore,
  moduleId: DashboardModuleId,
): boolean {
  if (moduleId === "finyk") {
    const manual = readJSON(store, FIRST_REAL_ENTRY_SOURCES.FINYK_MANUAL);
    if (hasNonDemoItem(manual)) return true;
    const finykCache = readJSON<{ transactions?: unknown[] }>(
      store,
      FIRST_REAL_ENTRY_SOURCES.FINYK_TX_CACHE,
    );
    return Boolean(
      finykCache &&
      Array.isArray(finykCache.transactions) &&
      finykCache.transactions.length > 0,
    );
  }
  if (moduleId === "fizruk") {
    const fizruk = readJSON<unknown[] | { workouts?: unknown[] }>(
      store,
      FIRST_REAL_ENTRY_SOURCES.FIZRUK_WORKOUTS,
    );
    const workouts = Array.isArray(fizruk)
      ? fizruk
      : fizruk && Array.isArray(fizruk.workouts)
        ? fizruk.workouts
        : [];
    return hasNonDemoItem(workouts);
  }
  if (moduleId === "routine") {
    const routine = readJSON<{ habits?: unknown[] }>(
      store,
      FIRST_REAL_ENTRY_SOURCES.ROUTINE,
    );
    return Boolean(routine && hasNonDemoItem(routine.habits));
  }
  if (moduleId === "nutrition") {
    const nutrition = readJSON<Record<string, { meals?: unknown }>>(
      store,
      FIRST_REAL_ENTRY_SOURCES.NUTRITION_LOG,
    );
    if (
      !nutrition ||
      typeof nutrition !== "object" ||
      Array.isArray(nutrition)
    ) {
      return false;
    }
    for (const day of Object.values(nutrition)) {
      if (hasNonDemoItem(day?.meals)) return true;
    }
    return false;
  }
  return false;
}

/**
 * Returns `true` iff the user has at least one non-demo entry in any
 * module. Pure scan of storage — safe to call on every render.
 */
export function hasAnyRealEntry(store: KVStore): boolean {
  // Finyk — manual expenses.
  const manual = readJSON(store, FIRST_REAL_ENTRY_SOURCES.FINYK_MANUAL);
  if (hasNonDemoItem(manual)) return true;

  // A synced monobank tx cache counts as real data by definition.
  const finykCache = readJSON<{ transactions?: unknown[] }>(
    store,
    FIRST_REAL_ENTRY_SOURCES.FINYK_TX_CACHE,
  );
  if (
    finykCache &&
    Array.isArray(finykCache.transactions) &&
    finykCache.transactions.length > 0
  ) {
    return true;
  }

  // Fizruk — workouts. The cache may be either an array or an object
  // whose `.workouts` slot holds the array.
  const fizruk = readJSON<unknown[] | { workouts?: unknown[] }>(
    store,
    FIRST_REAL_ENTRY_SOURCES.FIZRUK_WORKOUTS,
  );
  const workouts = Array.isArray(fizruk)
    ? fizruk
    : fizruk && Array.isArray(fizruk.workouts)
      ? fizruk.workouts
      : [];
  if (hasNonDemoItem(workouts)) return true;

  // Routine — habits. Demo habits are flagged `demo: true`.
  const routine = readJSON<{ habits?: unknown[] }>(
    store,
    FIRST_REAL_ENTRY_SOURCES.ROUTINE,
  );
  if (routine && hasNonDemoItem(routine.habits)) return true;

  // Nutrition — meal log keyed by date; inspect meals across all days.
  const nutrition = readJSON<Record<string, { meals?: unknown }>>(
    store,
    FIRST_REAL_ENTRY_SOURCES.NUTRITION_LOG,
  );
  if (nutrition && typeof nutrition === "object" && !Array.isArray(nutrition)) {
    for (const day of Object.values(nutrition)) {
      const meals = day?.meals;
      if (hasNonDemoItem(meals)) return true;
    }
  }

  return false;
}

/**
 * Detect *which* module currently holds at least one real entry.
 *
 * Returns the first-hit module in scan order — Finyk → Fizruk →
 * Routine → Nutrition. Same scan as `hasAnyRealEntry`, but yields the
 * id instead of a boolean. Used by `useFirstEntryCelebration` to pick
 * module-aware copy from `FIRST_ENTRY_CELEBRATIONS`.
 *
 * Returns `null` if no real entry exists. Order is deterministic so a
 * race (two modules flipped in the same tick) resolves to a stable
 * choice — copy stays predictable for the user even though analytics
 * still records the actual `source` per event.
 */
export function getFirstRealEntryModule(
  store: KVStore,
): DashboardModuleId | null {
  // Finyk — manual expenses, then synced monobank cache.
  const manual = readJSON(store, FIRST_REAL_ENTRY_SOURCES.FINYK_MANUAL);
  if (hasNonDemoItem(manual)) return "finyk";
  const finykCache = readJSON<{ transactions?: unknown[] }>(
    store,
    FIRST_REAL_ENTRY_SOURCES.FINYK_TX_CACHE,
  );
  if (
    finykCache &&
    Array.isArray(finykCache.transactions) &&
    finykCache.transactions.length > 0
  ) {
    return "finyk";
  }

  const fizruk = readJSON<unknown[] | { workouts?: unknown[] }>(
    store,
    FIRST_REAL_ENTRY_SOURCES.FIZRUK_WORKOUTS,
  );
  const workouts = Array.isArray(fizruk)
    ? fizruk
    : fizruk && Array.isArray(fizruk.workouts)
      ? fizruk.workouts
      : [];
  if (hasNonDemoItem(workouts)) return "fizruk";

  const routine = readJSON<{ habits?: unknown[] }>(
    store,
    FIRST_REAL_ENTRY_SOURCES.ROUTINE,
  );
  if (routine && hasNonDemoItem(routine.habits)) return "routine";

  const nutrition = readJSON<Record<string, { meals?: unknown }>>(
    store,
    FIRST_REAL_ENTRY_SOURCES.NUTRITION_LOG,
  );
  if (nutrition && typeof nutrition === "object" && !Array.isArray(nutrition)) {
    for (const day of Object.values(nutrition)) {
      const meals = day?.meals;
      if (hasNonDemoItem(meals)) return "nutrition";
    }
  }

  return null;
}

/**
 * Count total non-demo entries across all modules.
 * Used by SoftAuthPromptCard to show "У тебе N записів".
 */
export function countRealEntries(store: KVStore): number {
  let count = 0;

  const manual = readJSON<unknown[]>(
    store,
    FIRST_REAL_ENTRY_SOURCES.FINYK_MANUAL,
  );
  if (Array.isArray(manual)) {
    count += manual.filter(
      (item) =>
        item && typeof item === "object" && !(item as { demo?: unknown }).demo,
    ).length;
  }

  const finykCache = readJSON<{ transactions?: unknown[] }>(
    store,
    FIRST_REAL_ENTRY_SOURCES.FINYK_TX_CACHE,
  );
  if (finykCache && Array.isArray(finykCache.transactions)) {
    count += finykCache.transactions.length;
  }

  const fizruk = readJSON<unknown[] | { workouts?: unknown[] }>(
    store,
    FIRST_REAL_ENTRY_SOURCES.FIZRUK_WORKOUTS,
  );
  const workouts = Array.isArray(fizruk)
    ? fizruk
    : fizruk && Array.isArray(fizruk.workouts)
      ? fizruk.workouts
      : [];
  count += workouts.filter(
    (item) =>
      item && typeof item === "object" && !(item as { demo?: unknown }).demo,
  ).length;

  const routine = readJSON<{ habits?: unknown[] }>(
    store,
    FIRST_REAL_ENTRY_SOURCES.ROUTINE,
  );
  if (routine && Array.isArray(routine.habits)) {
    count += routine.habits.filter(
      (item) =>
        item && typeof item === "object" && !(item as { demo?: unknown }).demo,
    ).length;
  }

  const nutrition = readJSON<Record<string, { meals?: unknown }>>(
    store,
    FIRST_REAL_ENTRY_SOURCES.NUTRITION_LOG,
  );
  if (nutrition && typeof nutrition === "object" && !Array.isArray(nutrition)) {
    for (const day of Object.values(nutrition)) {
      const meals = day?.meals;
      if (Array.isArray(meals)) {
        count += meals.filter(
          (item) =>
            item &&
            typeof item === "object" &&
            !(item as { demo?: unknown }).demo,
        ).length;
      }
    }
  }

  return count;
}

/**
 * Event names emitted by `detectFirstRealEntry` when the flag flips.
 *
 * Re-export of the canonical names from `ANALYTICS_EVENTS` so call-sites
 * that already import this module don't have to learn a second
 * constant. Keeping the indirection prevents string drift between this
 * file and `analyticsEvents.ts`.
 */
export const FIRST_REAL_ENTRY_EVENTS = {
  FIRST_REAL_ENTRY: ANALYTICS_EVENTS.FIRST_REAL_ENTRY,
  FTUX_TIME_TO_VALUE: ANALYTICS_EVENTS.FTUX_TIME_TO_VALUE,
} as const;

export interface DetectFirstRealEntryOptions {
  /**
   * Fire-and-forget analytics callback. Called exactly once when the
   * flag flips. Implementations should not throw.
   */
  trackEvent?: (name: string, payload?: Record<string, unknown>) => void;
  /** Override for `Date.now`, used by tests. */
  now?: () => number;
}

/**
 * Idempotent flip-and-report: on the first call where a real entry
 * exists, persist the flag, fire analytics, and compute the TTV.
 * Subsequent calls are a cheap `getString(FIRST_REAL_ENTRY_KEY)`.
 */
export function detectFirstRealEntry(
  store: KVStore,
  options: DetectFirstRealEntryOptions = {},
): boolean {
  const { trackEvent, now = Date.now } = options;

  if (isFirstRealEntryDone(store)) return true;
  if (!hasAnyRealEntry(store)) return false;

  markFirstRealEntryDone(store);
  trackEvent?.(FIRST_REAL_ENTRY_EVENTS.FIRST_REAL_ENTRY);

  const startedAt = getFirstActionStartedAt(store);
  if (startedAt) {
    const durationMs = Math.max(0, now() - startedAt);
    saveTimeToValueMs(store, durationMs);
    trackEvent?.(FIRST_REAL_ENTRY_EVENTS.FTUX_TIME_TO_VALUE, {
      durationMs,
      durationSec: Math.round(durationMs / 1000),
    });
  }
  return true;
}

export interface DetectFirstActionCompletedPerModuleOptions {
  /**
   * Fire-and-forget analytics callback. Called once per module that
   * just flipped from "no real entry" → "has real entry". Implementations
   * should not throw.
   */
  trackEvent?: (name: string, payload?: Record<string, unknown>) => void;
}

/**
 * PR-08 — per-module flip-and-report. On every call:
 *
 *   1. Iterate the four modules in `DASHBOARD_MODULE_IDS` order.
 *   2. For each module that has a non-demo entry **and** whose
 *      `hub_first_action_completed_v1:<module>` flag is not yet set,
 *      flip the flag and fire `first_action_completed { module }` once.
 *   3. Modules already flagged in storage (from a previous render) are
 *      cheap no-ops — only one `getString(...)` per module.
 *
 * Returns the list of modules whose flag flipped during this call —
 * useful for tests; production call-sites typically ignore it.
 *
 * Designed to be called alongside `detectFirstRealEntry` from the
 * dashboard render path. Both functions read storage on every render;
 * once the per-module flags are set the work degenerates to four
 * `getString` calls.
 */
export function detectFirstActionCompletedPerModule(
  store: KVStore,
  options: DetectFirstActionCompletedPerModuleOptions = {},
): DashboardModuleId[] {
  const { trackEvent } = options;
  const flipped: DashboardModuleId[] = [];

  for (const moduleId of DASHBOARD_MODULE_IDS) {
    if (isFirstActionCompletedForModule(store, moduleId)) continue;
    if (!moduleHasRealEntry(store, moduleId)) continue;

    markFirstActionCompletedForModule(store, moduleId);
    flipped.push(moduleId);
    trackEvent?.(ANALYTICS_EVENTS.FIRST_ACTION_COMPLETED, { module: moduleId });
  }

  return flipped;
}

// Re-export the keys so adapters that read the raw timestamps don't
// need a separate import.
export { FIRST_ACTION_STARTED_AT_KEY, TTV_MS_KEY };
