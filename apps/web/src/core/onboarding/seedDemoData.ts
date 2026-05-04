// One-shot demo-mode seeder. Activated by `?demo=1` (or `?demo=seed`)
// on any URL — populates localStorage with realistic sample data
// across all four modules (Finyk / Fizruk / Routine / Nutrition),
// skips the onboarding splash + Finyk bank-login gate, then reloads
// onto `/` so the app renders against the seeded state.
//
// `?demo=reset` clears the seeded keys back to a cold-start state.
//
// Implementation note: the "cleanup" pass in `cleanupDemoData.ts`
// strips anything flagged `demo: true` once per device. This seeder
// writes data WITHOUT that flag (otherwise the cleanup would nuke it
// on the very next boot) and pre-sets the cleanup-done marker so any
// legacy demo-flagged payload from earlier builds is also left alone.
//
// Intended for marketing screenshots / social-media captures — the
// module is tiny, synchronous and safe to call from `main.tsx` before
// React hydrates.

import {
  DEMO_CLEANUP_DONE_KEY,
  DEMO_FLAG_KEY,
  FINYK_CUSTOM_CATS_KEY,
  FINYK_MANUAL_EXPENSES_KEY,
  FINYK_MANUAL_ONLY_KEY,
  FINYK_MONTHLY_PLAN_KEY,
  FINYK_QUICK_STATS_KEY,
  FINYK_TX_CACHE_KEY,
  FINYK_TX_CACHE_LAST_GOOD_KEY,
  FIRST_REAL_ENTRY_KEY,
  FIZRUK_MEASUREMENTS_KEY,
  FIZRUK_QUICK_STATS_KEY,
  FIZRUK_WORKOUTS_KEY,
  NUTRITION_LOG_KEY,
  NUTRITION_PREFS_KEY,
  NUTRITION_QUICK_STATS_KEY,
  NUTRITION_WATER_KEY,
  ONBOARDING_DONE_KEY,
  ROUTINE_QUICK_STATS_KEY,
  ROUTINE_STATE_KEY,
} from "./seedDemoData/keys";
import { seedFinyk } from "./seedDemoData/seedFinyk";
import { seedFizruk } from "./seedDemoData/seedFizruk";
import { seedHubQuickStats } from "./seedDemoData/seedHubQuickStats";
import { seedNutrition } from "./seedDemoData/seedNutrition";
import { seedRoutine } from "./seedDemoData/seedRoutine";
import { removeKey, writeRaw } from "./seedDemoData/utils";
import { safeReadStringLS } from "@shared/lib/storage/storage";

const SEEDED_KEYS = [
  DEMO_FLAG_KEY,
  FINYK_MANUAL_EXPENSES_KEY,
  FINYK_CUSTOM_CATS_KEY,
  FINYK_MONTHLY_PLAN_KEY,
  FINYK_MANUAL_ONLY_KEY,
  FINYK_TX_CACHE_KEY,
  FINYK_TX_CACHE_LAST_GOOD_KEY,
  FIZRUK_WORKOUTS_KEY,
  FIZRUK_MEASUREMENTS_KEY,
  ROUTINE_STATE_KEY,
  NUTRITION_LOG_KEY,
  NUTRITION_PREFS_KEY,
  NUTRITION_WATER_KEY,
  FINYK_QUICK_STATS_KEY,
  FIZRUK_QUICK_STATS_KEY,
  ROUTINE_QUICK_STATS_KEY,
  NUTRITION_QUICK_STATS_KEY,
  ONBOARDING_DONE_KEY,
  FIRST_REAL_ENTRY_KEY,
  DEMO_CLEANUP_DONE_KEY,
];

/** Write the full demo payload. Safe to call multiple times. */
export function seedDemoData(): void {
  // Skip the one-time cleanup that would otherwise nuke demo-flagged
  // rows on the next boot.
  writeRaw(DEMO_CLEANUP_DONE_KEY, "1");
  // Skip the welcome / onboarding splash.
  writeRaw(ONBOARDING_DONE_KEY, "1");
  // Tell the «first real entry» analytics gate that we've already fired.
  writeRaw(FIRST_REAL_ENTRY_KEY, "1");

  seedFinyk();
  seedFizruk();
  seedRoutine();
  seedNutrition();
  seedHubQuickStats();

  writeRaw(DEMO_FLAG_KEY, "1");
}

/** Wipe everything the seeder writes. */
export function resetDemoData(): void {
  for (const k of SEEDED_KEYS) removeKey(k);
}

/**
 * `true` when the local store currently holds a demo payload. Read
 * synchronously from localStorage so the boot path can fork before
 * React mounts. Used by the FTUX-banner (S4.1) to surface the
 * "Це приклад. Створити свій?" CTA. Goes through the boundary helper
 * so private-mode / corrupted-quota errors degrade to "no demo" the
 * same way every other storage read does.
 */
export function isDemoMode(): boolean {
  return safeReadStringLS(DEMO_FLAG_KEY) === "1";
}

/**
 * Called from `main.tsx` on every cold start. If the current URL has
 * `?demo=1` (alias: `?demo=seed`), seed the store and reload onto `/`.
 * `?demo=reset` clears the seeded payload and reloads. All other URLs
 * return immediately.
 */
export function runDemoSeedFromUrl(): void {
  if (typeof window === "undefined") return;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(window.location.search);
  } catch {
    return;
  }
  const mode = params.get("demo");
  if (!mode) return;

  if (mode === "reset") {
    resetDemoData();
  } else if (mode === "1" || mode === "seed") {
    seedDemoData();
  } else {
    return;
  }

  // Strip the query param and reload so the rest of the boot sequence
  // (storageManager migrations, AuthProvider, etc.) sees a "clean" URL
  // against already-populated storage.
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete("demo");
    url.pathname = "/";
    window.location.replace(url.toString());
  } catch {
    window.location.replace("/");
  }
}
