import { expect, test } from "@playwright/test";

import { seedFTUX } from "../utils/seedFTUX";

async function documentScrollTop(page: import("@playwright/test").Page) {
  return page.evaluate(
    () =>
      window.scrollY ||
      document.scrollingElement?.scrollTop ||
      document.documentElement.scrollTop,
  );
}

test("@critical welcome auth CTA navigates without moving the document", async ({
  page,
}) => {
  await seedFTUX(page, "cold");
  await page.goto("/welcome");

  const authCta = page.getByRole("button", {
    name: "У мене вже є акаунт",
  });
  await expect(authCta).toBeVisible();
  await expect.poll(() => documentScrollTop(page)).toBe(0);

  await authCta.click();

  await expect(page).toHaveURL(/\/sign-in$/);
  await expect.poll(() => documentScrollTop(page)).toBe(0);
});

test("settings privacy hash scroll keeps the Hub shell pinned", async ({
  page,
}) => {
  await seedFTUX(page, "post-ftux");
  await page.goto("/?tab=settings#settings-privacy");

  await expect(page.getByPlaceholder("Пошук налаштувань…")).toBeVisible();
  await expect.poll(() => documentScrollTop(page)).toBe(0);

  const nav = page.getByRole("navigation", { name: "Розділи хабу" });
  await expect(nav).toBeVisible();
  const geometry = await nav.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const rootRect = document.querySelector("#root")?.getBoundingClientRect();
    const apron = getComputedStyle(element, "::after");
    return {
      height: rect.height,
      bottomGap: (rootRect?.bottom ?? window.innerHeight) - rect.bottom,
      apronContent: apron.content,
    };
  });

  expect(geometry.height).toBeLessThan(140);
  expect(Math.abs(geometry.bottomGap)).toBeLessThanOrEqual(1);
  expect(["none", "normal"]).toContain(geometry.apronContent);
});
