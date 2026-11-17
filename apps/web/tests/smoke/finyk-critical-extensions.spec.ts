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

  const nav = page.getByRole("navigation", { name: "Розділи Фініка" });
  await expect(nav.getByRole("button", { name: "Планування" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  // Планування додає кутова кнопка: аркуш «Підписка / Ліміт / Ціль»
  // (redesign v3.2, позиція 03), без «+ Запланувати» внизу сторінки.
  // Доступне імʼя рядка містить і підпис, і опис, тому якір.
  await page
    .getByTestId("corner-action")
    .getByRole("button", { name: "Додати" })
    .click();
  await page
    .getByTestId("add-sources")
    .getByRole("button", { name: /^Ліміт/ })
    .click();
  await expect(
    page.getByRole("form", { name: "Новий ліміт бюджету" }),
  ).toBeVisible();
  await expect(page.getByLabel("Період", { exact: true })).toBeVisible();
  // `exact: true` — інакше підрядкове зіставлення accessible name може
  // зачепити інший елемент форми з тим самим словом.
  await expect(page.getByLabel("Ліміт", { exact: true })).toBeVisible();

  expect(errors, "Uncaught page errors on Finyk planning add flow").toEqual([]);
});

test("@critical finyk: assets route opens subscription form", async ({
  page,
}) => {
  await seedFTUX(page, "post-ftux", {
    extra: { finyk_manual_only_v1: "1" },
  });
  const errors = await collectPageErrors(page);

  await page.goto("/finyk/budgets", { waitUntil: "domcontentloaded" });
  await waitForInitialSqliteRefresh(page, "finyk");

  const nav = page.getByRole("navigation", { name: "Розділи Фініка" });
  await expect(nav.getByRole("button", { name: "Планування" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  // Підписки живуть у Плануванні (2026-09-03). Вхід - рядок «Підписка»
  // аркуша кутової кнопки (redesign v3.2, позиція 03); він сигналить у
  // `PlanningSubscriptions`, той розгортає секцію і відкриває форму.
  await page
    .getByTestId("corner-action")
    .getByRole("button", { name: "Додати" })
    .click();
  await page
    .getByTestId("add-sources")
    .getByRole("button", { name: /^Підписка/ })
    .click();
  await expect(page.getByLabel("Назва підписки")).toBeVisible();
  await expect(page.getByLabel("Пошук операції за описом")).toBeVisible();
  await expect(page.getByLabel("День списання (1-31)")).toBeVisible();

  expect(errors, "Uncaught page errors on Finyk assets add flow").toEqual([]);
});
