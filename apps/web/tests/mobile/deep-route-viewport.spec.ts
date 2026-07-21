import { expect, test, type Page } from "@playwright/test";

import { seedFTUX } from "../utils/seedFTUX";

const ROUTES: ReadonlyArray<{
  id: string;
  path: string;
  visibleText: string | RegExp;
}> = [
  {
    id: "FINYK_ASSETS",
    path: "/finyk/assets",
    visibleText: "+ Додати підписку",
  },
  {
    id: "FIZRUK_WORKOUTS",
    path: "/fizruk/workouts",
    visibleText: "Немає активного тренування",
  },
  {
    id: "ROUTINE_STATS",
    path: "/routine/stats",
    visibleText: "Серія сьогодні",
  },
];

async function mockApi(page: Page) {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
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
      status: method === "POST" ? 204 : 200,
      contentType: "application/json",
      body: method === "POST" ? "" : JSON.stringify({ ok: true }),
    });
  });
}

async function auditMobileShell(page: Page, id: string) {
  await page
    .locator("main, [role='main'], [data-a11y-root], #root > *")
    .first()
    .waitFor({ state: "visible", timeout: 15_000 });

  await expect
    .poll(
      () => page.evaluate(() => window.matchMedia("(pointer: coarse)").matches),
      { message: `pointer:coarse must be active — ${id}` },
    )
    .toBe(true);

  const overflowPx = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflowPx, `horizontal overflow (px) — ${id}`).toBeLessThanOrEqual(1);
}

test.describe("mobile deep-route viewport smoke", () => {
  for (const routeCase of ROUTES) {
    test(`${routeCase.id} ${routeCase.path}`, async ({ page }) => {
      await mockApi(page);
      await seedFTUX(page, "post-ftux", {
        extra: { finyk_manual_only_v1: "1" },
      });

      await page.goto(routeCase.path, { waitUntil: "domcontentloaded" });
      await auditMobileShell(page, routeCase.id);
      await expect(page.getByText(routeCase.visibleText).first()).toBeVisible();
    });
  }
});
