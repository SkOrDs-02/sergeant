import { defineConfig, devices } from "@playwright/test";

// Живий прогін durability (офлайн, reload, sync, анонім → акаунт, кілька
// пристроїв). Стек піднімається вручну: API :3000 на локальній verification-БД,
// `vite preview` :4173. Жодного storageState — кожен «пристрій» чистий.
export default defineConfig({
  testDir: "./tests/verification-live",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 600_000,
  reporter: [["list"]],
  outputDir: process.env["PW_VERIFY_OUT"] || "test-results-verify",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env["PW_BASE_URL"] || "http://127.0.0.1:4173",
    actionTimeout: 20_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
