import { test, expect } from "@playwright/test";

import { seedFTUX } from "../utils/seedFTUX";
import { collectPageErrors, waitForInitialSqliteRefresh } from "./smokeHelpers";

/**
 * Вчорашня доба ПРИСТРОЮ у форматі `YYYY-MM-DD`.
 *
 * Саме пристрою, а не Києва: поле дати форма віддає в
 * `Date.parse(`${dateKey}T${startTime}`)`, а той читає рядок без зони як
 * локальний час. Київський ключ розійшовся б із цим парсингом на раннері
 * в UTC у вечірні години.
 */
function yesterdayLocalDateKey(): string {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  /* eslint-disable sergeant-design/prefer-kyiv-time -- ADR-0078: доба
     тренування належить ПРИСТРОЮ, і тут це ще й вимога симетрії з парсером.
     `buildActivityWorkoutTimes` збирає рядок `${dateKey}T${startTime}` і
     віддає його в `Date.parse`, який без зони читає локальний час хоста.
     Київський ключ дав би тесту дату, якої парсер не побачить: на раннері
     в UTC після 21:00 Київ уже наступної доби. */
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
  /* eslint-enable sergeant-design/prefer-kyiv-time */
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

  await page.getByRole("button", { name: /Внести проведене/ }).click();

  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();

  await sheet.getByLabel("Заняття").selectOption("body_pump");
  // Дата вчорашня, і це не косметика. «Записати» гейтить `times.inFuture`:
  // кнопка лишається disabled, поки кінець заняття не в минулому. З
  // фіксованими «сьогодні + 10:00 + 45 хв» кінець припадав на 10:45 за
  // годинником раннера, тож тест був зелений лише на прогонах після цієї
  // години, а щоранку до неї падав детерміновано (CI працює в UTC).
  // Вчорашня доба знімає залежність від години прогону і не чіпає ні
  // тривалість, ні витрату калорій, які тест і стереже.
  await sheet.getByLabel("Дата").fill(yesterdayLocalDateKey());
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
