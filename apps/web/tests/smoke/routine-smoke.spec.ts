import { test, expect, type Page } from "@playwright/test";

/**
 * Module smoke — РУТИНА (routine).
 *
 * Audit `2026-05-13-testing-devx-roast.md` §P1-3. Minimal cold-load mount
 * + key-element assert; deep flows live in the routine RTL suites.
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
  "sergeant.onboarding.module_first_seen.routine.v1": "1",
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

test("@critical routine: cold-load mounts module shell", async ({ page }) => {
  await seedLocalStorage(page);

  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/?module=routine", { waitUntil: "domcontentloaded" });

  await expect(page.getByText("РУТИНА", { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    page.getByRole("navigation", { name: "Розділи хабу" }),
  ).toHaveCount(0);

  expect(errors, "Uncaught page errors on routine cold load").toEqual([]);
});
