import { expect, test, type Page } from "@playwright/test";

import { seedFTUX } from "../utils/seedFTUX";
import { collectPageErrors } from "./smokeHelpers";

async function openGlobalSearch(page: Page) {
  await page.getByRole("button", { name: "Пошук" }).click();
  const dialog = page.getByRole("dialog", { name: "Глобальний пошук" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("@critical hub-search: quick-add expense action opens Finyk sheet", async ({
  page,
}) => {
  await seedFTUX(page, "post-ftux", {
    extra: { finyk_manual_only_v1: "1" },
  });
  const errors = await collectPageErrors(page);

  await page.goto("/", { waitUntil: "domcontentloaded" });
  const dialog = await openGlobalSearch(page);

  await dialog.getByRole("option", { name: /Додати витрату/ }).click();

  await expect(page.getByRole("heading", { name: "Фінік" })).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    page.getByRole("dialog", { name: "Додати витрату" }),
  ).toBeVisible();

  expect(errors, "Uncaught page errors opening Finyk from hub search").toEqual(
    [],
  );
});

test("@critical hub-search: Fizruk catalogue hit opens module shell", async ({
  page,
}) => {
  await seedFTUX(page, "post-ftux");
  const errors = await collectPageErrors(page);

  await page.goto("/", { waitUntil: "domcontentloaded" });
  const dialog = await openGlobalSearch(page);
  const search = dialog.getByPlaceholder("Пошук по всіх модулях…");

  await search.fill("жим");
  await expect(dialog.getByText("Фізрук")).toBeVisible();
  await dialog.getByRole("option", { name: /Жим/ }).first().click();

  await expect(page.getByRole("heading", { name: "Фізрук" })).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    page.getByRole("navigation", { name: "Розділи хабу" }),
  ).toHaveCount(0);

  expect(errors, "Uncaught page errors opening Fizruk from hub search").toEqual(
    [],
  );
});
