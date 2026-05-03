/**
 * Onboarding gate — DOM-free helpers.
 *
 * Ported from the inline helpers in
 * `apps/web/src/core/OnboardingWizard.tsx` (`shouldShowOnboarding`,
 * `markOnboardingDone`, `hasExistingData`). The original version reads
 * `localStorage` directly; here we accept a platform-agnostic
 * `KVStore` so the web adapter (localStorage-backed) and the mobile
 * adapter (MMKV-backed) share the same taxonomy, key constants and
 * "existing-data" rules.
 *
 * The web adapter in `apps/web/src/core/onboarding/onboardingGate.ts`
 * rebinds these helpers to `window.localStorage`, so no existing web
 * call-site needs to change. The mobile adapter is invoked inline by
 * `apps/mobile/src/core/OnboardingWizard.tsx` and
 * `app/(tabs)/_layout.tsx`.
 */

import { type DashboardModuleId, DASHBOARD_MODULE_IDS } from "./dashboard";
import { readJSON, type KVStore } from "../storage/kv";
import { ALL_MODULES, sanitizePicks } from "./vibePicks";

// ---------------------------------------------------------------------------
// Multi-step wizard types (v2)
// ---------------------------------------------------------------------------

/** Wizard step identifiers. */
export type OnboardingStepId = "welcome" | "modules" | "goals";

/** Total number of wizard steps. */
export const ONBOARDING_STEP_COUNT = 3 as const;

/** Ordered step sequence rendered by the wizard. */
export const ONBOARDING_STEPS: readonly OnboardingStepId[] = [
  "welcome",
  "modules",
  "goals",
];

/**
 * Module descriptions shown on step 2 (ModuleCards). Longer than the
 * teaser line — explains what the module *does* rather than a stat
 * preview.
 */
export const ONBOARDING_MODULE_DESCRIPTIONS: Record<DashboardModuleId, string> =
  {
    finyk: "Контроль витрат, Monobank-синхронізація, бюджети та тренди",
    fizruk: "Тренування з таймером, програми, прогрес і виміри тіла",
    routine: "Звички зі стріками, хітмеп, статистика та нагадування",
    nutrition: "Фото → AI-аналіз калорій, сканер штрихкодів, денний план",
  };

/** MMKV / localStorage key used to record that onboarding has finished. */
export const ONBOARDING_DONE_KEY = "hub_onboarding_done_v1";

/**
 * Domain-blob storage keys scanned by {@link hasExistingData} to
 * detect a user who already has data on this device (sync-restored,
 * pre-migration, or cross-session). Keys intentionally mirror the
 * canonical ones exposed by `STORAGE_KEYS` so the "restored account"
 * heuristic stays consistent with `firstRealEntry`.
 */
export const ONBOARDING_EXISTING_DATA_SOURCES = {
  FINYK_TX_CACHE: "finyk_tx_cache",
  FINYK_MANUAL: "finyk_manual_expenses_v1",
  FIZRUK_WORKOUTS: "fizruk_workouts_v1",
  NUTRITION_LOG: "nutrition_log_v1",
  ROUTINE: "hub_routine_v1",
} as const;

/**
 * Semantic icon names used by the onboarding vibe chips. Mobile
 * renders these via emoji glyphs (matching the tab bar); web maps
 * them to the shared Lucide icon set. Kept here so mobile and web
 * can't drift on which module shows which glyph.
 */
export const ONBOARDING_VIBE_ICONS: Record<DashboardModuleId, string> = {
  finyk: "credit-card",
  fizruk: "dumbbell",
  routine: "check",
  nutrition: "utensils",
};

/**
 * Teaser copy rendered under each module label on the splash chips.
 * Matches the Ukrainian copy in the web splash verbatim.
 */
export const ONBOARDING_VIBE_TEASERS: Record<DashboardModuleId, string> = {
  finyk: "−320₴ / тиждень",
  fizruk: "5 трен. за 14 днів",
  routine: "стрік «вода» 7 днів",
  nutrition: "сніданок · 420 ккал",
};

/**
 * Canonical chip order rendered on the splash screen. Matches the
 * order of `DASHBOARD_MODULE_IDS` so the vibe picker and the hub
 * status row show modules in the same sequence.
 */
export const ONBOARDING_VIBE_CHIP_ORDER: readonly DashboardModuleId[] =
  DASHBOARD_MODULE_IDS;

/**
 * True when this device already has real or synced data in any
 * tracked module. Used as a silent escape hatch — a user whose
 * account was previously populated (sync-restored, legacy install)
 * should never see the onboarding splash even if the `done` flag
 * happens to be missing.
 *
 * Detection rules intentionally mirror the pre-extraction inline
 * helper on web so behaviour is byte-identical: any Finyk tx cache
 * blob, any Finyk manual expense, any Fizruk workout, any Nutrition
 * log entry, or any Routine habit counts.
 */
export function hasExistingData(store: KVStore): boolean {
  if (store.getString(ONBOARDING_EXISTING_DATA_SOURCES.FINYK_TX_CACHE)) {
    return true;
  }

  const manual = readJSON<unknown>(
    store,
    ONBOARDING_EXISTING_DATA_SOURCES.FINYK_MANUAL,
  );
  if (Array.isArray(manual) && manual.length > 0) return true;

  const fizruk = readJSON<unknown[] | { workouts?: unknown[] }>(
    store,
    ONBOARDING_EXISTING_DATA_SOURCES.FIZRUK_WORKOUTS,
  );
  const workouts = Array.isArray(fizruk)
    ? fizruk
    : fizruk && Array.isArray(fizruk.workouts)
      ? fizruk.workouts
      : null;
  if (Array.isArray(workouts) && workouts.length > 0) return true;

  const nutrition = readJSON<Record<string, unknown>>(
    store,
    ONBOARDING_EXISTING_DATA_SOURCES.NUTRITION_LOG,
  );
  if (
    nutrition &&
    typeof nutrition === "object" &&
    Object.keys(nutrition).length > 0
  ) {
    return true;
  }

  const routine = readJSON<{ habits?: unknown[] }>(
    store,
    ONBOARDING_EXISTING_DATA_SOURCES.ROUTINE,
  );
  if (routine && Array.isArray(routine.habits) && routine.habits.length > 0) {
    return true;
  }

  return false;
}

/**
 * Record that the user has finished (or silently skipped) onboarding
 * so subsequent launches render the populated hub directly.
 */
export function markOnboardingDone(store: KVStore): void {
  store.setString(ONBOARDING_DONE_KEY, "1");
}

/**
 * Inverse helper for tests / dev tooling that need to reset the
 * onboarding gate without dropping the rest of the MMKV store.
 */
export function clearOnboardingDone(store: KVStore): void {
  store.remove(ONBOARDING_DONE_KEY);
}

/** Raw read of the "done" flag, without the `hasExistingData` side-effect. */
export function isOnboardingDone(store: KVStore): boolean {
  return store.getString(ONBOARDING_DONE_KEY) === "1";
}

/**
 * Returns `true` when the onboarding splash should render on this
 * cold start. Side-effect: if the store already holds real data,
 * the `done` flag is set eagerly so we don't re-check expensive
 * blob payloads on every render.
 *
 * Signature matches the web inline version 1:1 so the web thin-adapter
 * is a straight passthrough.
 */
export function shouldShowOnboarding(store: KVStore): boolean {
  if (isOnboardingDone(store)) return false;
  if (hasExistingData(store)) {
    markOnboardingDone(store);
    return false;
  }
  return true;
}

/**
 * Normalise the user's vibe-chip selection into the final list
 * `OnboardingWizard.finish()` saves. Empty / invalid input falls
 * back to "all four modules" so the lazy path (tap-through without
 * tweaking) leaves every module visible on the hub.
 */
export function buildFinalPicks(
  raw: unknown,
  fallback: readonly DashboardModuleId[] = ALL_MODULES,
): DashboardModuleId[] {
  const sanitized = sanitizePicks(raw);
  return sanitized.length > 0 ? sanitized : [...fallback];
}
