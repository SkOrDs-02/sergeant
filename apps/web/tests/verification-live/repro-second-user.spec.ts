import { expect, test } from "@playwright/test";

import { seedFTUX } from "../utils/seedFTUX";
import { waitForServiceWorkerActivated } from "../utils/serviceWorker";
import { addExpense, goto, QA_PASSWORD, reload } from "../utils/liveJourneyHelpers";

test.use({ storageState: { cookies: [], origins: [] } });

async function register(page: import("@playwright/test").Page, email: string) {
  await goto(page, "/sign-in");
  await page.getByRole("button", { name: /Немає акаунту\? Зареєструватися/ }).click();
  await page.getByPlaceholder("Твоє імʼя").fill("Second");
  await page.getByPlaceholder("email@example.com").fill(email);
  await page.getByPlaceholder(/Мінімум 10 символів/).fill(QA_PASSWORD);
  await page.getByRole("button", { name: "Зареєструватися", exact: true }).click();
}

for (const variant of ["cancelled-offline-logout", "two-tabs-takeover", "anon-migrated-first"] as const) {
  test(`second user on same device: ${variant}`, async ({ page }) => {
    const logs: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") {
        const t = m.text();
        if (!/Failed to load resource|OPFS sqlite3_vfs|Atomics\.wait/.test(t)) logs.push(`${m.type()}: ${t.slice(0, 300)}`);
      }
    });
    page.on("pageerror", (e) => logs.push(`pageerror: ${e.message.slice(0, 300)}`));
    await seedFTUX(page, "post-ftux", { extra: { finyk_manual_only_v1: "1" } });
    await page.addLocatorHandler(page.getByRole("button", { name: "Зрозуміло", exact: true }), (b) => b.click());
    const run = Date.now().toString(36).slice(-5);

    if (variant === "anon-migrated-first") {
      await addExpense(page, `ANON ${run}`, "4");
      await page.waitForTimeout(2500);
      await waitForServiceWorkerActivated(page);
    }

    await register(page, `u1_${run}@example.com`);
    await expect(page).not.toHaveURL(/\/sign-in/, { timeout: 60_000 });
    await page.waitForTimeout(3000);

    if (variant === "cancelled-offline-logout") {
      await goto(page, "/finyk/transactions");
      await waitForServiceWorkerActivated(page);
      await page.context().setOffline(true);
      await addExpense(page, `X ${run}`, "9");
      await page.waitForTimeout(2000);
      await goto(page, "/profile");
      await page.getByRole("button", { name: "Вийти" }).first().click();
      await page.getByRole("button", { name: "Вийти", exact: true }).last().click();
      await expect(page.getByText("Є незбережені записи")).toBeVisible({ timeout: 20_000 });
      await page.getByRole("button", { name: "Залишитись" }).click();
      await page.context().setOffline(false);
      await expect(page.getByRole("button", { name: /в черзі/ })).toBeHidden({ timeout: 60_000 });
    }
    if (variant === "two-tabs-takeover") {
      const tab2 = await page.context().newPage();
      await tab2.addLocatorHandler(tab2.getByRole("button", { name: "Зрозуміло", exact: true }), (b) => b.click());
      await tab2.goto("/finyk/transactions");
      await tab2.getByRole("button", { name: "Працювати тут" }).click({ timeout: 20_000 });
      await addExpense(tab2, `Y ${run}`, "9");
      await tab2.waitForTimeout(2500);
      await tab2.close();
      await reload(page);
      await page.waitForTimeout(3000);
    }

    await goto(page, "/profile");
    await page.getByRole("button", { name: "Вийти" }).first().click();
    await page.getByRole("button", { name: "Вийти", exact: true }).last().click();
    await expect(page).toHaveURL(/sign-in/, { timeout: 20_000 });

    await goto(page, "/finyk/transactions");
    await goto(page, "/routine/habits");
    await page.waitForTimeout(2000);

    await register(page, `u2_${run}@example.com`);
    const outcome = await Promise.race([
      page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 60_000 }).then(() => "entered"),
      page.getByText("Не вдалося завершити перенесення").waitFor({ timeout: 60_000 }).then(() => "FAILED"),
    ]).catch(() => "timeout");
    const body = (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 400);
    console.log(`[${variant}] outcome=${outcome}\n  screen: ${body}\n  logs: ${JSON.stringify(logs.slice(-8))}`);
  });
}
