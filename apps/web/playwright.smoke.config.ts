import { defineConfig, devices } from "@playwright/test";
import { HUB_USER_AUTH_STATE } from "./tests/smoke/authState";

/**
 * Smoke E2E config (separate from the a11y lane).
 *
 * This lane boots:
 *  - Postgres via docker-compose (root `docker-compose.yml`)
 *  - API server (`@sergeant/server`, :3000)
 *  - Web preview (`@sergeant/web`, :4173) built against VITE_API_BASE_URL=:3000
 *
 * Setup-project pattern: the `setup` project (`tests/smoke/auth.setup.ts`)
 * runs once before any browser-engine project, signs up a Better Auth
 * test user, and saves the post-signup browser state to
 * `tests/smoke/.auth/hub-user.json`. The chromium/webkit/mobile-safari
 * projects then inherit that state via `storageState`, so suites that
 * visit `/` or `/?module=…` (e.g. `bottom-nav.spec.ts`) start from an
 * authenticated session instead of being redirected to /sign-in.
 *
 * The auth-state path lives in the side-effect-free `tests/smoke/authState.ts`
 * (NOT `auth.setup.ts`): this config imports the constant, and a config must
 * never import a module that calls `test()`/`setup()` at load time.
 *
 * `auth.spec.ts` and `auth-webkit.spec.ts` are deliberately unaffected
 * — they target the signup flow itself, so re-using a session would
 * defeat the assertion.
 *
 * Note: env vars are read via bracket notation (`process.env["CI"]`) to
 * satisfy `noPropertyAccessFromIndexSignature`/`exactOptionalPropertyTypes`
 * when this config is type-checked in isolation (pre-commit staged-typecheck).
 */
const isCI = !!process.env["CI"];

const webServer = process.env["PW_SKIP_WEBSERVER"]
  ? undefined
  : {
      // Keep `@sergeant/server dev` in background and
      // leave `web preview` in foreground for Playwright to manage.
      command: "node ./tests/smoke/start-smoke-webserver.mjs",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: !isCI,
      timeout: 240_000,
      stdout: "pipe" as const,
      stderr: "pipe" as const,
      env: {
        ...process.env,
        DATABASE_URL:
          process.env["DATABASE_URL"] ||
          "postgresql://hub:hub@127.0.0.1:5432/hub",
        BETTER_AUTH_SECRET:
          process.env["BETTER_AUTH_SECRET"] ||
          // 32+ chars, deterministic but non-production.
          "smoke_test_better_auth_secret_32_chars_min",
        AI_QUOTA_DISABLED: process.env["AI_QUOTA_DISABLED"] || "1",
        VITE_API_BASE_URL:
          process.env["VITE_API_BASE_URL"] || "http://127.0.0.1:3000",
        ALLOWED_ORIGINS:
          process.env["ALLOWED_ORIGINS"] || "http://127.0.0.1:4173",
        // Better Auth derives cookie domain from baseURL. Without this,
        // baseURL falls back to `http://localhost:3000`, which sets cookies
        // for `localhost`. The web preview and API both run on 127.0.0.1,
        // and browsers make XHR/fetch to http://127.0.0.1:3000 (via
        // VITE_API_BASE_URL). Chromium treats `localhost` and `127.0.0.1`
        // as the same loopback host and sends the cookie either way; WebKit
        // does not — it enforces strict hostname-based cookie scoping, so a
        // `localhost` cookie is never sent to `127.0.0.1:3000`. After
        // page.reload(), the session fetch returns 401 and WebKit redirects
        // back to /sign-in. Pinning BETTER_AUTH_URL to the 127.0.0.1 address
        // ensures the Set-Cookie hostname matches the fetch hostname on all
        // browser engines. Prod is unaffected: BETTER_AUTH_URL is already set
        // to the Railway URL in production env.
        BETTER_AUTH_URL:
          process.env["BETTER_AUTH_URL"] || "http://127.0.0.1:3000",
      },
    };

export default defineConfig({
  testDir: "./tests/smoke",
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env["PW_BASE_URL"] || "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // Webkit + mobile-safari додані у PR-48 (`docs/initiatives/stack-pulse-2026-05/pr-10-better-auth-security-review.md`).
  // На local запуску браузерні движки tree-shake-аються через `--project chromium` за замовчуванням
  // (див. webServer config). У CI extended-e2e.yml prov-ить webkit на nightly-cron-i; для PR-у
  // з `extended-e2e` label-ом це теж активується. Локально webkit працює тільки після `pnpm exec
  // playwright install webkit`, тож chromium лишається default-project-ом для DX.
  projects: [
    {
      // Runs `tests/smoke/auth.setup.ts` once before all browser-engine
      // projects. Produces `tests/smoke/.auth/hub-user.json` (gitignored).
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: HUB_USER_AUTH_STATE,
      },
      dependencies: ["setup"],
    },
    {
      name: "webkit",
      use: {
        ...devices["Desktop Safari"],
        storageState: HUB_USER_AUTH_STATE,
      },
      dependencies: ["setup"],
    },
    {
      name: "mobile-safari",
      use: {
        ...devices["iPhone 14"],
        storageState: HUB_USER_AUTH_STATE,
      },
      dependencies: ["setup"],
    },
  ],
  ...(webServer ? { webServer } : {}),
});
