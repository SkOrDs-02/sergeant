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
  FIRST_REAL_ENTRY_KEY,
  ONBOARDING_DONE_KEY,
} from "./seedDemoData/keys";
import { resetDemoData } from "./demoMode";
import { seedChecklists } from "./seedDemoData/seedChecklists";
import { seedFinyk } from "./seedDemoData/seedFinyk";
import { seedFizruk } from "./seedDemoData/seedFizruk";
import { seedHubQuickStats } from "./seedDemoData/seedHubQuickStats";
import { seedNutrition } from "./seedDemoData/seedNutrition";
import { seedRoutine } from "./seedDemoData/seedRoutine";
import { safeWriteLS } from "@shared/lib/storage/storage";
import { trackEvent, ANALYTICS_EVENTS } from "../observability/analytics";

// Легкі хелпери винесено в `demoMode.ts`, щоб `DemoModeBadge` (глобальний
// AppShell) не тягнув сідери в eager-бандл (CI-5, аудит 2026-09). Тут —
// ре-експорт для наявних імпортерів.
export { exitDemoToWizard, isDemoMode, resetDemoData } from "./demoMode";

/** Write the full demo payload. Safe to call multiple times. */
export function seedDemoData(): void {
  // Skip the one-time cleanup that would otherwise nuke demo-flagged
  // rows on the next boot.
  safeWriteLS(DEMO_CLEANUP_DONE_KEY, "1");
  // Skip the welcome / onboarding splash.
  safeWriteLS(ONBOARDING_DONE_KEY, "1");
  // Tell the «first real entry» analytics gate that we've already fired.
  safeWriteLS(FIRST_REAL_ENTRY_KEY, "1");

  seedFinyk();
  seedFizruk();
  seedRoutine();
  seedNutrition();
  seedHubQuickStats();
  seedChecklists();

  safeWriteLS(DEMO_FLAG_KEY, "1");
}

/**
 * Cold-start drift reset. While the store is in demo mode, wipe the
 * seeded payload and write it fresh so any example the visitor edited
 * during the previous session reverts to the canonical sample on the
 * next boot. The demo stays fully editable *within* a session — this
 * only restores a clean example on each cold-start. Called from
 * `maybeRunOnboarding` whenever `isDemoMode()` is already true and the
 * URL carries no explicit `?demo` handshake. The `reset` precedes the
 * `seed` so keys dropped from a newer demo build don't linger.
 */
export function reseedDemoData(): void {
  resetDemoData();
  seedDemoData();
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
    // Mirror the welcome-CTA path (`startDemoAndGoHome` in
    // `WelcomeScreen.tsx`) so the URL handshake also lands in the
    // demo funnel. The vocabulary `source: "deeplink"` is the one
    // documented next to `ANALYTICS_EVENTS.DEMO_STARTED` in
    // `packages/shared/src/lib/analyticsEvents.ts`.
    // Both transports inside `trackEvent` (PostHog queue + the
    // `hub_analytics_log_v1` ring-buffer) survive the immediate
    // `window.location.replace()` below.
    trackEvent(ANALYTICS_EVENTS.DEMO_STARTED, { source: "deeplink" });
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
