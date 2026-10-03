import { expect, test, type Page } from "@playwright/test";

import { seedFTUX } from "../utils/seedFTUX";
import { waitForServiceWorkerActivated } from "../utils/serviceWorker";
import {
  addExpense,
  addHabit,
  goto,
  reload,
  visibleText,
} from "../utils/liveJourneyHelpers";

// Анонімний смок на проді: жодного акаунта, записи лишаються в браузері.
// Запуск: PW_BASE_URL=https://app.sergeant.com.ua … -g prod-anon
test.use({ storageState: { cookies: [], origins: [] } });

async function hasExpense(page: Page, title: string): Promise<string> {
  await goto(page, "/finyk/transactions");
  return expect(async () => {
    const collapsed = page
      .locator('button[aria-expanded="false"]')
      .filter({ hasText: /^Сьогодні/ });
    if ((await collapsed.count()) > 0)
      await collapsed.first().dispatchEvent("click");
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible({
      timeout: 1500,
    });
  })
    .toPass({ timeout: 15_000 })
    .then(
      () => "YES",
      () => "NO",
    );
}

for (
  let attempt = 1;
  attempt <= Number(process.env["PROD_D1_ATTEMPTS"] ?? 3);
  attempt++
) {
  test(`prod-anon D1 first-visit immediate reload #${attempt}`, async ({
    page,
  }) => {
    await seedFTUX(page, "post-ftux", { extra: { finyk_manual_only_v1: "1" } });
    const f = `PROD D1 ${attempt} ${Date.now().toString(36).slice(-4)}`;
    await addExpense(page, f, "1");
    await reload(page);
    const after = await hasExpense(page, f);
    await page.waitForTimeout(5000);
    await reload(page);
    console.log(
      `[prod D1 #${attempt}] expense after immediate reload: ${after} → later ${await hasExpense(page, f)}`,
    );
  });
}

test("prod-anon persistence and offline reload (settled writes)", async ({
  page,
  context,
}) => {
  await seedFTUX(page, "post-ftux", { extra: { finyk_manual_only_v1: "1" } });
  await goto(page, "/finyk/transactions");
  const sw = await waitForServiceWorkerActivated(page);
  const f = `PROD P ${Date.now().toString(36).slice(-4)}`;
  const h = `PROD H ${Date.now().toString(36).slice(-4)}`;
  await addExpense(page, f, "2");
  await page.waitForTimeout(2000);
  await addHabit(page, h);
  await page.waitForTimeout(2000);
  await reload(page);
  const fOk = await hasExpense(page, f);
  await goto(page, "/routine/habits");
  const hOk = await expect(visibleText(page, h))
    .toBeVisible({ timeout: 15_000 })
    .then(
      () => "YES",
      () => "NO",
    );
  console.log(`[prod persistence] sw=${sw} expense=${fOk} habit=${hOk}`);

  await context.setOffline(true);
  let shell = "NO";
  try {
    await reload(page);
    await expect
      .poll(
        () =>
          page.evaluate(
            () => document.getElementById("root")?.childElementCount ?? 0,
          ),
        { timeout: 20_000 },
      )
      .toBeGreaterThan(0);
    shell = "YES";
  } catch {
    /* записуємо як NO */
  }
  const fOff = shell === "YES" ? await hasExpense(page, f) : "n/a";
  const f2 = `PROD OFF ${Date.now().toString(36).slice(-4)}`;
  let offWrite = "n/a";
  if (shell === "YES") {
    offWrite = await addExpense(page, f2, "3").then(
      () => "YES",
      async (e: unknown) => {
        await page.screenshot({
          path: `${process.env["PW_VERIFY_OUT"] ?? "."}/prod-offline-add.png`,
        });
        return `NO (${String(e).split("\n").slice(0, 2).join(" ").slice(0, 200)})`;
      },
    );
    await page.waitForTimeout(2000);
    await reload(page).catch(() => undefined);
    offWrite += ` / after offline reload: ${await hasExpense(page, f2)}`;
  }
  await context.setOffline(false);
  console.log(
    `[prod offline] app shell offline=${shell} old expense=${fOff} new offline expense=${offWrite}`,
  );
});
