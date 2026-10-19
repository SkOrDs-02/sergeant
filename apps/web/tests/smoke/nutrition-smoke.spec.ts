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

  // Hero Огляду (мова H, PR4): «Сьогодні · N прийомів їжі».
  await expect(page.getByText(/^Сьогодні ·/).first()).toBeVisible({
    timeout: 10_000,
  });

  // Головна дія модуля: «+ Додати» в куті, далі джерело в аркуші.
  await page
    .getByTestId("corner-action")
    .getByRole("button", { name: "Додати" })
    .click();
  await page
    .getByTestId("add-sources")
    .getByRole("button", { name: /^Пошук/ })
    .click();
  // Аркуш прийому відкривається на кроці «Джерело страви» (або одразу на
  // формі «Додати прийом їжі»). Фільтр по тексту, бо аркуш «Додати» ще
  // може бути в DOM на анімації закриття.
  const addMealDialog = page
    .getByRole("dialog")
    .filter({ hasText: /Джерело страви|Додати прийом їжі/ });
  await expect(addMealDialog).toBeVisible({ timeout: 10_000 });

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

  // PR4b: кнопка в куті → джерело «Фото» відкриває крок аналізу
  // без проміжної вкладки. Аркуш «Додати» ще може закриватися,
  // тому вибираємо діалог аналізу за його власним заголовком.
  await page
    .getByTestId("corner-action")
    .getByRole("button", { name: "Додати" })
    .click();
  await page
    .getByTestId("add-sources")
    .getByRole("button", { name: /^Фото/ })
    .click();
  const photoSheet = page.getByRole("dialog", { name: "Додати прийом їжі" });
  await expect(photoSheet).toBeVisible({ timeout: 10_000 });
  await expect(photoSheet).toContainText("AI визначить КБЖВ");

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
