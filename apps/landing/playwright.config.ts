import { defineConfig, devices } from "@playwright/test";

/**
 * Конфіг лише для гейта доступності (axe-core).
 *
 * До 2026-09-15 лендінг не покривав жоден гейт якості: `test:a11y` і
 * Lighthouse в CI ганялись виключно по `apps/web`. Для сайту, чий єдиний
 * канал – пошук, це найдорожча дірка: зламана семантика б'є одночасно по
 * читачу з екранним диктором і по краулеру, який читає ту саму розмітку.
 *
 * Міряємо ПРЕРЕНДЕРЕНИЙ HTML, не дев-сервер: `dist/` – це рівно те, що
 * віддається людині й краулеру, разом із розміткою з `postbuild-seo.mjs`.
 * Тому webServer спершу білдить, а тоді піднімає `vite preview`.
 *
 * `PW_CHROMIUM_PATH` – та сама ручка, що в `apps/web/playwright.config.ts`:
 * контейнерні QA-середовища постачають власний Chromium і забороняють
 * `playwright install`, а його ревізія не збігається з запіненою.
 */
export default defineConfig({
  testDir: "./tests/a11y",
  fullyParallel: false,
  forbidOnly: !!process.env["CI"],
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 60_000,
  use: {
    baseURL: process.env["PW_BASE_URL"] || "http://127.0.0.1:4174",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...(process.env["PW_CHROMIUM_PATH"]
      ? { launchOptions: { executablePath: process.env["PW_CHROMIUM_PATH"] } }
      : {}),
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  ...(process.env["PW_SKIP_WEBSERVER"]
    ? {}
    : {
        webServer: {
          command:
            "pnpm run build && pnpm exec vite preview --port 4174 --host 127.0.0.1",
          url: "http://127.0.0.1:4174",
          reuseExistingServer: !process.env["CI"],
          timeout: 180_000,
          stdout: "pipe" as const,
          stderr: "pipe" as const,
        },
      }),
});
