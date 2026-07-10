import { test, expect, type Page } from "@playwright/test";

// Override the default `storageState` from `playwright.smoke.config.ts`
// (pre-baked logged-in user). Demo mode is an unauthenticated-visitor
// flow — it must render WITHOUT a session cookie (demo bypasses auth
// entirely; see `DEMO_LOCAL_USER_ID` in
// `apps/web/src/core/onboarding/onboardingGate.ts`).
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Demo-mode hub E2E — a visitor in demo mode lands on a populated hub:
 *
 *   demo flag in localStorage → cold boot detects `inDemo` →
 *   `maybeRunOnboarding` reseeds the sample payload → hub renders the
 *   `DemoModeBanner` retention nudge, no /welcome bounce, no auth.
 *
 * Why we seed the flag instead of clicking «Подивитись приклад»:
 *
 *   The `/welcome` demo CTA (`WelcomeScreen.startDemoAndGoHome`) calls
 *   `seedDemoData()` and then `window.location.assign("/")` — a HARD
 *   reload. In the Playwright smoke stack `vite preview` serves without
 *   COOP/COEP headers, so `sqlite-wasm` runs on a memory-only VFS that
 *   is wiped on every full-page navigation. `seedDemoData()` writes
 *   through `webKVStore` (SQLite-backed once bootstrapped), so the
 *   payload it writes does NOT survive the CTA's own reload here — the
 *   click round-trip is only meaningful where OPFS is available (prod /
 *   the deployed Vercel preview). We therefore seed the demo flag into
 *   RAW `localStorage` via `addInitScript` (re-applied on every
 *   navigation, so it is present before any app code runs) and assert
 *   the product surface: given demo state, the app renders the demo
 *   hub. The CTA-click wiring itself is unit-tested in
 *   `apps/web/src/core/app/WelcomeScreen` + `WelcomeModulePicker`.
 *
 *   All assertions stay in the single JS context produced by the one
 *   `page.goto("/")` below — no second hard reload — so the memory-VFS
 *   reset never comes into play.
 *
 * Tagged `@critical` so it joins the per-PR smoke lane
 * (`playwright.smoke.config.ts --grep @critical`, ci.yml `critical-flow`).
 */

// Raw-localStorage seed that puts the store in demo mode. Keys mirror
// `apps/web/src/core/onboarding/seedDemoData/keys.ts` verbatim — a
// rename there surfaces as a demo-mode regression this test catches.
const DEMO_LS: Record<string, string> = {
  // DEMO_FLAG_KEY — the single flag `isDemoMode()` / `DemoModeBanner`
  // read. Its presence is what forks the boot into demo mode.
  hub_demo_seeded_social_v1: "1",
  // DEMO_CLEANUP_DONE_KEY — suppress the one-time cleanup that would
  // otherwise wipe demo-flagged rows on the next boot.
  hub_demo_cleanup_v1_done: "1",
  // ONBOARDING_DONE_KEY — skip the /welcome splash so the hub renders.
  hub_onboarding_done_v1: "1",
  // FIRST_REAL_ENTRY_KEY — tell the activation gate the first entry
  // already happened (demo users are not brand-new founders).
  hub_first_real_entry_v1: "1",
  // Mark the latest "What's new" release seen so the auto-pop modal
  // (2.5s after hub mount via `useWhatsNew`) does not race the banner.
  "sergeant.whatsNew.lastSeenId.v1": "2026-05-06-cold-start",
};

async function seedDemoLocalStorage(page: Page) {
  await page.addInitScript((entries: Record<string, string>) => {
    try {
      for (const [k, v] of Object.entries(entries)) {
        window.localStorage.setItem(k, v);
      }
    } catch {
      /* ignore — incognito storage quotas, etc. */
    }
  }, DEMO_LS);
}

test("@critical demo: seeded demo state renders the demo hub with the retention banner", async ({
  page,
}) => {
  await seedDemoLocalStorage(page);

  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  // Cold boot straight to the hub. `main.tsx` → `maybeRunOnboarding`
  // reads the demo flag from raw LS (SQLite not yet bootstrapped at
  // that read) and reseeds the sample payload; the demo visitor is
  // never redirected to /sign-in (auth bypass) nor to /welcome
  // (ONBOARDING_DONE_KEY set).
  await page.goto("/", { waitUntil: "domcontentloaded" });

  // The hub rendered for the unauthenticated demo visitor AND the
  // retention banner is up. Region + copy come from
  // `apps/web/src/core/onboarding/DemoModeBanner.tsx`.
  const banner = page.getByRole("region", { name: "Демо-режим" });
  await expect(banner).toBeVisible({ timeout: 15_000 });
  await expect(banner.getByText("Це приклад")).toBeVisible();
  await expect(
    banner.getByRole("button", { name: "Створити свій" }),
  ).toBeVisible();

  // Stayed on the hub root — no bounce to /sign-in or /welcome.
  await expect(page).toHaveURL((url) => {
    return url.pathname === "/" || url.pathname === "";
  });

  expect(pageErrors, "Uncaught page errors in demo hub").toEqual([]);
});
