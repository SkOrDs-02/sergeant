import { expect, test, type Page } from "@playwright/test";
import type { SyncV2PullResponse } from "@sergeant/api-client";
import { probeOpfs } from "../utils/opfs";
import { seedFTUX } from "../utils/seedFTUX";
import { waitForServiceWorkerActivated } from "../utils/serviceWorker";
import { waitForSqliteRefreshAfter } from "../utils/sqliteRefresh";

/**
 * Офлайн холодний старт залогіненого пристрою (знахідка A16 аудиту
 * 2026-11-11, спека `docs/work/specs/offline-cold-start.md`).
 *
 * Без мережі `GET /api/v1/me` падає мережевою помилкою; до фіксу застосунок
 * показував лише «Сервер недоступний», хоча дані власника лежать локально.
 * Тепер особистість береться зі штампа власника і застосунок відкривається.
 *
 * Свій акаунт на тест (реєстрація через UI), а не спільний `storageState`:
 * у кроці «новий контекст бачить запис» чужі записи lane-у не заважають, а
 * вихід у другому кейсі не ламає сесію інших spec-ів.
 */
test.use({ storageState: { cookies: [], origins: [] } });
// OPFS-проба (`tests/utils/opfs.ts`) і офлайн через сервіс-воркер звірені лише
// в Chromium, як і в lane-і `@storage`.
test.skip(
  ({ browserName }) => browserName !== "chromium",
  "офлайн холодний старт перевіряється в Chromium",
);

const API = process.env["VITE_API_BASE_URL"] ?? "http://127.0.0.1:3000";
const SERVER_DOWN = "Сервер недоступний";
const OWNER_STAMP_KEY = "hub_chat_owner_v1";

async function register(page: Page): Promise<string> {
  const nonce = crypto.randomUUID();
  const email = `offline_${nonce}@example.com`;
  await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Немає акаунту? Зареєструватися" })
    .click();
  await page.fill("#auth-name", "Offline Smoke");
  await page.fill("#auth-email", email);
  await page.fill("#auth-password", `pw_${nonce}_long_enough`);
  await page
    .getByRole("button", { name: "Зареєструватися", exact: true })
    .click();
  await expect(page).not.toHaveURL(/\/sign-in/, { timeout: 15_000 });
  return email;
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

async function serverHasExpense(page: Page, title: string): Promise<number> {
  const res = await page
    .context()
    .request.get(`${API}/api/v2/sync/pull?since=0`);
  if (res.status() !== 200) return 0;
  const data = (await res.json()) as SyncV2PullResponse;
  return data.ops.filter((op) => JSON.stringify(op.row).includes(title)).length;
}

/** Увесь текст IndexedDB origin-а (RQ-снапшот і решта сторів) одним рядком. */
async function dumpIndexedDb(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const out: string[] = [];
    const dbs = await indexedDB.databases();
    for (const info of dbs) {
      if (!info.name) continue;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(info.name as string);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      for (const store of Array.from(db.objectStoreNames)) {
        const values = await new Promise<unknown[]>((resolve, reject) => {
          const req = db.transaction(store).objectStore(store).getAll();
          req.onsuccess = () => resolve(req.result as unknown[]);
          req.onerror = () => reject(req.error);
        });
        for (const value of values) {
          try {
            out.push(typeof value === "string" ? value : JSON.stringify(value));
          } catch {
            /* бінарні значення не серіалізуються: email там не шукаємо */
          }
        }
      }
      db.close();
    }
    return out.join("\n");
  });
}

test("@critical офлайн холодний старт: дані власника, черга і доставка після мережі", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(180_000);
  const first = `OFFLINE-A ${crypto.randomUUID()}`;
  const second = `OFFLINE-B ${crypto.randomUUID()}`;

  await seedFTUX(page, "post-ftux", { extra: { finyk_manual_only_v1: "1" } });
  const email = await register(page);
  await page.goto("/finyk/transactions", { waitUntil: "domcontentloaded" });
  await addExpense(page, first);
  await expect
    .poll(() => serverHasExpense(page, first), { timeout: 60_000 })
    .toBe(1);
  expect(await waitForServiceWorkerActivated(page)).toBe("controlling");

  // Холодний старт без мережі: нова сторінка, `/` віддає сервіс-воркер.
  await page.close();
  await context.setOffline(true);
  const offline = await context.newPage();
  await offline.goto("/", { waitUntil: "domcontentloaded" });

  await expect(offline.locator("nav[aria-label='Розділи хабу']")).toBeVisible({
    timeout: 30_000,
  });
  await expect(offline.getByText(SERVER_DOWN)).toHaveCount(0);
  await expect(
    offline.locator('[data-testid="offline-banner"][data-state="offline"]'),
  ).toBeVisible({ timeout: 10_000 });

  await offline.goto("/finyk/transactions", { waitUntil: "domcontentloaded" });
  await expect(offline.getByText(first)).toBeVisible({ timeout: 30_000 });
  await expect(offline.getByText(SERVER_DOWN)).toHaveCount(0);

  await addExpense(offline, second);
  await expect(
    offline.locator('[data-testid="offline-banner"][data-state="offline"]'),
  ).toContainText("1 в черзі", { timeout: 15_000 });

  // priv-08: після офлайн-сесії email не лежить ні в LS, ні в kv_store
  // (OPFS), ні в RQ-снапшоті (IndexedDB).
  const ls = await offline.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(ls).not.toContain(email);
  const opfs = await probeOpfs(offline, {
    needles: [email],
    headerPattern: "sergeant-[A-Za-z0-9_-]+\\.db",
  });
  expect(opfs.filter((f) => f.needles.includes(email))).toEqual([]);
  expect(await dumpIndexedDb(offline)).not.toContain(email);

  // Мережа повернулась: плашка зникає, запис доїжджає.
  await context.setOffline(false);
  await expect(
    offline.locator('[data-testid="offline-banner"][data-state="offline"]'),
  ).toHaveCount(0, { timeout: 30_000 });
  await expect
    .poll(() => serverHasExpense(offline, second), { timeout: 60_000 })
    .toBe(1);

  // Новий контекст того ж акаунта бачить офлайн-запис.
  const other = await browser.newContext({
    storageState: await context.storageState(),
  });
  try {
    const otherPage = await other.newPage();
    await seedFTUX(otherPage, "post-ftux", {
      extra: { finyk_manual_only_v1: "1" },
    });
    await otherPage.goto("/finyk/transactions", {
      waitUntil: "domcontentloaded",
    });
    await expect(otherPage.getByText(second)).toBeVisible({ timeout: 60_000 });
  } finally {
    await other.close();
  }
});

test("@critical офлайн холодний старт після виходу: анонімний режим, не дані акаунта", async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  const title = `OFFLINE-OUT ${crypto.randomUUID()}`;

  await seedFTUX(page, "post-ftux", { extra: { finyk_manual_only_v1: "1" } });
  await register(page);
  await page.goto("/finyk/transactions", { waitUntil: "domcontentloaded" });
  await addExpense(page, title);
  await expect
    .poll(() => serverHasExpense(page, title), { timeout: 60_000 })
    .toBe(1);

  await page.goto("/profile", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Вийти", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Вийти", exact: true })
    .click();
  await expect(page).toHaveURL(/\/sign-in/, { timeout: 30_000 });
  expect(await waitForServiceWorkerActivated(page)).toBe("controlling");

  await page.close();
  await context.setOffline(true);
  const offline = await context.newPage();
  await offline.goto("/finyk/transactions", { waitUntil: "domcontentloaded" });
  await expect(offline.locator("#root > *").first()).toBeAttached({
    timeout: 30_000,
  });

  const stamp = await offline.evaluate(
    (key) => window.localStorage.getItem(key),
    OWNER_STAMP_KEY,
  );
  expect(stamp === null || stamp === "__anon__").toBe(true);
  await expect(offline.getByText(SERVER_DOWN)).toHaveCount(0);
  await expect(offline.getByText(title)).toHaveCount(0);
  await context.setOffline(false);
});
