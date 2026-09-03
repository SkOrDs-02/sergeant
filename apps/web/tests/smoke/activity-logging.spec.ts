import { test, expect } from "@playwright/test";

import { seedFTUX } from "../utils/seedFTUX";
import { collectPageErrors, waitForInitialSqliteRefresh } from "./smokeHelpers";

/** `YYYY-MM-DD` учорашнього дня за локальним годинником раннера (той самий TZ, що й у браузера). */
function yesterdayLocalDateString(): string {
  const d = new Date();
  // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- ADR-0078: день тренування — особиста сутність, її межу задає пристрій; тест дзеркалить форму, яка теж бере локальний день.
  d.setDate(d.getDate() - 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- ADR-0078: те саме — локальний день пристрою, як у `todayLocalDateString()` форми.
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Smoke - короткий запис заняття («заняття + тривалість»).
 *
 * Другий вхід у журнал поруч із детальним: людина з групового заняття не
 * памʼятає підходів, тож форма має закривати запис одразу, а не вести в
 * детальний журнал. Тест стереже саме цю різницю - лишитись на
 * `/fizruk/workouts` і побачити готовий рядок у «Останніх тренуваннях».
 */
test("@critical fizruk: заняття з каталогу пишеться одним кроком", async ({
  page,
}) => {
  await seedFTUX(page, "post-ftux");
  const errors = await collectPageErrors(page);

  await page.goto("/fizruk/workouts", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Немає активного тренування")).toBeVisible({
    timeout: 10_000,
  });
  await waitForInitialSqliteRefresh(page, "fizruk");

  await page.getByRole("button", { name: /Записати проведене/ }).click();

  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();

  await sheet.getByLabel("Заняття").selectOption("body_pump");
  // Учорашня дата, а не дефолтне «сьогодні»: форма блокує «Записати», якщо
  // початок + тривалість ще в майбутньому (`times.inFuture`). Із «сьогодні
  // 10:00» тест був зелений лише після 10:45 за годинником раннера і
  // червонів на ранкових прогонах CI.
  await sheet.getByLabel("Дата").fill(yesterdayLocalDateString());
  await sheet.getByLabel("Початок").fill("10:00");
  // 45 хв - дефолт форми; клікаємо явно, щоб тест ловив і зникнення чипів.
  await sheet.getByRole("tab", { name: "45 хв" }).click();
  await sheet.getByRole("tab", { name: "Все тіло" }).click();
  await sheet.getByRole("tab", { name: "Середньо" }).click();
  // Ваги в свіжому профілі немає, тож форма просить її тут - без неї
  // витрати рахувати нічим.
  await sheet.getByLabel("Твоя вага, кг").fill("60");

  await expect(sheet.getByText(/Приблизно 270 ккал/)).toBeVisible();

  await sheet.getByRole("button", { name: "Записати" }).click();

  // Ключове: НЕ перейшли в детальний журнал.
  await expect(page).toHaveURL(/\/fizruk\/workouts$/);
  await expect(sheet).toHaveCount(0);

  const recent = page.getByRole("region", { name: "Останні тренування" });
  await expect(recent.getByText(/45 хв/)).toBeVisible({ timeout: 10_000 });
  await expect(recent.getByText(/270 ккал/)).toBeVisible();
  // Запис завершений - «Чернетки» тут бути не має.
  await expect(recent.getByText("Чернетка")).toHaveCount(0);

  expect(errors, "Uncaught page errors on activity logging").toEqual([]);
});
