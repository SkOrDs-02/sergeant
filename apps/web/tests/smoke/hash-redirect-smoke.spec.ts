import { test, expect, type Page } from "@playwright/test";

/**
 * Hash-URL compat smoke — initiative 0006 §Phase 3.
 *
 * Legacy PWA installs / share-cards / push-notification landings from
 * before the path-based migration baked the route into the URL hash
 * (`https://app.example/#fizruk/workouts`). `HashRedirect.tsx` (mounted
 * in `Providers.tsx`) is the root-level compat shim: on a cold load at
 * `/` with a non-empty hash whose first segment is a known path-based
 * module id, it does a single `navigate(target, { replace: true })` onto
 * the canonical path URL (`/fizruk/workouts`).
 *
 * This guards the redirect contract the 0006 DONE-criteria list as
 * "Playwright e2e тест — pending". The deterministic signal is the URL:
 * Playwright's `toHaveURL` polls until the SPA navigation settles, so we
 * don't race the SQLite/SW warm-cache cycle (see `apps/web/AGENTS.md
 * § E2E smoke` smoke-environment gotcha — UI/state assertions backed by
 * SQLite are flaky under `vite preview`; the router URL is not).
 *
 * Tagged `@critical` so it rides the per-PR smoke lane
 * (`playwright.smoke.config.ts --grep @critical`) and reuses the shared
 * smoke web-server — no standalone server boot here.
 */

const SEEDED_LS: Record<string, string> = {
  hub_onboarding_done_v1: "1",
  hub_first_action_done_v1: "1",
  hub_vibe_picks_v1: JSON.stringify({
    picks: ["finyk", "fizruk", "nutrition", "routine"],
    firstActionPending: null,
    firstActionStartedAt: null,
    firstRealEntryAt: Date.now(),
    updatedAt: Date.now(),
  }),
  "sergeant.onboarding.module_first_seen.fizruk.v1": "1",
  "sergeant.whatsNew.lastSeenId.v1": "2026-05-06-cold-start",
};

async function seedLocalStorage(page: Page) {
  await page.addInitScript((entries: Record<string, string>) => {
    try {
      for (const [k, v] of Object.entries(entries)) {
        window.localStorage.setItem(k, v);
      }
    } catch {
      /* ignore */
    }
  }, SEEDED_LS);
}

test("@critical hash-redirect: legacy `/#fizruk/workouts` lands on `/fizruk/workouts`", async ({
  page,
}) => {
  await seedLocalStorage(page);

  // Cold-load the legacy root-level hash deep-link.
  await page.goto("/#fizruk/workouts", { waitUntil: "domcontentloaded" });

  // HashRedirect rewrites onto the canonical path-based URL. The hash is
  // dropped and the pathname becomes `/fizruk/workouts`.
  await expect(page).toHaveURL(/\/fizruk\/workouts$/, { timeout: 10_000 });

  // The fizruk module shell mounts at the redirected path — the hub
  // `<nav>` must be gone (we're inside a module, not on the hub home).
  await expect(page.getByRole("heading", { name: "Фізрук" })).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    page.getByRole("navigation", { name: "Розділи хабу" }),
  ).toHaveCount(0);
});
