import { test, expect } from "@playwright/test";
import path from "node:path";

import { seedFTUX } from "../utils/seedFTUX";
import { collectPageErrors, waitForInitialSqliteRefresh } from "./smokeHelpers";

/**
 * Module smoke — ХАРЧУВАННЯ (nutrition).
 *
 * S10-X1: cold-load mount + today dashboard → add-meal CTA → sheet open.
 */

test("@critical nutrition: cold-load mounts module shell", async ({ page }) => {
  await seedFTUX(page, "post-ftux");
  const errors = await collectPageErrors(page);

  await page.goto("/?module=nutrition", { waitUntil: "domcontentloaded" });

  await expect(
    page.getByTestId("module-header-title").filter({ hasText: "ЇЖА" }),
  ).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    page.getByRole("navigation", { name: "Розділи хабу" }),
  ).toHaveCount(0);

  expect(errors, "Uncaught page errors on nutrition cold load").toEqual([]);
});

test("@critical nutrition: today dashboard → add-meal CTA opens sheet", async ({
  page,
}) => {
  await seedFTUX(page, "post-ftux");
  const errors = await collectPageErrors(page);

  await page.goto("/nutrition", { waitUntil: "domcontentloaded" });
  await waitForInitialSqliteRefresh(page, "nutrition");

  await expect(page.getByText("Сьогодні", { exact: true }).first()).toBeVisible(
    {
      timeout: 10_000,
    },
  );

  // `.first()`, а не `exact` — після уніфікації FAB (#443) на сторінці ДВІ
  // кнопки з ІДЕНТИЧНИМ accessible name «Додати прийом їжі»: хедерна `+ Додати`
  // і круглий FAB. Точний збіг тут не розрізняє їх, бо різниться лише розмітка.
  // Обидві відкривають ту саму шторку, тож беремо першу в DOM-порядку.
  await page
    .getByRole("button", { name: /Додати прийом їжі/ })
    .first()
    .click();
  // With no saved templates the sheet auto-skips "source" → "fill"
  // (title "Додати прийом їжі" + backtrack link). With templates it
  // stays on "source" (title "Звідки страва?"). Either means the sheet opened.
  const addMealDialog = page.getByRole("dialog");
  await expect(addMealDialog).toBeVisible({ timeout: 10_000 });
  await expect(addMealDialog).toContainText(
    /Звідки страва\?|Додати прийом їжі/,
  );

  expect(errors, "Uncaught page errors on nutrition CTA happy path").toEqual(
    [],
  );
});

test("@critical nutrition: photo preview stays inside a 390px viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedFTUX(page, "post-ftux");
  await page.goto("/nutrition", { waitUntil: "domcontentloaded" });
  await waitForInitialSqliteRefresh(page, "nutrition");

  // Аналіз фото живе ВКЛАДКОЮ кроку джерела (не окремим кроком), і оскільки
  // CTA-картку зі стартової прибрано (2026-08-17, дубль входу), шлях у
  // модулі один: FAB → «Звідки страва?» → вкладка «Фото».
  //
  // Заголовок аркуша тут лишається «Звідки страва?» — саме тому, що крок не
  // покидається; перевіряти його як ознаку фото більше не можна. Ознака —
  // сам підпис картки аналізу.
  await page
    .getByRole("button", { name: /Додати прийом їжі/ })
    .first()
    .click();
  const photoSheet = page.getByRole("dialog");
  await expect(photoSheet).toBeVisible({ timeout: 10_000 });
  await photoSheet.getByRole("tab", { name: /Фото/ }).click();
  await expect(photoSheet).toContainText("ШІ визначить КБЖВ");

  await photoSheet
    .locator('input[type="file"]')
    .setInputFiles(
      path.resolve(process.cwd(), "tests/fixtures/nutrition-photo.svg"),
    );
  await expect(photoSheet.getByAltText("Обране фото")).toBeVisible();

  for (const region of [photoSheet]) {
    const box = await region.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  }
});
