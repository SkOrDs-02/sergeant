import { defineConfig, devices } from "@playwright/test";

// Mobile coarse-pointer UI audit lane. A dedicated config (not a project on
// playwright.ledger.config.ts) because the touch-target-floor assertions only
// hold under `pointer: coarse`, which the Pixel 5 descriptor emulates
// (isMobile + hasTouch → Chromium reports `(pointer: coarse)`). Running the
// same spec on a Desktop Chrome project would report every control below the
// 44px floor and fail spuriously. Build/preview stay VERCEL-unset so both
// resolve the same `../server/dist` outDir (see vite.config.js).
export default defineConfig({
  testDir: "./tests/mobile",
  fullyParallel: false,
  forbidOnly: !!process.env["CI"],
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env["PW_BASE_URL"] || "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 5"] },
    },
  ],
  webServer: process.env["PW_SKIP_WEBSERVER"]
    ? undefined
    : {
        command:
          "npm run build && npm run preview -- --port 4173 --host 127.0.0.1",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: !process.env["CI"],
        timeout: 360_000,
        stdout: "pipe",
        stderr: "pipe",
      },
});
