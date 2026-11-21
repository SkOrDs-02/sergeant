import { createHmac } from "node:crypto";
import { expect, type Page } from "@playwright/test";

/**
 * sec-46 / priv-29: з межею `EMAIL_VERIFICATION_REQUIRED_FROM` реєстрація
 * сесії не видає, а показує «Перевір пошту». Справжнього листа smoke-лейн не
 * читає, тож тут клік у ньому відтворюється напряму: токен підтвердження
 * той самий HS256-JWT, що будує Better Auth (`createEmailVerificationToken`
 * у `better-auth/dist/api/routes/email-verification.mjs`), підписаний
 * smoke-секретом, а `GET /api/auth/verify-email` за
 * `autoSignInAfterVerification` ставить сесійну куку.
 *
 * AI-DANGER: це лише тестовий код Playwright. Ні в бандл вебу, ні в роути
 * API він не потрапляє, і окремого серверного ендпоінта «підтвердити без
 * листа» немає й бути не повинно. Хелпер відмовляється працювати поза
 * loopback-API, у `NODE_ENV=production` і з секретом, якого не задав сам
 * smoke-лейн, щоб випадковий запуск проти справжнього сервера нічого не
 * підписав.
 */

/** Той самий дефолт, що в `playwright.smoke.config.ts` і `ci.yml`. */
export const SMOKE_BETTER_AUTH_SECRET =
  "smoke_test_better_auth_secret_32_chars_min";

const CHECK_EMAIL_HEADING = "Перевір пошту";

function apiBase(): string {
  return process.env["VITE_API_BASE_URL"] ?? "http://127.0.0.1:3000";
}

function assertSmokeOnly(api: string): string {
  if (process.env["NODE_ENV"] === "production") {
    throw new Error("smoke email verification is disabled in production");
  }
  const host = new URL(api).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`smoke email verification refuses non-loopback API ${api}`);
  }
  return process.env["BETTER_AUTH_SECRET"] || SMOKE_BETTER_AUTH_SECRET;
}

const b64url = (input: string | Buffer) =>
  Buffer.from(input).toString("base64url");

/** HS256 JWT `{ email }` з годинним строком, як у Better Auth. */
export function mintVerificationToken(
  email: string,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): string {
  const header = b64url(JSON.stringify({ alg: "HS256" }));
  const payload = b64url(
    JSON.stringify({
      email: email.toLowerCase(),
      iat: nowSec,
      exp: nowSec + 3600,
    }),
  );
  const signature = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

/**
 * Відкриває посилання підтвердження в поточній вкладці: API ставить сесійну
 * куку і редиректить на `callbackPath` вебу.
 */
export async function verifyEmailInBrowser(
  page: Page,
  email: string,
  callbackPath = "/",
): Promise<void> {
  const api = apiBase();
  const secret = assertSmokeOnly(api);
  const webOrigin = new URL(page.url()).origin;
  const url = new URL("/api/auth/verify-email", api);
  url.searchParams.set("token", mintVerificationToken(email, secret));
  url.searchParams.set("callbackURL", `${webOrigin}${callbackPath}`);
  await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
}

/**
 * Після кліку «Зареєструватися» чекає одного з двох станів: вихід із
 * `/sign-in` (межу не задано, сесія вже є) або екран «Перевір пошту».
 * Не навігує, тож стан сторінки (наприклад, буфер `__hubAnalytics`) ще
 * можна прочитати до `completeSignUp`.
 */
export async function waitForSignUpOutcome(
  page: Page,
  timeout = 15_000,
): Promise<"session" | "check-email"> {
  const checkEmail = page.getByRole("heading", { name: CHECK_EMAIL_HEADING });
  await expect
    .poll(
      async () =>
        !/\/sign-in/.test(new URL(page.url()).pathname) ||
        (await checkEmail.isVisible()),
      { timeout },
    )
    .toBe(true);
  return (await checkEmail.isVisible()) ? "check-email" : "session";
}

/**
 * Після кліку «Зареєструватися»: якщо сервер попросив перевірити пошту,
 * підтверджує адресу і чекає виходу з `/sign-in`. Повертає, чи довелось
 * підтверджувати (тобто чи активна межа на smoke-сервері).
 */
export async function completeSignUp(
  page: Page,
  email: string,
  options: { callbackPath?: string; timeout?: number } = {},
): Promise<boolean> {
  const timeout = options.timeout ?? 15_000;
  if ((await waitForSignUpOutcome(page, timeout)) === "session") return false;
  await verifyEmailInBrowser(page, email, options.callbackPath);
  await expect(page).not.toHaveURL(/\/sign-in/, { timeout });
  return true;
}
