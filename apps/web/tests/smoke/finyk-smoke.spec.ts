import { test, expect } from "@playwright/test";

import { seedFTUX } from "../utils/seedFTUX";
import { collectPageErrors, waitForInitialSqliteRefresh } from "./smokeHelpers";

/**
 * Module smoke — ФІНІК.
 *
 * S10-X1: cold-load mount + empty-state → primary CTA → sheet open.
 * Audit `2026-05-13-testing-devx-roast.md` §P1-3.
 */

test("@critical finyk: cold-load mounts module shell", async ({ page }) => {
  await seedFTUX(page, "post-ftux");
  const errors = await collectPageErrors(page);

  await page.goto("/?module=finyk", { waitUntil: "domcontentloaded" });

  await expect(
    page.getByTestId("module-header-title").filter({ hasText: "Фінік" }),
  ).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    page.getByRole("navigation", { name: "Розділи хабу" }),
  ).toHaveCount(0);

  expect(errors, "Uncaught page errors on finyk cold load").toEqual([]);
});

test("@critical finyk: empty transactions → add-expense CTA opens sheet", async ({
  page,
}) => {
  await seedFTUX(page, "post-ftux", {
    extra: { finyk_manual_only_v1: "1" },
  });
  const errors = await collectPageErrors(page);

  await page.goto("/finyk/transactions", { waitUntil: "domcontentloaded" });
  await waitForInitialSqliteRefresh(page, "finyk");

  // Порожній перший вхід (жодної транзакції в жодному місяці) віддає
  // tier-1 герой `ModuleEmptyState module="finyk"`, тобто
  // `MODULE_EMPTY_CONFIG.finyk.title`. Копію «Транзакцій ще немає» зняли
  // поставкою 2f0c49a (2026-09-06), а сюїта відстала — той самий клас
  // «код змінили, тест ні», що й решта відсталих тестів цього PR.
  // Місяць-порожній і фільтр-порожній стани в цьому кейсі не при ділі:
  // перший вимагає історії в інших місяцях, другий — рядків під фільтром.
  await expect(page.getByText("Куди йдуть твої гроші?")).toBeVisible({
    timeout: 10_000,
  });

  // FAB — фан-меню з трьох дій (PR #818, чек-скан): головна кнопка тепер
  // «Додати», а «Додати витрату» — role="menuitem" усередині фану.
  await page.getByRole("button", { name: "Додати", exact: true }).click();
  await page.getByRole("menuitem", { name: "Додати витрату" }).click();
  await expect(
    page.getByRole("dialog", { name: "Додати витрату" }),
  ).toBeVisible();

  expect(errors, "Uncaught page errors on finyk CTA happy path").toEqual([]);
});
