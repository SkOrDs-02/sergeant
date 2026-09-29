import { expect, test, type Page } from "@playwright/test";

import { seedFTUX } from "../utils/seedFTUX";
import { goto, QA_PASSWORD, reload } from "../utils/liveJourneyHelpers";

test.use({ storageState: { cookies: [], origins: [] } });

async function signUp(page: Page, name: string, mail: string) {
  await goto(page, "/sign-in");
  await page
    .getByRole("button", { name: /Немає акаунту\? Зареєструватися/ })
    .click();
  await page.getByPlaceholder("Твоє імʼя").fill(name);
  await page.getByPlaceholder("email@example.com").fill(mail);
  await page.getByPlaceholder(/Мінімум 10 символів/).fill(QA_PASSWORD);
  await page
    .getByRole("button", { name: "Зареєструватися", exact: true })
    .click();
  await expect(
    page
      .getByRole("tab", { name: "Головна" })
      .filter({ visible: true })
      .first(),
  ).toBeVisible({
    timeout: 120_000,
  });
}

test("KV click-through: прихований чекліст переживає reload, інший акаунт його бачить", async ({
  page,
}) => {
  await seedFTUX(page, "post-ftux", { extra: { finyk_manual_only_v1: "1" } });
  await page.addLocatorHandler(
    page.getByRole("button", { name: "Зрозуміло", exact: true }),
    async (b) => {
      await b.click({ timeout: 5000 }).catch(() => {});
    },
  );
  const run = Date.now().toString(36).slice(-5);
  const hide = page.getByRole("button", { name: "Сховати чекліст" });

  await signUp(page, "KvA", `kva_${run}@example.com`);
  await goto(page, "/");
  await expect(hide).toBeVisible({ timeout: 30_000 });
  await hide.click();
  await expect(hide).toBeHidden();
  await page.waitForTimeout(2000);

  const afterReload: boolean[] = [];
  for (let i = 0; i < 3; i++) {
    await reload(page);
    await goto(page, "/");
    await page.waitForTimeout(4000);
    afterReload.push(await hide.isVisible());
  }
  console.log(
    `[KV] checklist visible after reloads: ${JSON.stringify(afterReload)}`,
  );

  await goto(page, "/profile");
  await page.getByRole("button", { name: "Вийти" }).first().click();
  await page
    .getByRole("alertdialog")
    .or(page.getByRole("dialog", { name: "Вийти з акаунта?" }))
    .getByRole("button", { name: "Вийти" })
    .click();
  await expect(page).toHaveURL(/sign-in/, { timeout: 20_000 });

  await signUp(page, "KvB", `kvb_${run}@example.com`);
  await goto(page, "/");
  const visibleForB = await expect(hide)
    .toBeVisible({ timeout: 30_000 })
    .then(
      () => true,
      () => false,
    );
  console.log(`[KV] checklist visible for user B: ${visibleForB}`);

  expect(afterReload).toEqual([false, false, false]);
  expect(visibleForB).toBe(true);
});
