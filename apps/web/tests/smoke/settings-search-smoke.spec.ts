import { expect, test } from "@playwright/test";

import { seedFTUX } from "../utils/seedFTUX";

// Дефект №1 (адверсарне ревʼю 2026-08-08): раніше тут стояв
// `#settings-privacy`, а «Конфіденційність» ЗБІГАЄТЬСЯ з першою секцією
// своєї вкладки («Додатково») — Варіант A (перша секція активної вкладки
// відкрита за замовчуванням) сама по собі давала той самий результат, тож
// гейт лишався б зеленим навіть без `anchorId`-логіки в SettingsGroup.
// `#settings-plan` — ДРУГА секція вкладки «Загальні» (Дашборд — перша):
// розгорнути її може ЛИШЕ хеш.
test("@critical settings: plan hash deep-link opens the subscription section, not the tab's first section", async ({
  page,
}) => {
  await seedFTUX(page, "post-ftux");

  await page.goto("/?tab=settings#settings-plan", {
    waitUntil: "domcontentloaded",
  });

  await expect(page.getByPlaceholder("Пошук налаштувань…")).toBeVisible({
    timeout: 10_000,
  });
  const planSection = page.getByRole("button", {
    name: /Підписка та план/,
  });
  await expect(planSection).toBeVisible();
  await expect(planSection).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("plan-badge")).toBeVisible();

  // Дефект №2: «Дашборд» (перша секція «Загальних») не повинен
  // розгортатись одночасно з ціллю хеша — до фіксу тут стояло "true".
  const dashboardSection = page.getByRole("button", { name: /Дашборд/ });
  await expect(dashboardSection).toHaveAttribute("aria-expanded", "false");
});

test("@critical settings: search filters sections and recovers from no results", async ({
  page,
}) => {
  await seedFTUX(page, "post-ftux");

  await page.goto("/?tab=settings", { waitUntil: "domcontentloaded" });

  const search = page.getByPlaceholder("Пошук налаштувань…");
  await expect(search).toBeVisible({ timeout: 10_000 });

  await search.fill("nps");
  await expect(page.getByRole("button", { name: /Фідбек/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Дашборд/ })).toHaveCount(0);

  await search.fill("zzzz-nope");
  await expect(
    page.getByText("Нічого не знайдено за запитом «zzzz-nope»"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Очистити пошук" }).click();
  await expect(search).toHaveValue("");
  await expect(
    page.getByRole("tablist", { name: "Групи налаштувань" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Дашборд/ })).toBeVisible();
});
