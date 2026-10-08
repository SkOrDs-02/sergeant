import { test, expect, type Page } from "@playwright/test";

// Override the default `storageState` from `playwright.smoke.config.ts`
// (pre-baked logged-in user) — this file's whole point is to test
// signup + cookie semantics from a fresh browser context.
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Скільки чекати, поки застосунок піде з `/sign-in` після реєстрації.
 *
 * Після sign-up `AnonymousDataMigrationProvider` блокує рендер роутера
 * (а отже і редирект з `/sign-in`) на час розвідки анонімних даних: на
 * новому пристрої це 5-13 с (див. `PROBE_GRACE_MS` у провайдері), на
 * webkit-раннері CI повільніше за chromium. Дефолтні 5 с `expect` це не
 * покривали: error-context падінь nightly 2026-10-05 показує
 * `status: Переношу дані в профіль і зберігаю на сервері…` при URL
 * `/sign-in`, тобто реєстрація пройшла, а гейт ще працював. Той самий
 * підхід (15 с) стоїть у `auth.setup.ts`; тут 30 с із запасом на webkit.
 */
const LEAVE_SIGN_IN_TIMEOUT_MS = 30_000;

// Реєстрація + гейт переносу + (в другому тесті) reload не вкладаються в
// дефолтні 30 с тесту разом із 30 с очікування редиректу.
test.setTimeout(90_000);

/**
 * Webkit / mobile-safari authentication regression suite (PR-48).
 *
 * Контекст: Sergeant deploy-иться як cross-origin pair (Vercel web ↔ Railway
 * API). Safari ITP блокує third-party cookies у iframe / storage-access-API
 * сценаріях; first-party cross-site fetch (top-frame `sergeant.app` → API)
 * залишається з cookie-flow, але regressions можуть прийти через зміни у
 * Better Auth cookie config (`useSecureCookies`, `sameSite`, `Domain`).
 *
 * Цей spec:
 *   1. Перевіряє sign-up → автентифікований hub flow на webkit + mobile-safari
 *      (за матрицею з `playwright.smoke.config.ts`).
 *   2. Перевіряє, що session cookie виставлена і переживає `page.reload()`
 *      (cookie persistence — основний сигнал, що ITP не зрізав auth-cookie).
 *
 * Запуск:
 *   pnpm --filter @sergeant/web e2e:auth                 # default project (chromium)
 *   pnpm --filter @sergeant/web exec playwright test \\
 *     -c playwright.smoke.config.ts --project=webkit --grep @auth
 *   pnpm --filter @sergeant/web exec playwright test \\
 *     -c playwright.smoke.config.ts --project=mobile-safari --grep @auth
 *
 * CI: nightly extended-e2e workflow (matrix: chromium/webkit/mobile-safari)
 * запускає весь `@auth` grep on schedule.
 */

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

async function signUpFlow(
  page: Page,
): Promise<{ email: string; password: string }> {
  const nonce = crypto.randomUUID();
  const email = `wk_${nonce}@example.com`;
  const password = `pw_${nonce}_long_enough`;

  await page.goto("/sign-in", { waitUntil: "domcontentloaded" });

  await page
    .getByRole("button", { name: "Немає акаунту? Зареєструватися" })
    .click();

  await page.fill("#auth-name", "Webkit Smoke User");
  await page.fill("#auth-email", email);
  await page.fill("#auth-password", password);

  await page.getByRole("button", { name: "Зареєструватися" }).click();

  await expect(page).not.toHaveURL(/\/sign-in/, {
    timeout: LEAVE_SIGN_IN_TIMEOUT_MS,
  });
  await expect(page.locator("main")).toBeVisible();

  return { email, password };
}

test("@auth @critical webkit: sign-up lands on authenticated hub", async ({
  page,
}) => {
  await seedLocalStorage(page);
  await signUpFlow(page);
});

test("@auth webkit: session cookie persists across page reload", async ({
  page,
  context,
}) => {
  await seedLocalStorage(page);
  await signUpFlow(page);

  // Better Auth cookie name: `better-auth.session_token` (no `__Host-` prefix
  // у v1.6.x — див. F5 у docs/governance/security/better-auth-crypto-review.md). У
  // smoke-environment-i web і API на 127.0.0.1 → cookie domain-less, path=/.
  const cookies = await context.cookies();
  const sessionCookie = cookies.find((c) =>
    c.name.includes("better-auth.session_token"),
  );
  expect(
    sessionCookie,
    "Better Auth session cookie повинна бути виставлена",
  ).toBeTruthy();
  // Path заявлений як "/", не доменно-обмежений у smoke
  expect(sessionCookie?.path).toBe("/");

  await page.reload({ waitUntil: "domcontentloaded" });

  // Після reload-у юзер не повинен потрапляти назад на /sign-in
  await expect(page).not.toHaveURL(/\/sign-in/, {
    timeout: LEAVE_SIGN_IN_TIMEOUT_MS,
  });
  await expect(page.locator("main")).toBeVisible();
});
