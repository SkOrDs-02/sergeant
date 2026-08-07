import { defineConfig, devices } from "@playwright/test";

/**
 * Прийомний прогін бети (`pnpm --filter @sergeant/web e2e:beta`).
 *
 * Дизайн, персони, manual-чекліст і критерії приймання —
 * `docs/90-work/beta-launch/beta-browser-run.md`; канон кроків —
 * `tests/beta/betaMatrix.ts`.
 *
 * Окремий конфіг, а не проєкт у `playwright.smoke.config.ts`, з тих
 * самих причин, що й `playwright.profiles.config.ts` (спільний
 * `storageState` ламає зміст персон; лейн повільний і локальний), плюс
 * одна власна: ціль тут — ЖИВЕ бета-середовище (`PW_BETA_BASE_URL`),
 * а без цієї змінної — локальна репетиція проти стека `e2e:profiles`.
 *
 * У CI лейн не підключений свідомо: бойовий режим пише в прод-базу і
 * палить реальні AI-токени — це операторський прогін перед хвилею
 * інвайтів, а не PR-гейт.
 */
export default defineConfig({
  testDir: "./tests/beta",
  fullyParallel: false,
  forbidOnly: !!process.env["CI"],
  retries: 0,
  // Персони пишуть у спільну (у бойовому режимі — прод!) базу, ділять
  // бюджетний лічильник AI-повідомлень і залежні одна від одної
  // (BT4 перевіряє записи BT3), тому один worker.
  workers: 1,
  // Живі AI-відповіді йдуть до 90 с — персональний таймаут щедріший за
  // профільний лейн.
  timeout: 150_000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env["PW_BETA_BASE_URL"] || "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Контейнерні QA-середовища (напр. Claude Code on the web) постачають
    // власний Chromium і забороняють `playwright install`; ревізія може не
    // збігатися з тією, що очікує запінена версія @playwright/test. Ручка
    // дозволяє вказати готовий бінарник, не докачуючи нічого.
    ...(process.env["PW_CHROMIUM_PATH"]
      ? { launchOptions: { executablePath: process.env["PW_CHROMIUM_PATH"] } }
      : {}),
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
