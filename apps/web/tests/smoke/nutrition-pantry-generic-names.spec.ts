import { test, expect, type Page } from "@playwright/test";

/**
 * Комора: родові назви, картка продукту з варіантами, нові категорії.
 * Клік-через зі спеки `docs/90-work/planning/specs/pantry-generic-names.md`
 * § Верифікація.
 *
 * Демо-режим замість реального входу: сценарій нічого не питає в сервера,
 * крім трьох Сільпо-ендпойнтів, і ті замокані. Той самий фолк auth-bypass,
 * що вже несе `demo-mode-smoke.spec.ts` — тому й `storageState` тут
 * порожній, а не пре-запечений `hub-user`.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const DEMO_LS: Record<string, string> = {
  hub_demo_seeded_social_v1: "1",
  hub_demo_cleanup_v1_done: "1",
  hub_onboarding_done_v1: "1",
  hub_first_real_entry_v1: "1",
  "sergeant.whatsNew.lastSeenId.v1": "2026-05-06-cold-start",
};

const RECEIPT_ID = "r-1";

/** Рядки реального чека — рівно ті, що в таблиці § Рішення 3 спеки. */
const RECEIPT_ITEMS = [
  {
    id: 1,
    name: "Молоко Яготинське 2.6% 900г",
    qty: 1,
    // Реальний чек Сільпо віддає молоко в ГРАМАХ. Саме тому позиція має
    // зійтись із «Молоко Галичина 1%» у літрах через щільність, а не
    // лишитись окремим рядком.
    unit: "900г",
    priceKop: 4200,
    categorySlug: null,
    barcode: null,
  },
  {
    id: 2,
    name: "Насіння Roni гарбуза",
    qty: 1,
    unit: "100г",
    priceKop: 5500,
    categorySlug: null,
    barcode: null,
  },
  {
    id: 3,
    name: "Напій енергетичний Red Bull",
    qty: 1,
    unit: "0,25л",
    priceKop: 6000,
    categorySlug: null,
    barcode: null,
  },
];

/** Другий чек — інший бренд молока, щоб позиція виросла до двох варіантів. */
const SECOND_RECEIPT_ID = "r-2";
const SECOND_RECEIPT_ITEMS = [
  {
    id: 11,
    name: "Молоко Галичина 1%",
    qty: 1,
    unit: "1л",
    priceKop: 4400,
    categorySlug: null,
    barcode: null,
  },
];

/** Форма рядка списку чеків — рівно `SilpoReceiptSummaryDtoSchema`. */
function summary(receiptId: string, purchasedAt: string, totalKop: number) {
  return {
    receiptId,
    purchasedAt,
    storeId: null,
    channel: "offline" as const,
    paymentHint: null,
    totalKop,
    transactionId: null,
  };
}

async function mockSilpo(page: Page) {
  await page.route("**/silpo/sync-state", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "connected",
        accessTokenExpiresAt: null,
        lastSyncAt: "2026-08-28T10:00:00.000Z",
        receiptsCount: 2,
      }),
    }),
  );
  await page.route(/\/silpo\/receipts(\?|$)/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          summary(RECEIPT_ID, "2026-08-28T10:00:00.000Z", 15700),
          summary(SECOND_RECEIPT_ID, "2026-08-21T10:00:00.000Z", 4400),
        ],
        nextCursor: null,
      }),
    }),
  );
  await page.route(`**/silpo/receipts/${SECOND_RECEIPT_ID}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...summary(SECOND_RECEIPT_ID, "2026-08-21T10:00:00.000Z", 4400),
        items: SECOND_RECEIPT_ITEMS,
      }),
    }),
  );
  await page.route(`**/silpo/receipts/${RECEIPT_ID}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...summary(RECEIPT_ID, "2026-08-28T10:00:00.000Z", 15700),
        items: RECEIPT_ITEMS,
      }),
    }),
  );
}

async function seedDemo(page: Page) {
  await page.addInitScript((entries: Record<string, string>) => {
    try {
      for (const [k, v] of Object.entries(entries)) {
        window.localStorage.setItem(k, v);
      }
    } catch {
      /* ignore — incognito storage quotas, etc. */
    }
  }, DEMO_LS);
}

test("@critical pantry: назва з чека згортається до родової, варіанти розгортаються", async ({
  page,
}) => {
  await seedDemo(page);
  await mockSilpo(page);

  await page.goto("/nutrition/pantry", { waitUntil: "domcontentloaded" });

  // 1. Аркуш поповнення показує, під яку назву ляже позиція.
  await page
    .getByRole("button", { name: "З покупок Сільпо" })
    .click({ timeout: 20_000 });

  const milkRow = page
    .getByRole("listitem")
    .filter({ hasText: "Молоко Яготинське" });
  await expect(milkRow).toContainText("Ляже як", { timeout: 15_000 });
  await expect(milkRow).toContainText("Молоко");
  await expect(
    milkRow.getByRole("button", { name: "лишити повну" }),
  ).toBeVisible();

  // Напої згортання не проходять — бренд там змінює суть продукту.
  const energyRow = page.getByRole("listitem").filter({ hasText: "Red Bull" });
  await expect(energyRow).not.toContainText("Ляже як");

  // 2. Підтвердження кладе в комору РОДОВУ назву.
  await page.getByRole("button", { name: /Додати в комору/ }).click();
  await expect(
    page.getByRole("button", { name: /^Редагувати Молоко$/ }),
  ).toBeVisible({ timeout: 15_000 });

  // 5. Насіння гарбуза лежить у «Горіхи та насіння», не в «Овочах».
  await expect(page.getByText("Горіхи та насіння")).toBeVisible();

  // 3. Друге поповнення іншим брендом не створює другої позиції.
  await page.getByRole("button", { name: "З покупок Сільпо" }).click();
  await page.getByRole("button", { name: /21\.08\.2026/ }).click();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Молоко Галичина" }),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /Додати в комору/ }).click();

  await expect(
    page.getByRole("button", { name: /^Редагувати Молоко$/ }),
  ).toHaveCount(1, { timeout: 15_000 });

  // 4. Розгортання показує обидві покупки з кількостями.
  //
  // Заразом видно обидва рівні шкали одиниць: сума виїхала в літри
  // (900 г / 1.03 + 1000 мл = 1874 мл → «1,87 л»), а окремі покупки нижче
  // порога 1000 лишились у мілілітрах, щоб їх було видно як доданки.
  await expect(page.getByText(/1,87\s*л/)).toBeVisible();
  await page.getByRole("button", { name: "Показати покупки" }).click();
  await expect(page.getByText("Молоко Яготинське 2.6% 900г")).toBeVisible();
  await expect(page.getByText("Молоко Галичина 1%")).toBeVisible();
  await expect(page.getByText(/874\s*мл/)).toBeVisible();

  // 9. Перейменування позиції не втрачає варіантів — друга страховка
  // проти помилки евристики.
  await page.getByRole("button", { name: /^Редагувати Молоко$/ }).click();
  const nameField = page.getByLabel("Назва");
  await nameField.fill("Молочко");
  await page.getByRole("button", { name: "Зберегти" }).click();

  await expect(
    page.getByRole("button", { name: /^Редагувати Молочко$/ }),
  ).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Показати покупки" }).click();
  await expect(page.getByText("Молоко Яготинське 2.6% 900г")).toBeVisible();
  await expect(page.getByText("Молоко Галичина 1%")).toBeVisible();
});
