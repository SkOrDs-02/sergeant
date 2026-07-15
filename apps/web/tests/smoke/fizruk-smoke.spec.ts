import { test, expect } from "@playwright/test";

import { seedFTUX } from "../utils/seedFTUX";
import { collectPageErrors } from "./smokeHelpers";

/**
 * Module smoke — ФІЗРУК (fizruk).
 *
 * S10-X1: cold-load mount + workouts empty state → start CTA → sheet open.
 */

test("@critical fizruk: cold-load mounts module shell", async ({ page }) => {
  await seedFTUX(page, "post-ftux");
  const errors = await collectPageErrors(page);

  await page.goto("/?module=fizruk", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Фізрук" })).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    page.getByRole("navigation", { name: "Розділи хабу" }),
  ).toHaveCount(0);

  expect(errors, "Uncaught page errors on fizruk cold load").toEqual([]);
});

test("@critical fizruk: workouts empty state → start CTA opens sheet", async ({
  page,
}) => {
  await seedFTUX(page, "post-ftux");
  const errors = await collectPageErrors(page);

  await page.goto("/fizruk/workouts", { waitUntil: "domcontentloaded" });

  await expect(page.getByText("Немає активного тренування")).toBeVisible({
    timeout: 10_000,
  });

  await page.getByRole("button", { name: /Почати тренування/ }).click();
  await expect(
    page.getByRole("dialog", { name: "Почати тренування" }),
  ).toBeVisible();

  expect(errors, "Uncaught page errors on fizruk CTA happy path").toEqual([]);
});
