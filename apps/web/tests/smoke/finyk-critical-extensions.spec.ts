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

  // Три розкидані афоданси планування зведено в один пікер «Запланувати»
  // (founder-UX audit round 2, F2): тригер + `DropdownMenu` з трьома
  // пунктами. Кнопки «Додати ліміт або ціль» більше не існує — вибір
  // «ліміт vs ціль» піднявся з табів усередині форми на рівень пікера.
  await page.getByRole("button", { name: /Запланувати/ }).click();
  // Доступне імʼя пункту містить і підпис, і опис («Ліміт» + «Стеля
  // витрат…»), тому якір, а не `exact` — так само, як у `Budgets.test.tsx`.
  await page.getByRole("menuitem", { name: /^Ліміт/ }).click();
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

  // Підписки живуть у Плануванні (2026-09-03). Вхід у форму переїхав із
  // окремої кнопки «+ Підписка» над секціями в пункт «Підписка» пікера
  // «Запланувати» внизу сторінки (F2). Пікер сигналить у
  // `PlanningSubscriptions`, той розгортає секцію і відкриває форму.
  await page.getByRole("button", { name: /Запланувати/ }).click();
  await page.getByRole("menuitem", { name: /^Підписка/ }).click();
  await expect(page.getByLabel("Назва підписки")).toBeVisible();
  await expect(page.getByLabel("Пошук транзакції за описом")).toBeVisible();
  await expect(page.getByLabel("День списання (1-31)")).toBeVisible();

  expect(errors, "Uncaught page errors on Finyk assets add flow").toEqual([]);
});
