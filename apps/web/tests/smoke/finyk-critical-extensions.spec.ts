import { expect, test } from "@playwright/test";

import { seedFTUX } from "../utils/seedFTUX";
import { collectPageErrors, waitForInitialSqliteRefresh } from "./smokeHelpers";

test("@critical finyk: planning route opens the limit/goal form", async ({
  page,
}) => {
  await seedFTUX(page, "post-ftux", {
    extra: { finyk_manual_only_v1: "1" },
  });
  const errors = await collectPageErrors(page);

  await page.goto("/finyk/budgets", { waitUntil: "domcontentloaded" });
  await waitForInitialSqliteRefresh(page, "finyk");

  const nav = page.getByRole("tablist", { name: "Розділи Фініка" });
  await expect(nav.getByRole("tab", { name: "Планування" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await page.getByRole("button", { name: "Додати ліміт або ціль" }).click();
  await expect(
    page.getByRole("form", { name: "Новий ліміт бюджету" }),
  ).toBeVisible();
  await expect(page.getByLabel("Період ліміту")).toBeVisible();
  await expect(page.getByLabel("Ліміт")).toBeVisible();

  expect(errors, "Uncaught page errors on Finyk planning add flow").toEqual([]);
});

test("@critical finyk: assets route opens subscription form", async ({
  page,
}) => {
  await seedFTUX(page, "post-ftux", {
    extra: { finyk_manual_only_v1: "1" },
  });
  const errors = await collectPageErrors(page);

  await page.goto("/finyk/assets", { waitUntil: "domcontentloaded" });
  await waitForInitialSqliteRefresh(page, "finyk");

  const nav = page.getByRole("tablist", { name: "Розділи Фініка" });
  await expect(nav.getByRole("tab", { name: "Активи" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await page.getByRole("button", { name: "+ Додати підписку" }).click();
  await expect(page.getByLabel("Назва підписки")).toBeVisible();
  await expect(page.getByLabel("Пошук транзакції за описом")).toBeVisible();
  await expect(page.getByLabel("День списання (1-31)")).toBeVisible();

  expect(errors, "Uncaught page errors on Finyk assets add flow").toEqual([]);
});
