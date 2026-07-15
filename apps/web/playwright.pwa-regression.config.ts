import { defineConfig, devices } from "@playwright/test";

/**
 * Браузерна перевірка публічних local-first PWA-регресій, яким не потрібні API
 * чи авторизований smoke-користувач. Цей контур не залежить від Docker, щоб
 * юридичні сторінки та сталість онбордингу можна було тестувати офлайн.
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
