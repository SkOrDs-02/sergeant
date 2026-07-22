import { expect, test } from "@playwright/test";

import { seedFTUX } from "../utils/seedFTUX";
import { collectPageErrors } from "./smokeHelpers";

test("@critical fizruk: bottom nav switches path-backed module sections", async ({
  page,
}) => {
  await seedFTUX(page, "post-ftux");
  const errors = await collectPageErrors(page);

  await page.goto("/fizruk", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Фізрук" })).toBeVisible({
    timeout: 10_000,
  });
  const nav = page.getByRole("navigation", { name: "Розділи Фізрука" });
  await expect(nav).toBeVisible();

  const workouts = nav.getByRole("button", { name: "Тренування" });
  await workouts.click();
  await expect(page).toHaveURL(/\/fizruk\/workouts$/);
  await expect(workouts).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Немає активного тренування")).toBeVisible();

  const progress = nav.getByRole("button", { name: "Прогрес і заміри" });
  await progress.click();
  await expect(page).toHaveURL(/\/fizruk\/progress$/);
  await expect(progress).toHaveAttribute("aria-current", "page");

  const body = nav.getByRole("button", { name: "Моє тіло" });
  await body.click();
  await expect(page).toHaveURL(/\/fizruk\/body$/);
  await expect(body).toHaveAttribute("aria-current", "page");

  expect(
    errors,
    "Uncaught page errors during Fizruk section navigation",
  ).toEqual([]);
});

test("@critical routine: stats tab deep-link round-trips to calendar", async ({
  page,
}) => {
  await seedFTUX(page, "post-ftux");
  const errors = await collectPageErrors(page);

  await page.goto("/routine", { waitUntil: "domcontentloaded" });

  await expect(
    page.getByRole("heading", { name: "Рутина" }).first(),
  ).toBeVisible({ timeout: 10_000 });
  const nav = page.getByRole("navigation", { name: "Розділи Рутини" });
  await expect(nav).toBeVisible();

  const stats = nav.getByRole("tab", { name: "Статистика" });
  await stats.click();
  await expect(page).toHaveURL(/\/routine\/stats$/);
  await expect(stats).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Серія сьогодні")).toBeVisible();

  const overview = nav.getByRole("tab", { name: "Огляд" });
  await overview.click();
  await expect(page).toHaveURL(/\/routine$/);
  await expect(overview).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("button", { name: "Додати звичку" }),
  ).toBeVisible();

  expect(
    errors,
    "Uncaught page errors during Routine section navigation",
  ).toEqual([]);
});
