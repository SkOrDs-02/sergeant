import { expect, test, type Page } from "@playwright/test";

import { seedFTUX } from "../utils/seedFTUX";
import { collectPageErrors } from "./smokeHelpers";

test.use({ storageState: { cookies: [], origins: [] } });

async function mockApi(page: Page) {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes("/me")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          user: {
            id: "qa-user",
            name: "QA User",
            email: "qa@example.com",
            emailVerified: true,
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });
}

test("@critical assistant catalogue: search filters and recovers", async ({
  page,
}) => {
  await mockApi(page);
  await seedFTUX(page, "post-ftux");
  const errors = await collectPageErrors(page);

  await page.goto("/assistant", { waitUntil: "domcontentloaded" });

  // Персона зведена в одну — заголовок їде з `messages.sergeant
  // .capabilitiesSectionTitle`. Слово «асистент» із користувацьких рядків
  // прибрано, тож стара назва тут більше не зʼявиться.
  await expect(
    page.getByRole("heading", { name: "Що вміє Сержант" }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("catalogue-toggle-all")).toBeVisible();

  const search = page.getByRole("searchbox", { name: "Пошук можливостей" });
  // Порожній пошук - `EmptyState` (PR-C6, хвиля 8 аудиту продукту): статус
  // із назвою запиту і дією «Скинути пошук», що усуває причину порожнечі.
  await search.fill("wave3-no-results");
  const empty = page
    .getByRole("status")
    .filter({ hasText: "Нічого не знайшов" });
  await expect(empty).toBeVisible();
  await expect(
    empty.getByText("За запитом «wave3-no-results» нічого немає."),
  ).toBeVisible();
  await expect(page.getByTestId("catalogue-toggle-all")).toHaveCount(0);

  await empty.getByRole("button", { name: "Скинути пошук" }).click();
  await expect(search).toHaveValue("");
  await expect(page.getByTestId("catalogue-toggle-all")).toBeVisible();

  // Ручне очищення поля теж повертає каталог.
  await search.fill("wave3-no-results");
  await expect(empty).toBeVisible();
  await search.fill("");
  await expect(page.getByTestId("catalogue-toggle-all")).toBeVisible();

  expect(errors, "Uncaught page errors on assistant catalogue search").toEqual(
    [],
  );
});
