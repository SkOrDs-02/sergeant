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

  // Після #1060 «Заняття» — не <select>, а кнопка з вкладеним аркушем
  // пошуку (у каталозі ~55 позицій, колесо iOS змушувало гортати всі).
  // Поки аркуш відкритий, на сторінці два діалоги, тож пікер адресуємо за
  // заголовком, а не за роллю.
  await sheet.getByLabel("Заняття").click();
  const picker = page.getByRole("dialog", { name: "Обери заняття" });
  await expect(picker).toBeVisible();
  await picker.getByRole("option", { name: "Body Pump" }).click();
  await expect(picker).toHaveCount(0);
  await expect(sheet.getByLabel("Заняття")).toHaveText(/Body Pump/);
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
