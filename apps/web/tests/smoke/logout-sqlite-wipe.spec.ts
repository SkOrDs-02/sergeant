import { expect, test, type Page } from "@playwright/test";
import type { SyncV2PullResponse } from "@sergeant/api-client";
import { probeOpfs } from "../utils/opfs";
import { seedFTUX } from "../utils/seedFTUX";
import { waitForSqliteRefreshAfter } from "../utils/sqliteRefresh";
import { collectPageErrors } from "./smokeHelpers";

/**
 * Аудит 2026-10-01, priv-05: після виходу файл SQLite-партиції користувача в
 * OPFS має бути стертий (#1335 вихід, #1578 повтор стирання й прибирання
 * осиротілих файлів, маркер `sqlite_pending_wipe_v1`). До фіксу файл із
 * фінансами лишався читабельним для DevTools і будь-якого скрипта origin-а.
 *
 * Лейн: smoke-конфіг (потрібен логін, отже Postgres + server), теґ `@storage`,
 * не `@critical`. Запуск: `pnpm --filter @sergeant/web e2e:storage`.
 *
 * Перевірка йде по БАЙТАХ слотів SAH-пулу (`tests/utils/opfs.ts`): унікальний
 * текст витрати мусить зникнути з усього OPFS. Це свідомо не перевірка «імені
 * партиції»: під час виходу інший споживач може перевідкрити партицію і
 * створити порожній файл під тим самим імʼям (без даних користувача).
 *
 * ПРИМІТКА: стирання доводять ДВА механізми (синхронний `wipe` у `logout()` і
 * маркер/прибирання при наступному буті), тож тест перевіряє результат, а не
 * котрий із них спрацював: чекає до 30 с.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const API = process.env["VITE_API_BASE_URL"] ?? "http://127.0.0.1:3000";
const PARTITION = "sergeant-[A-Za-z0-9_-]+\\.db";
const PENDING_WIPE_KEY = "sqlite_pending_wipe_v1";

async function register(page: Page) {
  const nonce = crypto.randomUUID();
  await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Немає акаунту? Зареєструватися" })
    .click();
  await page.fill("#auth-name", "Wipe Smoke");
  await page.fill("#auth-email", `wipe_${nonce}@example.com`);
  await page.fill("#auth-password", `pw_${nonce}_long_enough`);
  await page
    .getByRole("button", { name: "Зареєструватися", exact: true })
    .click();
  await expect(page).not.toHaveURL(/\/sign-in/, { timeout: 15_000 });
}

async function addExpense(page: Page, title: string) {
  await page
    .getByTestId("corner-action")
    .getByRole("button", { name: "Додати" })
    .click();
  await page
    .getByTestId("add-sources")
    .getByRole("button", { name: /^Вручну/ })
    .click();
  const dialog = page.getByRole("dialog", { name: "Додати витрату" });
  await expect(dialog).toBeVisible();
  await page.getByLabel("Сума ₴").fill("89");
  await page.getByLabel("Назва").fill(title);
  await waitForSqliteRefreshAfter(page, "finyk", async () => {
    await dialog
      .getByRole("button", { name: "Додати витрату", exact: true })
      .click();
  });
  await expect(dialog).toBeHidden();
}

test("@storage priv-05: після виходу дані користувача стерті з OPFS, маркер стирання знято", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const errors = await collectPageErrors(page);
  const title = `WIPE ${crypto.randomUUID()}`;
  const probe = { needles: [title], headerPattern: PARTITION };

  await seedFTUX(page, "post-ftux", { extra: { finyk_manual_only_v1: "1" } });
  await register(page);
  await page.goto("/finyk/transactions", { waitUntil: "domcontentloaded" });
  await addExpense(page, title);

  // Запис дійшов до сервера: вихід не питатиме про незбережене, а сам факт
  // доставки відрізняє «стерто» від «ще не лягло».
  await expect
    .poll(
      async () => {
        const res = await page
          .context()
          .request.get(`${API}/api/v2/sync/pull?since=0`);
        if (res.status() !== 200) return 0;
        const data = (await res.json()) as SyncV2PullResponse;
        return data.ops.filter((op) => JSON.stringify(op.row).includes(title))
          .length;
      },
      { timeout: 60_000 },
    )
    .toBe(1);

  // Передумова: текст справді лежить у файлі партиції користувача, не в anon.
  const before = await probeOpfs(page, probe);
  const holder = before.find((f) => f.needles.includes(title));
  expect(holder?.partition).toBeTruthy();
  expect(holder?.partition).not.toBe("sergeant-anon.db");

  await page.goto("/profile", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Вийти", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Вийти", exact: true })
    .click();
  await expect(page).toHaveURL(/\/sign-in/, { timeout: 30_000 });

  await expect
    .poll(
      async () =>
        (await probeOpfs(page, probe)).filter((f) => f.needles.includes(title))
          .length,
      { timeout: 30_000, message: "текст витрати лишився в OPFS після виходу" },
    )
    .toBe(0);

  // Анонімну партицію вихід не чіпає (там можуть лежати чернетки).
  const after = await probeOpfs(page, probe);
  expect(after.some((f) => f.partition === "sergeant-anon.db")).toBe(true);

  // Маркер знято: стирання довершено, а не відкладено на наступний старт.
  await expect
    .poll(
      () =>
        page.evaluate(
          (key) => window.localStorage.getItem(key),
          PENDING_WIPE_KEY,
        ),
      { timeout: 30_000 },
    )
    .toBeNull();
  expect(errors).toEqual([]);
});
