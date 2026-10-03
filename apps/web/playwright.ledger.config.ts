import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/ledger",
  fullyParallel: false,
  forbidOnly: !!process.env["CI"],
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env["PW_BASE_URL"] || "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Та сама ручка, що в `playwright.config.ts` (a11y): контейнерні
    // QA-середовища постачають власний Chromium і забороняють
    // `playwright install`, а його ревізія не збігається з очікуваною.
    ...(process.env["PW_CHROMIUM_PATH"]
      ? {
          launchOptions: {
            executablePath: process.env["PW_CHROMIUM_PATH"],
          },
        }
      : {}),
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Спред замість `webServer: undefined`: під `exactOptionalPropertyTypes`
  // `undefined` не є `TestConfigWebServer`, і staged-typecheck червонів на
  // кожному дотику до файлу (той самий патерн, що в `playwright.config.ts`).
  ...(process.env["PW_SKIP_WEBSERVER"]
    ? {}
    : {
        webServer: {
          command:
            "npm run build && npm run preview -- --port 4173 --host 127.0.0.1",
          url: "http://127.0.0.1:4173",
          reuseExistingServer: !process.env["CI"],
          timeout: 360_000,
          stdout: "pipe",
          stderr: "pipe",
        },
      }),
});
