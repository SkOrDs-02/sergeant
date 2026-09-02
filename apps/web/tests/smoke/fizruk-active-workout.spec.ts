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
 *     цього reload-у не детермінований — саме він зʼїдав `fizruk_rest_timer_done`
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
  await page.getByRole("button", { name: "Швидкий старт" }).click();
  await expect(page).toHaveURL(/\/fizruk\/workout\/[^/]+$/);

  // Аркуш готовності (спека `fizruk-readiness-check`) зʼявляється один раз на
  // тренування і перекриває сторінку — це навмисно, він і має спитати ДО
  // роботи. Тут його свідомо ПРОПУСКАЄМО: цей тест про потік
  // «старт → підхід → перезавантаження → фініш», а без відповіді підказка
  // поводиться рівно так, як до появи фічі.
  const readiness = page.getByRole("dialog", { name: "Як ти сьогодні?" });
  await expect(readiness).toBeVisible();
  await readiness.getByRole("button", { name: "Пропустити" }).click();
  await expect(readiness).toBeHidden();

  await page
    .getByPlaceholder("Пошук (жим, підтягування, спина…)")
    .fill("Жим штанги лежачи");
  // Локатор навмисно привʼязаний до `aria-controls="catalog-panel-*"`, а не
  // до «перша кнопка на сторінці з aria-expanded=false». Стара форма зламалась
  // від НАШОЇ Ж зміни: фікс V-8 з аудиту Фізрука переніс «Видалити» в
  // overflow-меню «⋯» на базі `DropdownMenu` (`ActiveWorkoutHeader.tsx`), а
  // його тригер за контрактом несе `aria-expanded` і стоїть у хедері — тобто
  // РАНІШЕ каталогу в DOM. `.first()` почав клікати «⋯», група вправ лишалась
  // згорнутою, і наступний крок падав по таймауту на неіснуючій кнопці вправи
  // (30 с × 2 спроби, кожен прогін CI з 2026-08-07).
  //
  // `aria-controls` тут — стабільний гачок: його ставить сам
  // `WorkoutCatalogSection` рівно на перемикачі групи, і жоден інший
  // контрол сторінки на нього не схожий.
  await page
    .locator('button[aria-controls^="catalog-panel-"][aria-expanded="false"]')
    .first()
    .click();
  await page
    .getByRole("button", { name: /Жим штанги лежачи/ })
    .first()
    .click();

  // Вага — `textbox`, а не `spinbutton`: поле перейшло на `type="text"` +
  // `inputMode="decimal"`, щоб приймати кому (під `type="number"` браузер
  // віддає порожній рядок, і «82,5» ставало 0). Повторення цілі, тож там
  // `type="number"` лишився.
  await page.getByRole("textbox", { name: "Вага в кілограмах" }).fill("42");
  await page.getByRole("spinbutton", { name: "Кількість повторень" }).fill("8");
  // Редизайн 2026-08 (рішення власника 01-A): rest-таймер більше НЕ стартує
  // з побічного ефекту в `onChange` поля повторень — його запускає явний тап
  // по ✓ «підхід зроблено». Саме та стара магія й плодила порожні 0×0-сети,
  // тож цей крок описував поведінку, яку ми свідомо прибрали.
  await page.getByRole("button", { name: /Підхід 1: зроблено/ }).click();
  await expect(page.getByTestId("rest-timer")).toBeVisible();
  // Скоуп саме на пігулку таймера, а не на `role="timer"`: цей role
  // описує лише циферблат із цифрами (кнопки ±15/±30 і «Пропустити» —
  // його сусіди), і ще один `role="timer"` живе в `HeroCard`. Скоуп на
  // роль тут падав по таймауту, скоуп без нього був би неоднозначним
  // після відкриття аркуша завершення з власною «Пропустити».
  await page
    .getByTestId("rest-timer")
    .getByRole("button", { name: "Пропустити" })
    .click();
  await page.waitForTimeout(2_500);

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForInitialSqliteRefresh(page, "fizruk");
  // Пропуск теж пишеться (`sleep: null, soreness: null`), тож після
  // перезавантаження аркуш НЕ повертається. Це не косметика: без запису
  // ознаки «вже питали» він вигулькував би на кожному оновленні сторінки
  // посеред тренування.
  await expect(readiness).toBeHidden();
  await expect(
    page.getByRole("textbox", { name: "Вага в кілограмах" }),
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
