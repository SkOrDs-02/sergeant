import { test, expect } from "@playwright/test";

import { seedFTUX } from "../utils/seedFTUX";
import { collectPageErrors } from "./smokeHelpers";

/**
 * Module smoke — РУТИНА (routine).
 *
 * S10-X1: cold-load mount + calendar → add-habit CTA → dialog open.
 */

test("@critical routine: cold-load mounts module shell", async ({ page }) => {
  await seedFTUX(page, "post-ftux");
  const errors = await collectPageErrors(page);

  await page.goto("/?module=routine", { waitUntil: "domcontentloaded" });

  await expect(page.getByText("РУТИНА", { exact: true })).toBeVisible({
    timeout: 10_000,
  });
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
