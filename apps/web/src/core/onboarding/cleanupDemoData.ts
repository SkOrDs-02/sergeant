// One-time cleanup of FTUX demo data for users who went through the old
// demo-seeding onboarding before it was removed. Runs once per device:
// the first boot after this ships, it scans the known module-storage
// keys, strips `demo: true` items, and sets a flag so the cleanup never
// re-runs. Missing keys / malformed payloads are left untouched.
//
// Keeping this tiny + local rather than spreading migration logic across
// every module — the demo flag was always a cross-cutting concern.

import {
  safeReadLS,
  safeWriteLS,
  safeRemoveLS,
} from "@shared/lib/storage/storage";

const CLEANUP_DONE_KEY = "hub_demo_cleanup_v1_done";
const LEGACY_SEEDED_FLAG_KEY = "hub_demo_seeded_v1";
const LEGACY_BANNER_DISMISSED_KEY = "hub_demo_banner_dismissed_v1";

const FINYK_MANUAL_EXPENSES_KEY = "finyk_manual_expenses_v1";
const FIZRUK_WORKOUTS_KEY = "fizruk_workouts_v1";
const ROUTINE_STATE_KEY = "hub_routine_v1";
const NUTRITION_LOG_KEY = "nutrition_log_v1";

function stripDemoArray<T extends { demo?: boolean }>(
  arr: T[] | null | undefined,
): T[] {
  if (!Array.isArray(arr)) return [];
  return arr.filter((x) => !(x && typeof x === "object" && x.demo === true));
}

function cleanFinyk(): void {
  const list = safeReadLS<Array<{ demo?: boolean }>>(FINYK_MANUAL_EXPENSES_KEY);
  if (!Array.isArray(list)) return;
  const next = stripDemoArray(list);
  if (next.length === list.length) return;
  // Finyk cross-device sync живе у SQLite + op-log v2 (Stage 4 PR #039);
  // цей LS write — local-only legacy-shape touch-up на
  // tombstone-ключі (`@deprecated` у storageKeys.ts).
  safeWriteLS(FINYK_MANUAL_EXPENSES_KEY, next);
}

function cleanFizruk(): void {
  const raw = safeReadLS<
    | Array<{ demo?: boolean }>
    | { workouts?: Array<{ demo?: boolean }>; schemaVersion?: number }
  >(FIZRUK_WORKOUTS_KEY);
  if (Array.isArray(raw)) {
    const next = stripDemoArray(raw);
    if (next.length !== raw.length) safeWriteLS(FIZRUK_WORKOUTS_KEY, next);
    return;
  }
  if (raw && Array.isArray(raw.workouts)) {
    const next = stripDemoArray(raw.workouts);
    if (next.length !== raw.workouts.length) {
      safeWriteLS(FIZRUK_WORKOUTS_KEY, { ...raw, workouts: next });
    }
  }
}

function cleanRoutine(): void {
  const raw = safeReadLS<{
    habits?: Array<{ id?: string; demo?: boolean }>;
    completions?: Record<string, unknown>;
    habitOrder?: string[];
    [k: string]: unknown;
  }>(ROUTINE_STATE_KEY);
  if (!raw || !Array.isArray(raw.habits)) return;
  const demoIds = new Set(
    raw.habits.filter((h) => h?.demo === true && h.id).map((h) => h.id!),
  );
  if (demoIds.size === 0) return;
  const habits = raw.habits.filter((h) => !demoIds.has(h?.id ?? ""));
  const completions = { ...(raw.completions ?? {}) };
  for (const id of demoIds) delete (completions as Record<string, unknown>)[id];
  const habitOrder = Array.isArray(raw.habitOrder)
    ? raw.habitOrder.filter((id) => !demoIds.has(id))
    : undefined;
  safeWriteLS(ROUTINE_STATE_KEY, {
    ...raw,
    habits,
    completions,
    ...(habitOrder ? { habitOrder } : {}),
  });
}

function cleanNutrition(): void {
  const log =
    safeReadLS<Record<string, { meals?: Array<{ demo?: boolean }> }>>(
      NUTRITION_LOG_KEY,
    );
  if (!log || typeof log !== "object" || Array.isArray(log)) return;
  let touched = false;
  const next: Record<string, { meals?: Array<{ demo?: boolean }> }> = {};
  for (const [dateKey, day] of Object.entries(log)) {
    if (!day || !Array.isArray(day.meals)) {
      next[dateKey] = day;
      continue;
    }
    const meals = stripDemoArray(day.meals);
    if (meals.length !== day.meals.length) touched = true;
    if (meals.length > 0) next[dateKey] = { ...day, meals };
    else touched = true;
  }
  // Nutrition cross-device sync живе у SQLite + op-log v2 (Stage 4 PR #034);
  // цей LS write — local-only legacy-shape touch-up на
  // tombstone-ключі (`@deprecated` у storageKeys.ts).
  if (touched) safeWriteLS(NUTRITION_LOG_KEY, next);
}

/**
 * Run the one-time FTUX demo-data cleanup. Safe to call on every boot —
 * it exits in O(1) after the first successful run.
 *
 * `safeReadLS` decodes JSON, so the legacy-string-flag check needs raw
 * comparison; we use the helper's null-fallback sentinel instead. If the
 * flag isn't set yet, `safeReadLS` returns `null` → we proceed with the
 * cleanup. If it's set, the parsed string `"1"` short-circuits.
 */
export function runDemoCleanupOnce(): void {
  if (safeReadLS<unknown>(CLEANUP_DONE_KEY) === "1") return;
  cleanFinyk();
  cleanFizruk();
  cleanRoutine();
  cleanNutrition();
  safeRemoveLS(LEGACY_SEEDED_FLAG_KEY);
  safeRemoveLS(LEGACY_BANNER_DISMISSED_KEY);
  safeWriteLS(CLEANUP_DONE_KEY, "1");
}
