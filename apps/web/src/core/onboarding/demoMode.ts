/**
 * Last validated: 2026-09-01
 * Status: Active
 *
 * Легкі demo-mode хелпери, які потрібні в критичному шляху завантаження.
 *
 * AI-CONTEXT: `DemoModeBadge` монтується в глобальному `AppShell`, тож усе,
 * що він імпортує статично, їде в eager-бандл. Поки `isDemoMode` /
 * `exitDemoToWizard` жили в `seedDemoData.ts`, разом з ними в критичний шлях
 * тягнулись усі шість сідерів демо-даних (~3 kB brotli) — те саме
 * «одне eager-ребро» з `AGENTS.md § Performance budgets` (CI-5, аудит
 * 2026-09). Тут лише ключі, storage-boundary і analytics; самі сідери
 * лишаються за `seedDemoData.ts`, який ці функції ре-експортує.
 */
import {
  DEMO_CLEANUP_DONE_KEY,
  DEMO_FLAG_KEY,
  FINYK_CHECKLIST_KEY,
  FINYK_CUSTOM_CATS_KEY,
  FINYK_MANUAL_EXPENSES_KEY,
  FINYK_MANUAL_ONLY_KEY,
  FINYK_MONTHLY_PLAN_KEY,
  FINYK_QUICK_STATS_KEY,
  FINYK_TX_CACHE_KEY,
  FINYK_TX_CACHE_LAST_GOOD_KEY,
  FIRST_REAL_ENTRY_KEY,
  FIZRUK_CHECKLIST_KEY,
  FIZRUK_MEASUREMENTS_KEY,
  FIZRUK_PUSHUPS_SEED_KEY,
  FIZRUK_QUICK_STATS_KEY,
  FIZRUK_TEMPLATES_KEY,
  FIZRUK_WORKOUTS_KEY,
  NUTRITION_CHECKLIST_KEY,
  NUTRITION_LOG_KEY,
  NUTRITION_PREFS_KEY,
  NUTRITION_QUICK_STATS_KEY,
  NUTRITION_WATER_KEY,
  ONBOARDING_DONE_KEY,
  ROUTINE_CHECKLIST_KEY,
  ROUTINE_QUICK_STATS_KEY,
  ROUTINE_STATE_KEY,
} from "./seedDemoData/keys";
import { safeReadStringLS, safeRemoveLS } from "@shared/lib/storage/storage";
import { trackEvent, ANALYTICS_EVENTS } from "../observability/analytics";

/** Усі ключі, які пише демо-сідер (`seedDemoData`). */
export const SEEDED_KEYS: readonly string[] = [
  DEMO_FLAG_KEY,
  FINYK_MANUAL_EXPENSES_KEY,
  FINYK_CUSTOM_CATS_KEY,
  FINYK_MONTHLY_PLAN_KEY,
  FINYK_MANUAL_ONLY_KEY,
  FINYK_TX_CACHE_KEY,
  FINYK_TX_CACHE_LAST_GOOD_KEY,
  FIZRUK_WORKOUTS_KEY,
  FIZRUK_MEASUREMENTS_KEY,
  FIZRUK_TEMPLATES_KEY,
  FIZRUK_PUSHUPS_SEED_KEY,
  ROUTINE_STATE_KEY,
  NUTRITION_LOG_KEY,
  NUTRITION_PREFS_KEY,
  NUTRITION_WATER_KEY,
  FINYK_QUICK_STATS_KEY,
  FIZRUK_QUICK_STATS_KEY,
  ROUTINE_QUICK_STATS_KEY,
  NUTRITION_QUICK_STATS_KEY,
  FINYK_CHECKLIST_KEY,
  FIZRUK_CHECKLIST_KEY,
  ROUTINE_CHECKLIST_KEY,
  NUTRITION_CHECKLIST_KEY,
  ONBOARDING_DONE_KEY,
  FIRST_REAL_ENTRY_KEY,
  DEMO_CLEANUP_DONE_KEY,
];

/** Wipe everything the seeder writes. */
export function resetDemoData(): void {
  for (const k of SEEDED_KEYS) safeRemoveLS(k);
}

/**
 * Canonical "leave demo" action, shared by `DemoModeBanner`'s
 * «Створити свій» CTA and the global `DemoModeBadge`. Wipes the demo
 * payload and hard-navigates to `/welcome` so the regular onboarding
 * flow takes over against an empty store. The hard `assign` (full
 * reload) is deliberate: it rebuilds the React Router tree from
 * scratch, so it never desyncs the `useHubNavigation` FSM the way an
 * in-app `navigate()` would. Fires `DEMO_TO_WIZARD_CONFIRMED` first so
 * the event survives the navigation.
 */
export function exitDemoToWizard(): void {
  trackEvent(ANALYTICS_EVENTS.DEMO_TO_WIZARD_CONFIRMED);
  resetDemoData();
  try {
    window.location.assign("/welcome");
  } catch {
    /* jsdom / hardened env — store is already reset, nav is best-effort. */
  }
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
