// @vitest-environment jsdom
/**
 * Регресія: тижневий дайджест рахував перекази між власними картками як
 * витрати і друкував їх сирим `MCC 4829` (bug-репорт 2026-08-09).
 *
 * Ключова відмінність від `metricParity.test.ts`: тут localStorage
 * НАВМИСНО порожній. Усі шість finyk-ключів, з яких дайджест колись брав
 * оверрайди категорій і excluded-set, tombstoned — `useReadonlyPersist` у
 * них не пише, а residual-import дренає їх на буті. Parity-тест сіє й LS, і
 * SQLite, тож він лишався зеленим і при зламаному читанні; цей файл
 * відтворює саме продакшн-стан пристрою після drain-у.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  __setFinykMonoMirrorCacheForTests,
  clearFinykMonoMirrorCache,
} from "@finyk/lib/monoMirrorReader";
import {
  __setFinykSqliteStateCacheForTests,
  clearFinykSqliteCache,
} from "@finyk/lib/sqliteReader";

import { aggregateFinyk } from "./useWeeklyDigest";

const WEEK_KEY = "2026-05-04"; // понеділок

function noonSec(day: string): number {
  return Math.floor(Date.parse(`${day}T12:00:00.000Z`) / 1000);
}

/** MCC 4829 — «переказ коштів»; у каталозі категорій його навмисно немає. */
const MCC_MONEY_TRANSFER = 4829;

const BANK_TXS = [
  // Звичайна витрата: 300 грн, MCC продуктового.
  { id: "t-food", amount: -30_000, time: noonSec("2026-05-05"), mcc: 5411 },
  // Переказ на власну картку, ПОЗНАЧЕНИЙ користувачем як внутрішній:
  // обидві ноги мають виїхати і з витрат, і з доходів.
  {
    id: "t-transfer-out",
    amount: -6_008_000,
    time: noonSec("2026-05-06"),
    mcc: MCC_MONEY_TRANSFER,
    description: "Переказ на картку",
  },
  {
    id: "t-transfer-in",
    amount: 6_008_000,
    time: noonSec("2026-05-06"),
    mcc: MCC_MONEY_TRANSFER,
    description: "Переказ з картки",
  },
  // Витрата з невідомим MCC, яку користувач НЕ позначав: лишається у
  // витратах (гадати за людину не можна), але підпис має бути людський.
  {
    id: "t-unknown-mcc",
    amount: -10_000,
    time: noonSec("2026-05-07"),
    mcc: MCC_MONEY_TRANSFER,
    description: "Невідомий продавець",
  },
  // Прихована транзакція — джерело теж SQLite, не LS.
  { id: "t-hidden", amount: -15_000, time: noonSec("2026-05-07"), mcc: 5411 },
];

const TX_CATEGORIES: Record<string, string> = {
  "t-transfer-out": "internal_transfer",
  "t-transfer-in": "internal_transfer",
  // Оверрайд категорії: користувач переклав витрату в «Кафе та ресторани».
  "t-food": "restaurant",
};

beforeEach(() => {
  localStorage.clear();
  clearFinykMonoMirrorCache();
  __setFinykMonoMirrorCacheForTests({
    transactions: BANK_TXS as never[],
    accounts: [],
    refreshedAt: "2026-05-11T00:00:00.000Z",
  });
  __setFinykSqliteStateCacheForTests({
    txCategories: TX_CATEGORIES,
    hiddenTransactions: ["t-hidden"],
    refreshedAt: "2026-05-11T00:00:00.000Z",
  });
});

describe("aggregateFinyk читає канонічний SQLite-стан, а не дренований LS", () => {
  it("не рахує переказ, позначений внутрішнім, ані у витратах, ані в доходах", () => {
    const out = aggregateFinyk(WEEK_KEY);

    // 300 (t-food) + 100 (t-unknown-mcc). 60 080 грн переказу — поза сумою.
    expect(out.totalSpent).toBe(400);
    expect(out.totalIncome).toBe(0);
  });

  it("не показує сирий `MCC 4829` — невідомий MCC зводиться до «Інше»", () => {
    const out = aggregateFinyk(WEEK_KEY);

    expect(out.topCategories.map((c) => c.name)).not.toContain("MCC 4829");
    expect(out.topCategories).toContainEqual({ name: "💳 Інше", amount: 100 });
  });

  it("поважає оверрайд категорії з SQLite", () => {
    const out = aggregateFinyk(WEEK_KEY);

    // `t-food` має MCC продуктового (5411), але користувач переклав його
    // у «Кафе та ресторани» — дайджест мусить показувати рішення користувача.
    expect(out.topCategories).toContainEqual({
      name: "🍔 Кафе та ресторани",
      amount: 300,
    });
  });

  it("поважає hidden-транзакції з SQLite", () => {
    const out = aggregateFinyk(WEEK_KEY);

    // 2 транзакції у вікні: t-food + t-unknown-mcc. Переказ і прихована —
    // в excluded-set, тож у txCount не потрапляють.
    expect(out.txCount).toBe(2);
  });

  it("падає на LS лише коли SQLite-кеш іще холодний (перший кадр)", () => {
    clearFinykSqliteCache();
    localStorage.setItem("finyk_tx_cats", JSON.stringify(TX_CATEGORIES));
    localStorage.setItem("finyk_hidden_txs", JSON.stringify(["t-hidden"]));

    const out = aggregateFinyk(WEEK_KEY);

    expect(out.totalSpent).toBe(400);
    expect(out.totalIncome).toBe(0);
  });
});
