import { defineConfig, devices } from "@playwright/test";

/**
 * Browser proof for public, local-first PWA regressions that do not need the
 * API or an authenticated smoke-test user. Keep this lane independent from
 * Docker so legal pages and onboarding persistence remain testable offline.
 */
export default defineConfig({
  testDir: "./tests/smoke",
  testMatch: /pwa-feedback-regressions\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 14"] } },
  ],
  webServer: {
    command: "pnpm exec vite preview --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
