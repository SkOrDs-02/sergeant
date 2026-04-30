import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config used exclusively for the accessibility (axe-core)
 * pass. We don't run end-to-end flows here — the goal is to snapshot the
 * four major hub surfaces and fail the build on WCAG `serious` /
 * `critical` violations. See `tests/a11y/axe.spec.ts`.
 *
 * The project is currently a Vite SPA; `npm run preview` serves the
 * built assets on :4173. We let Playwright start/stop the server so
 * CI doesn't have to manage a background process by itself.
 */
export default defineConfig({
  testDir: "./tests/a11y",
  testIgnore: ["**/ds-visual-qa.spec.ts"],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.PW_BASE_URL || "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
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
