import { test, expect, type Page } from "@playwright/test";

// This file targets the signup flow itself, so override the default
// `storageState` from `playwright.smoke.config.ts` (which logs in a
// pre-baked user) and start every test from a clean browser context.
// Without this override, `goto("/sign-in")` would immediately redirect
// to the authenticated hub and the assertions below would never run.
test.use({ storageState: { cookies: [], origins: [] } });

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

test("@critical auth: sign-up leads to authenticated hub surface", async ({
  page,
}) => {
  await seedLocalStorage(page);

  const nonce = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const email = `smoke_${nonce}@example.com`;
  const password = `pw_${nonce}_long_enough`;

  await page.goto("/sign-in", { waitUntil: "domcontentloaded" });

  // Switch to register mode.
  await page
    .getByRole("button", { name: "Немає акаунту? Зареєструватися" })
    .click();

  await page.fill("#auth-name", "Smoke User");
  await page.fill("#auth-email", email);
  await page.fill("#auth-password", password);

  await page.getByRole("button", { name: "Зареєструватися" }).click();

  // After successful sign-up, AuthContext invalidates `/api/v1/me` and the app
  // should land on the hub shell (not the /sign-in form).
  await expect(page).not.toHaveURL(/\/sign-in/);
  await expect(page.locator("main")).toBeVisible();
});
