import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for visual regression via Argos CI.
 *
 * Runs only `tests/a11y/ds-visual-qa.spec.ts` (56 screenshots:
 * 4 viewports × 2 themes × 7 hub surfaces) and uploads them to
 * Argos when ARGOS_TOKEN is present. Without the token, Playwright
 * writes the local HTML report for manual inspection.
 *
 * Triggered by `.github/workflows/visual-regression.yml` on every PR.
 * Local run: `pnpm test:visual`
 */
export default defineConfig({
  testDir: "./tests/a11y",
  testMatch: ["**/ds-visual-qa.spec.ts"],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.ARGOS_TOKEN
    ? [["list"], ["@argos-ci/playwright/reporter"]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.PW_BASE_URL || "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.PW_SKIP_WEBSERVER
    ? undefined
    : {
        command:
          "npm run build && npm run preview -- --port 4173 --host 127.0.0.1",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        stdout: "pipe",
        stderr: "pipe",
      },
});
