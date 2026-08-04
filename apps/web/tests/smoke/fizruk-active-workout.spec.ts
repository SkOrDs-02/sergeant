import { test, expect, type Page } from "@playwright/test";

import { seedFTUX } from "../utils/seedFTUX";
import { collectPageErrors, waitForInitialSqliteRefresh } from "./smokeHelpers";

/**
 * Ключ дзеркала подій аналітики у `sessionStorage`.
 *
 * Навіщо дзеркало, а не пряме читання `window.__hubAnalytics`:
 *
 *  1. Буфер `__hubAnalytics` — in-memory, тож будь-яке перезавантаження
 *     сторінки його обнуляє. У цьому тесті reload є навмисний (перевірка
 *     відновлення сесії), і ще один прилітає сам собою: на першому візиті
 *     service worker робить `skipWaiting()` + `clients.claim()`, звідки
 *     `controllerchange` → `window.location.reload()` у `main.tsx`. Момент
 *     цього reload-у не детермінований — саме він з'їдав `fizruk_rest_timer_done`
 *     і робив тест червоним.
 *  2. LocalStorage-кільце (`hub_analytics_log_v1`) тут теж не рятує: у
 *     smoke-стеку `vite preview` віддає сторінку без COOP/COEP, sqlite-wasm
 *     падає у memory-only VFS, і `flushLogToStorage` пише у SQLite, а не в
 *     сирий LS (детально — у шапці `onboarding-happy-path.spec.ts`).
 *
 * Тому дзеркалимо назви подій у сирий `sessionStorage` (він переживає reload
 * у тій самій вкладці) — з періодичним зливом і додатковим на `pagehide`.
 */
const ANALYTICS_MIRROR_KEY = "__smokeFizrukAnalytics";

async function installAnalyticsMirror(page: Page): Promise<void> {
  await page.addInitScript((key: string) => {
    let mirrored = 0;
    const flush = () => {
      const target = window as Window & {
        __hubAnalytics?: Array<{ eventName?: string }>;
      };
      const names = (target.__hubAnalytics ?? []).flatMap((event) =>
        typeof event.eventName === "string" ? [event.eventName] : [],
      );
      if (names.length <= mirrored) return;
      const prev = JSON.parse(
        window.sessionStorage.getItem(key) ?? "[]",
      ) as string[];
      window.sessionStorage.setItem(
        key,
        JSON.stringify([...prev, ...names.slice(mirrored)]),
      );
      mirrored = names.length;
    };
    window.setInterval(flush, 100);
    window.addEventListener("pagehide", flush);
  }, ANALYTICS_MIRROR_KEY);
}

async function readMirroredEventNames(page: Page): Promise<string[]> {
  return page.evaluate((key: string) => {
    const target = window as Window & {
      __hubAnalytics?: Array<{ eventName?: string }>;
    };
    const mirrored = JSON.parse(
      window.sessionStorage.getItem(key) ?? "[]",
    ) as string[];
    // Плюс те, що вже є в поточному буфері й могло не встигнути в дзеркало.
    const live = (target.__hubAnalytics ?? []).flatMap((event) =>
      typeof event.eventName === "string" ? [event.eventName] : [],
    );
    return [...mirrored, ...live];
  }, ANALYTICS_MIRROR_KEY);
}

test("@critical fizruk: start → set → refresh → resume → finish", async ({
  page,
}) => {
  await installAnalyticsMirror(page);
  await seedFTUX(page, "post-ftux");
  const errors = await collectPageErrors(page);

  await page.goto("/fizruk/workouts", { waitUntil: "domcontentloaded" });
  await waitForInitialSqliteRefresh(page, "fizruk");
  await page.getByRole("button", { name: "Quick Start" }).click();
  await expect(page).toHaveURL(/\/fizruk\/workout\/[^/]+$/);

  await page
    .getByPlaceholder("Пошук (жим, підтягування, спина…)")
    .fill("Жим штанги лежачи");
  await page.locator('button[aria-expanded="false"]').first().click();
  await page
    .getByRole("button", { name: /Жим штанги лежачи/ })
    .first()
    .click();

  await page.getByRole("spinbutton", { name: "Вага в кілограмах" }).fill("42");
  await page.getByRole("spinbutton", { name: "Кількість повторень" }).fill("8");
  await page
    .getByRole("timer")
    .getByRole("button", { name: "Пропустити" })
    .click();
  await page.waitForTimeout(2_500);

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForInitialSqliteRefresh(page, "fizruk");
  await expect(
    page.getByRole("spinbutton", { name: "Вага в кілограмах" }),
  ).toHaveValue("42");
  await expect(
    page.getByRole("spinbutton", { name: "Кількість повторень" }),
  ).toHaveValue("8");

  await page.getByRole("button", { name: "Завершити" }).click();
  // Крок «Самопочуття» аркуша `WorkoutFinishSheets` — його «Пропустити».
  await page.getByRole("button", { name: "Пропустити" }).click();
  await expect(
    page.getByRole("dialog", { name: "Щось болить?" }),
  ).toBeVisible();
  // Крок травм має власну копію — «Нічого не позначати», не «Пропустити»
  // (`messages.fizruk.injuries.skip`). Формулювання свідоме: позначити травму
  // — не те саме, що пропустити оцінку самопочуття.
  await page.getByRole("button", { name: "Нічого не позначати" }).click();
  await page.getByRole("button", { name: "Готово" }).click();
  await expect(page).toHaveURL(/\/fizruk\/workouts$/);

  const eventNames = await readMirroredEventNames(page);
  expect(eventNames).toContain("fizruk_workout_started");
  expect(eventNames).toContain("fizruk_rest_timer_done");
  expect(eventNames).toContain("fizruk_workout_finished");
  expect(errors, "Uncaught page errors in active-workout flow").toEqual([]);
});
