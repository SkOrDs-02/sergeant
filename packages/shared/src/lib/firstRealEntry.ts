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
  MULTI_MODULE_ACTIVATION_THRESHOLD,
  TTV_MS_KEY,
  getFirstActionStartedAt,
  getModulesWithFirstAction,
  isFirstActionCompletedForModule,
  isFirstRealEntryDone,
  isMultiModuleActivatedFired,
  markFirstActionCompletedForModule,
  markFirstRealEntryDone,
  markMultiModuleActivatedFired,
  saveTimeToValueMs,
} from "./vibePicks";
import { ANALYTICS_EVENTS } from "./analyticsEvents";
import { readJSON, type KVStore } from "../storage/kv";
import { DASHBOARD_MODULE_IDS, type DashboardModuleId } from "./dashboard";

// Legacy storage keys inspected by `hasAnyRealEntry`. Centralised here so
// the web and mobile adapters don't drift.
//
// AI-DANGER: on web all five keys are **tombstoned** — every module drained
// its blob into SQLite on boot and deleted the key, so a raw scan of these
// slots reads empty for any post-migration profile. That is exactly how the
// FTUX hero card («З чого хочеш почати?» → PresetSheet) survived forever for
// an active tester: `hasRealEntry` never flipped, so nothing ever cleared
// `hub_first_action_pending_v1` and the «Звіти» tab stayed locked. Canonical
// presence now arrives through {@link ModuleEntryCountProbe}; these keys stay
// as the fallback for demo-seeded profiles (the demo seed still writes them)
// and for mobile, whose MMKV blobs were never migrated.
export const FIRST_REAL_ENTRY_SOURCES = {
  FINYK_MANUAL: "finyk_manual_expenses_v1",
  FINYK_TX_CACHE: "finyk_tx_cache",
  FIZRUK_WORKOUTS: "fizruk_workouts_v1",
  ROUTINE: "hub_routine_v1",
  NUTRITION_LOG: "nutrition_log_v1",
} as const;

function countNonDemoItems(list: unknown): number {
  if (!Array.isArray(list)) return 0;
  return list.filter(
    (item) =>
      item && typeof item === "object" && !(item as { demo?: unknown }).demo,
  ).length;
}

/**
 * Canonical per-module entry counter, injected by the platform adapter.
 *
 * Returns how many non-demo entries `moduleId`'s **canonical** store holds
 * right now — on web that is the module's SQLite warm cache, which is the
 * only place a post-migration entry exists. A cold cache reports `0`, which
 * is indistinguishable from "warm and empty" on purpose: the legacy LS scan
 * is OR-ed in either way, so a probe can only ever *add* evidence and never
 * hide an entry the old scan would have found.
 *
 * The probe is a callback rather than a direct import because the canonical
 * readers live inside `apps/web/src/modules/**` — importing them from the
 * Hub's critical path would drag `drizzle-orm` onto the eager chunk and blow
 * the 280 kB budget (AGENTS.md § Performance budgets). The web adapter
 * registers per-module counters from each module's SQLite read-path boot
 * instead, so this file gains no new import edges.
 */
export type ModuleEntryCountProbe = (moduleId: DashboardModuleId) => number;

/** Non-demo entry count for `moduleId` in the legacy KV slots only. */
function legacyModuleEntryCount(
  store: KVStore,
  moduleId: DashboardModuleId,
): number {
  if (moduleId === "finyk") {
    const manual = readJSON<unknown[]>(
      store,
      FIRST_REAL_ENTRY_SOURCES.FINYK_MANUAL,
    );
    const finykCache = readJSON<{ transactions?: unknown[] }>(
      store,
      FIRST_REAL_ENTRY_SOURCES.FINYK_TX_CACHE,
    );
    // Mirrored transactions carry no `demo` flag — the demo seed writes the
    // whole cache — so the whole list counts, as it always has.
    return (
      countNonDemoItems(manual) +
      (finykCache && Array.isArray(finykCache.transactions)
        ? finykCache.transactions.length
        : 0)
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
    return countNonDemoItems(workouts);
  }
  if (moduleId === "routine") {
    const routine = readJSON<{ habits?: unknown[] }>(
      store,
      FIRST_REAL_ENTRY_SOURCES.ROUTINE,
    );
    return countNonDemoItems(routine?.habits);
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
      return 0;
    }
    let count = 0;
    for (const day of Object.values(nutrition)) {
      count += countNonDemoItems(day?.meals);
    }
    return count;
  }
  return 0;
}

/**
 * Non-demo entry count for `moduleId` across both evidence sources.
 *
 * `Math.max` rather than a sum: the canonical store and the legacy slot
 * describe the same entries whenever both are populated (a pre-migration
 * profile mid-drain), so adding them would double-count. Taking the larger
 * keeps "any evidence wins" without inventing entries.
 */
export function moduleRealEntryCount(
  store: KVStore,
  moduleId: DashboardModuleId,
  probe?: ModuleEntryCountProbe,
): number {
  const canonical = probe?.(moduleId) ?? 0;
  return Math.max(canonical, legacyModuleEntryCount(store, moduleId));
}

/**
 * PR-08 — per-module non-demo presence check. Used by `hasAnyRealEntry`,
 * `getFirstRealEntryModule` *and* `detectFirstActionCompletedPerModule`
 * so the scan branches stay in lockstep across read paths and across
 * modules. Pure (no side effects) and cheap (only the slot for the
 * requested module is read).
 */
export function moduleHasRealEntry(
  store: KVStore,
  moduleId: DashboardModuleId,
  probe?: ModuleEntryCountProbe,
): boolean {
  return moduleRealEntryCount(store, moduleId, probe) > 0;
}

/**
 * Returns `true` iff the user has at least one non-demo entry in any
 * module. Pure scan of storage — safe to call on every render.
 */
export function hasAnyRealEntry(
  store: KVStore,
  probe?: ModuleEntryCountProbe,
): boolean {
  return DASHBOARD_MODULE_IDS.some((moduleId) =>
    moduleHasRealEntry(store, moduleId, probe),
  );
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
  probe?: ModuleEntryCountProbe,
): DashboardModuleId | null {
  return (
    DASHBOARD_MODULE_IDS.find((moduleId) =>
      moduleHasRealEntry(store, moduleId, probe),
    ) ?? null
  );
}

/**
 * Count total non-demo entries across all modules.
 * Used by SoftAuthPromptCard to show "У тебе N записів".
 *
 * Sums the same per-module counts the presence checks are derived from, so
 * "N записів" can never disagree with "у тебе є записи" — before the probe
 * existed this function kept its own copy of the five-key scan and drifted
 * from `hasAnyRealEntry` the moment one of them learned a new source.
 */
export function countRealEntries(
  store: KVStore,
  probe?: ModuleEntryCountProbe,
): number {
  return DASHBOARD_MODULE_IDS.reduce(
    (total, moduleId) => total + moduleRealEntryCount(store, moduleId, probe),
    0,
  );
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
  /**
   * Canonical per-module entry counter. Without it the detection sees only
   * the tombstoned legacy slots and never flips for a migrated profile.
   */
  probe?: ModuleEntryCountProbe;
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
  const { trackEvent, now = Date.now, probe } = options;

  if (isFirstRealEntryDone(store)) return true;
  if (!hasAnyRealEntry(store, probe)) return false;

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
   * just flipped from "no real entry" → "has real entry", and once more
   * with `multi_module_activated` the first time the distinct-module
   * count crosses {@link MULTI_MODULE_ACTIVATION_THRESHOLD}.
   * Implementations should not throw.
   */
  trackEvent?: (name: string, payload?: Record<string, unknown>) => void;
  /**
   * Override "now" for the `multi_module_activated` payload's
   * `days_since_first_action` stamp. Defaults to `Date.now`.
   */
  now?: () => number;
  /** Canonical per-module entry counter — see {@link ModuleEntryCountProbe}. */
  probe?: ModuleEntryCountProbe;
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
  const { trackEvent, now = Date.now, probe } = options;
  const flipped: DashboardModuleId[] = [];

  for (const moduleId of DASHBOARD_MODULE_IDS) {
    if (isFirstActionCompletedForModule(store, moduleId)) continue;
    if (!moduleHasRealEntry(store, moduleId, probe)) continue;

    markFirstActionCompletedForModule(store, moduleId);
    flipped.push(moduleId);
    trackEvent?.(ANALYTICS_EVENTS.FIRST_ACTION_COMPLETED, { module: moduleId });
  }

  // Tier 2 — cross-module breadth. Only a freshly-flipped module can push
  // the distinct-module count over the threshold, so the steady-state
  // no-op path (nothing flipped) skips the scan and the fired-flag read
  // entirely. Fires once per profile, after the per-module events so the
  // PostHog funnel reads `first_action_completed` ≥ `multi_module_activated`.
  if (flipped.length > 0 && !isMultiModuleActivatedFired(store)) {
    const activatedModules = getModulesWithFirstAction(store);
    if (activatedModules.length >= MULTI_MODULE_ACTIVATION_THRESHOLD) {
      markMultiModuleActivatedFired(store);
      const startedAt = getFirstActionStartedAt(store);
      const daysSinceFirstAction =
        startedAt === null
          ? null
          : Math.max(0, Math.floor((now() - startedAt) / 86_400_000));
      trackEvent?.(ANALYTICS_EVENTS.MULTI_MODULE_ACTIVATED, {
        module_count: activatedModules.length,
        modules: activatedModules,
        days_since_first_action: daysSinceFirstAction,
      });
    }
  }

  return flipped;
}

// Re-export the keys so adapters that read the raw timestamps don't
// need a separate import.
export { FIRST_ACTION_STARTED_AT_KEY, TTV_MS_KEY };
