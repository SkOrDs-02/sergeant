import { test, expect } from "@playwright/test";

import { seedFTUX } from "../utils/seedFTUX";
import { collectPageErrors, waitForInitialSqliteRefresh } from "./smokeHelpers";

test("@critical fizruk: start → set → refresh → resume → finish", async ({
  page,
}) => {
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
  await page.getByRole("button", { name: "Пропустити" }).click();
  await expect(
    page.getByRole("dialog", { name: "Щось болить?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Пропустити" }).click();
  await page.getByRole("button", { name: "Готово" }).click();
  await expect(page).toHaveURL(/\/fizruk\/workouts$/);

  const eventNames = await page.evaluate(() => {
    const target = window as Window & {
      __hubAnalytics?: Array<{ eventName?: string }>;
    };
    return (target.__hubAnalytics ?? []).map((event) => event.eventName);
  });
  expect(eventNames).toContain("fizruk_workout_started");
  expect(eventNames).toContain("fizruk_rest_timer_done");
  expect(eventNames).toContain("fizruk_workout_finished");
  expect(errors, "Uncaught page errors in active-workout flow").toEqual([]);
});
