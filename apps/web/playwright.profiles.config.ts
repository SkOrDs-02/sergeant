import { defineConfig, devices } from "@playwright/test";

/**
 * Багатопрофільний браузерний лейн (`pnpm --filter @sergeant/web e2e:profiles`).
 *
 * Окремий конфіг, а не проєкт у `playwright.smoke.config.ts`, з двох причин:
 *
 *  1. Smoke-лейн стартує з одного заздалегідь автентифікованого користувача
 *     (`storageState` з `auth.setup.ts`). Цей лейн навпаки — про **різні**
 *     стани акаунта, включно з анонімним і «той самий акаунт на чистому
 *     пристрої», тож будь-який спільний `storageState` ламає його зміст.
 *  2. Прогін повільний (реальний signup + CRUD + синхронізація) і тому
 *     локальний, як `e2e:mobile` — у CI він не підключений.
 *
 * Стек піднімається зовні (див. шапку `tests/profiles/profile-journeys.spec.ts`),
 * бо профілі йдуть проти живого сервера з реальною БД, а не проти моків.
 */
export default defineConfig({
  testDir: "./tests/profiles",
  fullyParallel: false,
  forbidOnly: !!process.env["CI"],
  retries: 0,
  // Профілі пишуть у спільну БД і ділять один preview-сервер.
  workers: 1,
  timeout: 90_000,
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
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
