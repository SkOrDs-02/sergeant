import { expect, test } from "@playwright/test";

import { seedFTUX } from "../utils/seedFTUX";

// Дефект №1 (адверсарне ревʼю 2026-08-08): раніше тут стояв
// `#settings-privacy`, а «Конфіденційність» ЗБІГАЄТЬСЯ з першою секцією
// своєї вкладки («Додатково») — Варіант A (перша секція активної вкладки
// відкрита за замовчуванням) сама по собі давала той самий результат, тож
// гейт лишався б зеленим навіть без `anchorId`-логіки в SettingsGroup.
// `#settings-plan` — остання секція вкладки «Загальні» («Головна» — перша):
// розгорнути її може ЛИШЕ хеш. Forced-first-of-tab скасовано рішенням
// власника 2026-09-11 — «Головна» тепер не відкривається автоматично
// взагалі, тож нижче це заразом і пряме регресійне покриття.
test("@critical settings: plan hash deep-link opens the subscription section, not the tab's first section", async ({
  page,
}) => {
  await seedFTUX(page, "post-ftux");

  await page.goto("/?tab=settings#settings-plan", {
    waitUntil: "domcontentloaded",
  });

  await expect(
    page.getByRole("tablist", { name: "Групи налаштувань" }),
  ).toBeVisible({ timeout: 10_000 });
  const planSection = page.getByRole("button", {
    name: /Підписка та план/,
  });
  await expect(planSection).toBeVisible();
  await expect(planSection).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("plan-badge")).toBeVisible();

  // Дефект №2: «Головна» (перша секція «Загальних») не повинен
  // розгортатись одночасно з ціллю хеша — до фіксу тут стояло "true".
  const homeSection = page.getByRole("button", { name: /Головна/ });
  await expect(homeSection).toHaveAttribute("aria-expanded", "false");
});
