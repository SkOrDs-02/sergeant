import { expect, test } from "@playwright/test";

import { seedFTUX } from "../utils/seedFTUX";

test("@critical settings: privacy hash deep-link opens the advanced section", async ({
  page,
}) => {
  await seedFTUX(page, "post-ftux");

  await page.goto("/?tab=settings#settings-privacy", {
    waitUntil: "domcontentloaded",
  });

  await expect(page.getByPlaceholder("Пошук налаштувань…")).toBeVisible({
    timeout: 10_000,
  });
  const privacySection = page.getByRole("button", {
    name: /Конфіденційність/,
  });
  await expect(privacySection).toBeVisible();
  await expect(privacySection).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Згода та дані")).toBeVisible();
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
