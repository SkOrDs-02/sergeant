import { expect, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("@critical legal documents scroll inside the fixed PWA shell", async ({
  page,
}) => {
  await page.goto("/legal/privacy");

  const scroller = page.getByTestId("legal-scroll-container");
  await expect(scroller).toBeVisible();
  const metrics = await scroller.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
  await scroller.evaluate((element) => element.scrollTo({ top: 700 }));

  await expect
    .poll(() => scroller.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
});

test("@critical completing module selection survives a hard PWA-style reload", async ({
  page,
}) => {
  await page.goto("/welcome");

  const start = page.getByRole("button", { name: "Почати" });
  await expect(start).toBeVisible();
  await start.click();
  await expect(page).toHaveURL(/\/$/);

  await page.reload({ waitUntil: "domcontentloaded" });

  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByText("Обери модулі, з яких хочеш почати."),
  ).toHaveCount(0);
});
