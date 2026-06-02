import { defineConfig, devices } from "@playwright/test";
import { HUB_USER_AUTH_STATE } from "./tests/smoke/auth.setup";

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
 * `auth.spec.ts` and `auth-webkit.spec.ts` are deliberately unaffected
 * — they target the signup flow itself, so re-using a session would
 * defeat the assertion.
 */
export default defineConfig({
  testDir: "./tests/smoke",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.PW_BASE_URL || "http://127.0.0.1:4173",
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
  webServer: process.env.PW_SKIP_WEBSERVER
    ? undefined
    : {
        // Keep `@sergeant/server dev` in background and
        // leave `web preview` in foreground for Playwright to manage.
        command: "node ./tests/smoke/start-smoke-webserver.mjs",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: !process.env.CI,
        timeout: 240_000,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          DATABASE_URL:
            process.env.DATABASE_URL ||
            "postgresql://hub:hub@127.0.0.1:5432/hub",
          BETTER_AUTH_SECRET:
            process.env.BETTER_AUTH_SECRET ||
            // 32+ chars, deterministic but non-production.
            "smoke_test_better_auth_secret_32_chars_min",
          AI_QUOTA_DISABLED: process.env.AI_QUOTA_DISABLED || "1",
          VITE_API_BASE_URL:
            process.env.VITE_API_BASE_URL || "http://127.0.0.1:3000",
          ALLOWED_ORIGINS:
            process.env.ALLOWED_ORIGINS || "http://127.0.0.1:4173",
        },
      },
});
