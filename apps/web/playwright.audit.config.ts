import { defineConfig } from "@playwright/test";

/**
 * Лейн аудиту контрасту й поверхонь (WCAG AA). Не CI-гейт: збирає виміри в
 * JSON (`AUDIT_OUT`), а не блокує. Спека — `tests/a11y/contrast-surfaces.audit.ts`
 * (суфікс `.audit.ts` не потрапляє ні в `playwright.config.ts`, ні в `test:a11y`).
 *
 * Status: Active — діагностичний інструмент, як `playwright.sweep.config.ts`.
 * Гейти лишаються `playwright.config.ts` (axe) і `contrast.test.js` (токени).
 */
export default defineConfig({
  testDir: "./tests/a11y",
  testMatch: "**/*.audit.ts",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 30 * 60_000,
  reporter: [["list"]],
  use: {
    baseURL: process.env["PW_BASE_URL"] || "http://127.0.0.1:4173",
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
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
  projects: [{ name: "chromium", use: {} }],
  ...(process.env["PW_SKIP_WEBSERVER"]
    ? {}
    : {
        webServer: {
          command:
            "npm run build && npm run preview -- --port 4173 --host 127.0.0.1",
          url: "http://127.0.0.1:4173",
          env: { VITE_E2E_SEED: "true" },
          reuseExistingServer: true,
          timeout: 360_000,
          stdout: "pipe" as const,
          stderr: "pipe" as const,
        },
      }),
});
