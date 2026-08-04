import { test, expect } from "@playwright/test";

import { seedFTUX } from "../utils/seedFTUX";
import {
  collectPageErrors,
  deferAnonymousMigration,
  waitForInitialSqliteRefresh,
} from "./smokeHelpers";

/**
 * Module smoke — ФІЗРУК (fizruk).
 *
 * S10-X1: cold-load mount + workouts empty state → start CTA → sheet open.
 */

test("@critical fizruk: cold-load mounts module shell", async ({ page }) => {
  await seedFTUX(page, "post-ftux");
  const errors = await collectPageErrors(page);

  await page.goto("/?module=fizruk", { waitUntil: "domcontentloaded" });

  await expect(
    page.getByTestId("module-header-title").filter({ hasText: "Фізрук" }),
  ).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    page.getByRole("navigation", { name: "Розділи хабу" }),
  ).toHaveCount(0);

  expect(errors, "Uncaught page errors on fizruk cold load").toEqual([]);
});

test("@critical fizruk: workouts empty state → Quick Start opens route", async ({
  page,
}) => {
  await seedFTUX(page, "post-ftux");
  const errors = await collectPageErrors(page);

  await page.goto("/fizruk/workouts", { waitUntil: "domcontentloaded" });

  await expect(page.getByText("Немає активного тренування")).toBeVisible({
    timeout: 10_000,
  });

  await page.getByRole("button", { name: "Quick Start" }).click();
  await expect(page).toHaveURL(/\/fizruk\/workout\/[^/]+$/);

  expect(errors, "Uncaught page errors on fizruk CTA happy path").toEqual([]);
});

test("@critical fizruk: measurement guide table stays contained on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedFTUX(page, "post-ftux", { theme: "dark" });
  await deferAnonymousMigration(page);

  await page.goto("/?module=fizruk", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByTestId("module-header-title").filter({ hasText: "Фізрук" }),
  ).toBeVisible({ timeout: 10_000 });

  await page.goto("/fizruk/measurements", {
    waitUntil: "domcontentloaded",
  });
  await waitForInitialSqliteRefresh(page, "fizruk");
  await page
    .getByRole("button", { name: /Як правильно робити заміри/ })
    .click();

  const scroller = page.getByTestId("measurement-guide-table-scroll");
  await expect(scroller).toBeVisible();
  const geometry = await scroller.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      viewportWidth: window.innerWidth,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      pageWidth: document.documentElement.scrollWidth,
    };
  });

  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.scrollWidth).toBeGreaterThan(geometry.clientWidth);
  expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.viewportWidth);
});
