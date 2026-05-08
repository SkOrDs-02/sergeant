import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke E2E config (separate from the a11y lane).
 *
 * This lane boots:
 *  - Postgres via docker-compose (root `docker-compose.yml`)
 *  - API server (`@sergeant/server`, :3000)
 *  - Web preview (`@sergeant/web`, :4173) built against VITE_API_BASE_URL=:3000
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
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 14"] },
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
