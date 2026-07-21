import { test, expect } from "@playwright/test";

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

  await expect(page.getByRole("heading", { name: "ЇЖА" })).toBeVisible({
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

  await page.getByRole("button", { name: /Додати прийом їжі/ }).click();
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
