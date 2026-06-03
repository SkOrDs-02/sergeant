import { test as setup, expect } from "@playwright/test";
// Re-exported for backward compatibility with any importer that referenced
// it here; the canonical home is `./authState` (side-effect-free, so the
// Playwright config can import the path without loading this test file).
import { HUB_USER_AUTH_STATE } from "./authState";

export { HUB_USER_AUTH_STATE };

/**
 * Playwright setup project — signs up a single Better Auth test user once
 * and saves the post-signup browser state (cookies + localStorage) to a
 * JSON file that downstream `@critical` smoke tests reuse via the
 * `storageState` option in `playwright.smoke.config.ts`.
 *
 * Why a single setup project instead of inline signup per test:
 *   - `bottom-nav.spec.ts` visits `/` and `/?module=…` directly and
 *     expects the authenticated hub surface. Without a session cookie
 *     the app correctly redirects to `/sign-in`, so the suite has been
 *     failing in CI even though the assertions are correct.
 *   - Doing a full sign-up per test (the pattern in `auth.spec.ts`,
 *     which is the right shape for testing the auth flow itself) bakes
 *     ~5 s of HTTP latency into every other suite that just needs an
 *     authenticated session. The setup runs once and feeds everyone.
 *
 * `auth.spec.ts` is unchanged — it still does its own per-test signup
 * because the assertion target IS the signup flow, not the hub.
 */

setup("authenticate hub user", async ({ page }) => {
  // Deterministic email per run (CI artifact persistence is bounded; we
  // don't reuse accounts across runs because the smoke DB is wiped).
  const nonce = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const email = `smoke_setup_${nonce}@example.com`;
  const password = `pw_${nonce}_long_enough`;

  await page.goto("/sign-in", { waitUntil: "domcontentloaded" });

  // The shared `<AuthForm>` defaults to sign-in mode; toggle to register.
  await page
    .getByRole("button", { name: "Немає акаунту? Зареєструватися" })
    .click();

  await page.fill("#auth-name", "Smoke Setup User");
  await page.fill("#auth-email", email);
  await page.fill("#auth-password", password);

  await page.getByRole("button", { name: "Зареєструватися" }).click();

  // After successful sign-up, AuthContext invalidates `/api/v1/me` and the
  // router redirects out of /sign-in (to /welcome for fresh accounts; the
  // exact destination doesn't matter here — only that the cookie is set).
  await expect(page).not.toHaveURL(/\/sign-in/, { timeout: 15_000 });

  // Persist cookies + localStorage so subsequent projects start with the
  // session already established.
  await page.context().storageState({ path: HUB_USER_AUTH_STATE });
});
