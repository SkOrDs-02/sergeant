import { defineConfig } from "@playwright/test";

/**
 * Знімальний прогін (не CI-гейт): кадри 30 маршрутів для порівняння «до /
 * після» редизайну. Сценарій і порядок запуску: `tests/__shots__/README.md`.
 * Окремий `testDir`, тож у лейни a11y, smoke, mobile й інші цей каталог не
 * потрапляє. Сервер не піднімає: знімає вже запущений preview-білд з
 * `VITE_E2E_SEED=true` за `PW_BASE_URL`.
 *
 * Status: Scaffolded
 */
export default defineConfig({
  testDir: "./tests/__shots__",
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  // `finyk-month` на слабкому залізі готується довше за хвилину.
  timeout: 180_000,
  use: {
    baseURL: process.env["PW_BASE_URL"] || "http://127.0.0.1:4173",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    trace: "off",
    screenshot: "off",
  },
});
