import { expect, test, type CDPSession, type Page } from "@playwright/test";
import { seedFTUX } from "../utils/seedFTUX";
import { waitForSqliteRefreshAfter } from "../utils/sqliteRefresh";
import {
  collectPageErrors,
  settleToasts,
  waitForInitialSqliteRefresh,
} from "./smokeHelpers";

/**
 * Аудит 2026-10-01, data-05: SQL-запис падає ПОСЕРЕД сесії (квота, SQLITE_IOERR),
 * хоча база відкрилась нормально. Очікування: людина бачить банер «Частина
 * записів не збереглась» (#1574), а журнал dual-write запис НЕ знімає (він
 * дограється на наступному буті).
 *
 * Лейн: smoke-конфіг, але теґ `@storage`, не `@critical` (щоб не гейтити PR):
 * потрібен лише Chromium (CDP `Storage.overrideQuotaForOrigin`), а бекенд не
 * потрібен взагалі, бо сценарій анонімний. Запуск: `pnpm --filter @sergeant/web
 * e2e:storage`.
 *
 * Квота, а не підміна коду: `quotaSize: 1` змушує справжній OPFS/SAH-пул
 * воркера кинути `QuotaExceededError` на першому ж рості журналу SQLite.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const BANNER = "Частина записів не збереглась";
const JOURNAL_KEY = "sergeant.dual_write_journal_v1";

interface JournalEntry {
  readonly module: string;
  readonly attempts?: number;
  readonly payload: unknown;
}

async function readJournal(page: Page): Promise<JournalEntry[]> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as JournalEntry[]) : [];
  }, JOURNAL_KEY);
}

async function openAddExpense(page: Page, title: string) {
  await settleToasts(page);
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
  return dialog;
}

async function setQuota(cdp: CDPSession, origin: string, bytes?: number) {
  // Без `quotaSize` перевизначення знімається.
  await cdp.send("Storage.overrideQuotaForOrigin", {
    origin,
    ...(bytes === undefined ? {} : { quotaSize: bytes }),
  });
}

test("@storage data-05: вичерпана квота посеред сесії показує банер, а журнал не знімає запис", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "CDP Storage.* є лише в Chromium");
  test.setTimeout(120_000);
  const errors = await collectPageErrors(page);
  const healthy = `QUOTA ok ${crypto.randomUUID()}`;
  const failed = `QUOTA fail ${crypto.randomUUID()}`;

  await seedFTUX(page, "post-ftux", { extra: { finyk_manual_only_v1: "1" } });
  await page.goto("/finyk/transactions", { waitUntil: "domcontentloaded" });
  await waitForInitialSqliteRefresh(page, "finyk");

  // Базова лінія: поки місця вистачає, банера немає.
  const okDialog = await openAddExpense(page, healthy);
  await waitForSqliteRefreshAfter(page, "finyk", async () => {
    await okDialog
      .getByRole("button", { name: "Додати витрату", exact: true })
      .click();
  });
  await expect(okDialog).toBeHidden();
  await expect(page.getByText(BANNER, { exact: true })).toHaveCount(0);

  const cdp = await page.context().newCDPSession(page);
  const origin = new URL(page.url()).origin;
  await setQuota(cdp, origin, 1);
  try {
    const dialog = await openAddExpense(page, failed);
    await dialog
      .getByRole("button", { name: "Додати витрату", exact: true })
      .click();

    await expect(page.getByText(BANNER, { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    // Журнал тримає запис, який SQL не прийняв: `attempts` росте лише після
    // реального `errored > 0`, а не після самого додавання.
    await expect
      .poll(
        async () =>
          (await readJournal(page)).find(
            (e) =>
              e.module === "finyk" &&
              JSON.stringify(e.payload).includes(failed),
          )?.attempts ?? 0,
        { timeout: 15_000 },
      )
      .toBeGreaterThanOrEqual(1);
  } finally {
    await setQuota(cdp, origin);
  }

  // Місце звільнилось: наступний чистий запис ховає банер сам.
  const recoverDialog = await openAddExpense(
    page,
    `QUOTA back ${crypto.randomUUID()}`,
  );
  await recoverDialog
    .getByRole("button", { name: "Додати витрату", exact: true })
    .click();
  await expect(page.getByText(BANNER, { exact: true })).toBeHidden({
    timeout: 15_000,
  });
  // Квота-збій у воркері не має валити сторінку необробленою помилкою.
  expect(errors).toEqual([]);
});
