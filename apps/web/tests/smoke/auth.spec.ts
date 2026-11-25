import { test, expect, type Page } from "@playwright/test";
import { completeSignUp, waitForSignUpOutcome } from "./smokeEmailVerification";

// This file targets the signup flow itself, so override the default
// `storageState` from `playwright.smoke.config.ts` (which logs in a
// pre-baked user) and start every test from a clean browser context.
// Without this override, `goto("/sign-in")` would immediately redirect
// to the authenticated hub and the assertions below would never run.
test.use({ storageState: { cookies: [], origins: [] } });

const SEEDED_LS: Record<string, string> = {
  hub_onboarding_done_v1: "1",
  // Банер згоди на аналітику не має перекривати UI під тестом (рішення «ні»).
  "sergeant.analytics_consent_decision.v1": JSON.stringify({ v: "denied" }),
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

async function submitSignUp(page: Page, email: string, password: string) {
  await page.goto("/sign-in", { waitUntil: "domcontentloaded" });

  // Switch to register mode.
  await page
    .getByRole("button", { name: "Немає акаунту? Зареєструватися" })
    .click();

  await page.fill("#auth-name", "Smoke User");
  await page.fill("#auth-email", email);
  await page.fill("#auth-password", password);

  await page.getByRole("button", { name: "Зареєструватися" }).click();
}

test("@critical auth: sign-up leads to authenticated hub surface", async ({
  page,
}) => {
  await seedLocalStorage(page);

  const nonce = crypto.randomUUID();
  const email = `smoke_${nonce}@example.com`;
  const password = `pw_${nonce}_long_enough`;

  await submitSignUp(page, email, password);

  // sec-46: з межею підтвердження сесію дає клік у листі. Посилання веде
  // туди ж, куди й справжній лист (`/verify-email`), а сторінка сама
  // відносить на хаб.
  await completeSignUp(page, email, { callbackPath: "/verify-email" });
  await expect(page).not.toHaveURL(/\/(sign-in|verify-email)/, {
    timeout: 15_000,
  });
  await expect(page.locator("main")).toBeVisible();
});

test("@critical auth: sec-46 повторна реєстрація зайнятої адреси виглядає як нова", async ({
  page,
  browser,
}) => {
  await seedLocalStorage(page);

  const nonce = crypto.randomUUID();
  const email = `smoke_dup_${nonce}@example.com`;
  const password = `pw_${nonce}_long_enough`;

  await submitSignUp(page, email, password);
  const first = await waitForSignUpOutcome(page);
  test.skip(
    first === "session",
    "EMAIL_VERIFICATION_REQUIRED_FROM не задано на smoke-сервері",
  );

  // Інший браузер, та сама адреса, інший пароль: відповідь та сама.
  const other = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  try {
    const otherPage = await other.newPage();
    await seedLocalStorage(otherPage);
    await submitSignUp(otherPage, email, `${password}_other`);
    expect(await waitForSignUpOutcome(otherPage)).toBe("check-email");
    await expect(otherPage.getByText(email)).toBeVisible();
    await expect(otherPage.getByText(/вже зареєстровано/i)).toHaveCount(0);
  } finally {
    await other.close();
  }
});
