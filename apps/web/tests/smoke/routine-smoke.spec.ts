import { test, expect } from "@playwright/test";

import { seedFTUX } from "../utils/seedFTUX";
import { collectPageErrors, deferAnonymousMigration } from "./smokeHelpers";

/**
 * Module smoke — РУТИНА (routine).
 *
 * S10-X1: cold-load mount + calendar → add-habit CTA → dialog open.
 */

test("@critical routine: cold-load mounts module shell", async ({ page }) => {
  await seedFTUX(page, "post-ftux");
  const errors = await collectPageErrors(page);

  await page.goto("/?module=routine", { waitUntil: "domcontentloaded" });

  await expect(
    page
      .getByTestId("module-header-title")
      .filter({ hasText: "Рутина" })
      .first(),
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByRole("navigation", { name: "Розділи хабу" }),
  ).toHaveCount(0);

  expect(errors, "Uncaught page errors on routine cold load").toEqual([]);
});

test("@critical routine: calendar → add-habit CTA opens create dialog", async ({
  page,
}) => {
  await seedFTUX(page, "post-ftux");
  const errors = await collectPageErrors(page);

  await page.goto("/routine", { waitUntil: "domcontentloaded" });

  await page
    .getByRole("button", { name: "Додати звичку", exact: true })
    .click();
  await expect(page.getByRole("dialog", { name: "Нова звичка" })).toBeVisible({
    timeout: 10_000,
  });

  expect(errors, "Uncaught page errors on routine CTA happy path").toEqual([]);
});

test("@critical routine: mobile habit dates stay contained and stacked", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await seedFTUX(page, "post-ftux", { theme: "dark" });
  await deferAnonymousMigration(page);
  const errors = await collectPageErrors(page);

  await page.goto("/routine", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Додати звичку", exact: true })
    .click();

  const dialog = page.getByRole("dialog", { name: "Нова звичка" });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  const advancedToggle = dialog.getByRole("button", { name: /Більше опцій/ });
  const dateFields = dialog.locator('input[type="date"]');

  await expect
    .poll(
      async () => {
        if ((await advancedToggle.getAttribute("aria-expanded")) !== "true") {
          await advancedToggle.click({ force: true });
        }
        return dateFields.evaluateAll((inputs) => {
          const dialogElement = inputs[0]?.closest('[role="dialog"]');
          if (!dialogElement || inputs.length !== 2) {
            return {
              count: inputs.length,
              contained: false,
              stacked: false,
              equal: false,
            };
          }
          const dialogRect = dialogElement.getBoundingClientRect();
          const [startRect, endRect] = inputs.map((input) =>
            input.getBoundingClientRect(),
          );
          if (!startRect || !endRect) {
            return {
              count: inputs.length,
              contained: false,
              stacked: false,
              equal: false,
            };
          }
          return {
            count: inputs.length,
            contained: [startRect, endRect].every(
              (field) =>
                field.left >= dialogRect.left &&
                field.right <= dialogRect.right,
            ),
            stacked: endRect.top >= startRect.bottom,
            equal: Math.abs(startRect.width - endRect.width) <= 1,
          };
        });
      },
      { timeout: 15_000 },
    )
    .toEqual({ count: 2, contained: true, stacked: true, equal: true });
  expect(errors, "Uncaught page errors in mobile habit form").toEqual([]);
});

test("@critical routine: today → tomorrow → week keeps one selected day", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedFTUX(page, "post-ftux", { theme: "dark" });
  await deferAnonymousMigration(page);

  await page.goto("/routine", { waitUntil: "domcontentloaded" });

  // Спершу заводимо звичку, і це не декорація тесту. З 2026-09-17 пульт
  // стрічки (діапазон + тижневий пікер + пошук + чипи) не рендериться в
  // стані «нема жодної звички І стрічка порожня І фільтр не активний» —
  // тобто рівно тоді, коли на екрані стоїть «Почни з однієї звички»
  // (аудит шуму, N-4). Перемикання діапазонів у тому стані не має предмета:
  // гортати нічого. Регресію, заради якої цей тест існує (тап по даті давав
  // режим `day` замість `today`/`tomorrow`, репорт власника 2026-08-17), він
  // перевіряє так само — просто на непорожній стрічці.
  await page
    .getByRole("button", { name: "Додати звичку", exact: true })
    .click();
  const createDialog = page.getByRole("dialog", { name: "Нова звичка" });
  await expect(createDialog).toBeVisible();
  await createDialog.getByLabel("Назва звички").fill("Смоук діапазон");
  await createDialog
    .getByRole("button", { name: "Додати звичку", exact: true })
    .click();
  await expect(createDialog).toBeHidden();

  const range = page.getByRole("tablist", { name: "Діапазон стрічки" });
  const week = page.getByRole("group", { name: "Тиждень" });
  await expect(range).toBeVisible();

  for (const label of ["Сьогодні", "Завтра", "Тиждень"]) {
    await test.step(label, async () => {
      await range.getByRole("tab", { name: label, exact: true }).click();
      await expect(
        week.locator('button[aria-pressed="true"]'),
        `one selected day after ${label}`,
      ).toHaveCount(1);
    });
  }
});
