import { defineConfig, devices } from "@playwright/test";

/**
 * Ad-hoc sweep lane (не CI-гейт): один прогін по всіх поверхнях у двох
 * вьюпортах — десктоп і coarse-pointer Pixel 5. Збирає, а не блокує;
 * звіт — JSONL у `SWEEP_OUT`.
 *
 * Status: Scaffolded — діагностичний інструмент масового прогону, не гейт.
 * Гейти лишаються `playwright.config.ts` (a11y) і `playwright.mobile.config.ts`.
 */
export default defineConfig({
  testDir: "./tests/sweep",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 90_000,
  reporter: [["list"]],
  use: {
    baseURL: process.env["PW_BASE_URL"] || "http://127.0.0.1:4173",
    trace: "off",
    screenshot: "off",
    ...(process.env["PW_CHROMIUM_PATH"]
      ? {
          launchOptions: {
            executablePath: process.env["PW_CHROMIUM_PATH"],
          },
        }
      : {}),
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
  ...(process.env["PW_SKIP_WEBSERVER"]
    ? {}
    : {
        webServer: {
          command:
            "npm run build && npm run preview -- --port 4173 --host 127.0.0.1",
          url: "http://127.0.0.1:4173",
          reuseExistingServer: true,
          timeout: 360_000,
          stdout: "pipe" as const,
          stderr: "pipe" as const,
        },
      }),
});
