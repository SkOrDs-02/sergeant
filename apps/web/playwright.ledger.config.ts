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
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env["PW_SKIP_WEBSERVER"]
    ? undefined
    : {
        command:
          "npm run build && npm run preview -- --port 4173 --host 127.0.0.1",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: !process.env["CI"],
        timeout: 180_000,
        stdout: "pipe",
        stderr: "pipe",
      },
});
