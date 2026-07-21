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

  await expect(
    page.getByRole("heading", { name: "Можливості асистента" }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("catalogue-toggle-all")).toBeVisible();

  const search = page.getByRole("searchbox", { name: "Пошук можливостей" });
  await search.fill("wave3-no-results");
  await expect(
    page.getByText("Нічого не знайдено за «wave3-no-results»"),
  ).toBeVisible();
  await expect(page.getByTestId("catalogue-toggle-all")).toHaveCount(0);

  await search.fill("");
  await expect(page.getByTestId("catalogue-toggle-all")).toBeVisible();

  expect(errors, "Uncaught page errors on assistant catalogue search").toEqual(
    [],
  );
});
