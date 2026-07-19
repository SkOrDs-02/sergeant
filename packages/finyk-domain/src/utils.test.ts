// DOM-free unit tests for pure Finyk helpers (migrated from
// `apps/web/src/modules/finyk/utils.test.ts` as part of R3 to keep tests
// co-located with the pure code they cover). Tests that depend on
// `localStorage` (`getFinykExcludedTxIdsFromStorage`,
// `getFinykTxSplitsFromStorage`) remain in `apps/web` since they exercise
// the web-specific `lsStats` wrapper.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getIncomeCategory,
  getCategory,
  fmtAmt,
  fmtDate,
  getAccountLabel,
  getMonoDebt,
  isMonoDebt,
  daysUntil,
  getMonthStart,
  getTxStatAmount,
  calcCategorySpent,
  calcFinykSpendingTotal,
  calcFinykSpendingByDate,
  getMonoTotals,
  resolveExpenseCategoryMeta,
} from "./utils.js";
import { INTERNAL_TRANSFER_ID, CURRENCY } from "./constants.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("getIncomeCategory", () => {
  it("повертає категорію за overrideId", () => {
    expect(getIncomeCategory("", "in_salary").id).toBe("in_salary");
    expect(getIncomeCategory("", "in_cashback").id).toBe("in_cashback");
  });
  it("падає назад на in_other коли опису нема та override нема", () => {
    expect(getIncomeCategory("", null).id).toBe("in_other");
  });
  it("знаходить категорію по keywords у описі", () => {
    expect(getIncomeCategory("Зарплата від роботодавця").id).toBe("in_salary");
  });
  it("ігнорує невалідний overrideId і падає на опис/дефолт", () => {
    expect(getIncomeCategory("", "no_such_id").id).toBe("in_other");
  });
});

describe("getCategory (expense)", () => {
  it("маппить відомий MCC на категорію", () => {
    expect(getCategory("", 5411).id).toBe("food");
    expect(getCategory("", 4111).id).toBe("transport");
  });
  it("шукає по keyword в описі", () => {
    expect(getCategory("АТБ №123", 0).id).toBe("food");
    expect(getCategory("Uber поїздка", 0).id).toBe("transport");
  });
  it("override має перевагу над MCC", () => {
    expect(getCategory("", 5411, "transport").id).toBe("transport");
  });
  it("користувацька категорія застосовується через override", () => {
    const custom = [{ id: "custom_1", label: "Моя" }];
    const cat = getCategory("", 0, "custom_1", custom);
    expect(cat.id).toBe("custom_1");
    expect(cat.label).toBe("Моя");
  });
  it("fallback 'other' для невідомого MCC без ключових слів", () => {
    expect(getCategory("щось випадкове", 9999).id).toBe("other");
  });
});

describe("resolveExpenseCategoryMeta", () => {
  it("повертає MCC категорію", () => {
    const r = resolveExpenseCategoryMeta("food");
    expect(r).not.toBeNull();
    expect(r!.id).toBe("food");
  });
  it("повертає кастомну категорію з переданого списку", () => {
    const r = resolveExpenseCategoryMeta("c_1", [
      { id: "c_1", label: "Підписка на кабельне" },
    ]);
    expect(r).not.toBeNull();
    expect(r!.id).toBe("c_1");
    expect(r!.label).toBe("Підписка на кабельне");
  });
  it("повертає null для невідомого id", () => {
    expect(resolveExpenseCategoryMeta("ghost")).toBeNull();
  });
});

describe("fmtAmt", () => {
  it("форматує UAH з символом ₴", () => {
    expect(fmtAmt(15000, CURRENCY.UAH)).toContain("₴");
  });
  it("додає + для позитивних і не додає для від'ємних", () => {
    expect(fmtAmt(10000).startsWith("+")).toBe(true);
    expect(fmtAmt(-10000).startsWith("+")).toBe(false);
  });
  it("підтримує USD та EUR символи", () => {
    expect(fmtAmt(10000, CURRENCY.USD)).toContain("$");
    expect(fmtAmt(10000, (CURRENCY.EUR || "EUR") as never)).toContain("€");
  });
});

describe("fmtDate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T12:00:00Z"));
  });
  it("повертає 'Сьогодні' для сьогоднішнього timestamp", () => {
    const nowSec = Math.floor(Date.now() / 1000);
    expect(fmtDate(nowSec)).toMatch(/^Сьогодні/);
  });
  it("повертає 'Вчора' для учорашнього timestamp", () => {
    const yesterdaySec = Math.floor(Date.now() / 1000) - 86400;
    expect(fmtDate(yesterdaySec)).toMatch(/^Вчора/);
  });
  it("групує за календарним днем, а не за 24-годинним інтервалом", () => {
    // О 00:30 транзакція, зроблена вчора о 23:50 (≈40 хв тому), має бути «Вчора».
    vi.setSystemTime(new Date("2024-06-15T00:30:00"));
    const lateYesterdayTs = Math.floor(
      new Date("2024-06-14T23:50:00").getTime() / 1000,
    );
    expect(fmtDate(lateYesterdayTs)).toMatch(/^Вчора/);

    // О 23:00 транзакція о 01:00 того ж дня (≈22 год тому) — «Сьогодні».
    vi.setSystemTime(new Date("2024-06-15T23:00:00"));
    const earlyTodayTs = Math.floor(
      new Date("2024-06-15T01:00:00").getTime() / 1000,
    );
    expect(fmtDate(earlyTodayTs)).toMatch(/^Сьогодні/);
  });

  it("падає на форматовану дату (день.місяць) коли diff > 1 день", () => {
    const olderTs = Math.floor(
      new Date("2024-06-10T12:00:00Z").getTime() / 1000,
    );
    const result = fmtDate(olderTs);
    expect(result).not.toMatch(/^Сьогодні/);
    expect(result).not.toMatch(/^Вчора/);
  });
});

describe("getAccountLabel", () => {
  it("повертає спеціальну мітку для єПідтримки", () => {
    expect(getAccountLabel({ type: "eAid" })).toContain("Єпідтримка");
  });
  it("кредитна картка коли ліміт>0 і type=black", () => {
    expect(
      getAccountLabel({
        type: "black",
        creditLimit: 5000,
        balance: 0,
      } as never),
    ).toContain("Кредитна");
  });
  it("кредит коли ліміт>0 і інший type", () => {
    expect(
      getAccountLabel({
        type: "white",
        creditLimit: 5000,
        balance: 0,
      } as never),
    ).toContain("Кредит");
  });
  it("fallback коли нічого не співпадає", () => {
    expect(getAccountLabel({ type: "unknown" })).toContain("Картка");
  });
  it("чорна картка без кредитного ліміту", () => {
    expect(getAccountLabel({ type: "black" })).toContain("Чорна картка");
  });
  it("біла картка", () => {
    expect(getAccountLabel({ type: "white" })).toContain("Біла картка");
  });
  it("платинова картка", () => {
    expect(getAccountLabel({ type: "platinum" })).toContain("Платинова");
  });
  it("залізна картка", () => {
    expect(getAccountLabel({ type: "iron" })).toContain("Залізна");
  });
  it("ФОП картка", () => {
    expect(getAccountLabel({ type: "fop" })).toContain("ФОП");
  });
  it("creditLimit <= 0 не тригерить кредитну гілку", () => {
    expect(
      getAccountLabel({ type: "black", creditLimit: 0 } as never),
    ).toContain("Чорна картка");
  });
});

describe("getMonoDebt", () => {
  it("повертає (creditLimit - balance)/100 коли кредитка з балансом нижче ліміту", () => {
    expect(getMonoDebt({ creditLimit: 500000, balance: 200000 })).toBe(3000);
  });
  it("повертає 0 коли баланс дорівнює або перевищує ліміт", () => {
    expect(getMonoDebt({ creditLimit: 500000, balance: 500000 })).toBe(0);
    expect(getMonoDebt({ creditLimit: 500000, balance: 600000 })).toBe(0);
  });
  it("повертає |balance|/100 для некредитки з мінусом", () => {
    expect(getMonoDebt({ creditLimit: 0, balance: -150000 })).toBe(1500);
  });
  it("повертає 0 для некредитки з плюсом", () => {
    expect(getMonoDebt({ creditLimit: 0, balance: 500000 })).toBe(0);
  });
});

describe("isMonoDebt", () => {
  it("true коли є заборгованість по кредитці", () => {
    expect(isMonoDebt({ creditLimit: 500000, balance: 200000 })).toBe(true);
  });
  it("true коли дебетова картка у мінусі (овердрафт/реверс)", () => {
    expect(isMonoDebt({ creditLimit: 0, balance: -100000 })).toBe(true);
  });
  it("false коли дебетова картка у плюсі", () => {
    expect(isMonoDebt({ creditLimit: 0, balance: 100000 })).toBe(false);
    expect(isMonoDebt({ creditLimit: 0, balance: 0 })).toBe(false);
  });
  it("false коли ліміт вичерпано/погашено", () => {
    expect(isMonoDebt({ creditLimit: 500000, balance: 500000 })).toBe(false);
  });
});

describe("daysUntil", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 5, 10, 12, 0, 0));
  });
  it("повертає додатну кількість днів до дати в поточному місяці", () => {
    expect(daysUntil(20)).toBe(10);
  });
  it("переходить на наступний місяць коли день вже минув", () => {
    expect(daysUntil(5)).toBeGreaterThan(20);
    expect(daysUntil(5)).toBeLessThanOrEqual(31);
  });
});

describe("getMonthStart", () => {
  it("повертає перший день поточного місяця", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 5, 15, 12, 0, 0));
    const start = getMonthStart();
    expect(start.getDate()).toBe(1);
    expect(start.getMonth()).toBe(5);
    expect(start.getFullYear()).toBe(2024);
  });
});

describe("getTxStatAmount", () => {
  it("без спліту повертає |amount|/100", () => {
    expect(getTxStatAmount({ id: "t1", amount: -12345 })).toBeCloseTo(123.45);
  });
  it("зі сплітом сумує тільки не-internal_transfer частини", () => {
    const splits = {
      t1: [
        { amount: 100, categoryId: "food" },
        { amount: 50, categoryId: INTERNAL_TRANSFER_ID },
        { amount: 25, categoryId: "transport" },
      ],
    };
    expect(getTxStatAmount({ id: "t1", amount: -17500 }, splits)).toBe(125);
  });
  it("0 коли всі сплити — internal_transfer", () => {
    const splits = {
      t1: [{ amount: 100, categoryId: INTERNAL_TRANSFER_ID }],
    };
    expect(getTxStatAmount({ id: "t1", amount: -10000 }, splits)).toBe(0);
  });
});

describe("calcCategorySpent", () => {
  const txs = [
    { id: "1", amount: -50000, mcc: 5411, description: "АТБ" }, // food
    { id: "2", amount: -20000, mcc: 4111, description: "Uber" }, // transport
    { id: "3", amount: 30000, mcc: 5411, description: "refund" }, // income, ignored
    { id: "4", amount: -10000, mcc: 0, description: "АТБ маг" }, // food (keyword)
  ];
  it("сумує витрати для food через MCC+keyword", () => {
    expect(calcCategorySpent(txs, "food")).toBe(600);
  });
  it("сумує через override для окремої транзакції", () => {
    expect(calcCategorySpent(txs, "transport", { 4: "transport" })).toBe(300);
  });
  it("використовує спліт коли він заданий", () => {
    const splits = {
      1: [
        { amount: 200, categoryId: "food" },
        { amount: 300, categoryId: "restaurant" },
      ],
    };
    expect(calcCategorySpent(txs, "food", {}, splits)).toBe(300);
    expect(calcCategorySpent(txs, "restaurant", {}, splits)).toBe(300);
  });
});

describe("calcFinykSpendingTotal", () => {
  const txs = [
    { id: "1", amount: -50000 },
    { id: "2", amount: -20000 },
    { id: "3", amount: 30000 },
    { id: "4", amount: -10000 },
  ];
  it("сумує всі витрати коли немає excluded", () => {
    expect(calcFinykSpendingTotal(txs)).toBe(800);
  });
  it("ігнорує tx з excluded Set", () => {
    expect(calcFinykSpendingTotal(txs, { excludedTxIds: new Set(["1"]) })).toBe(
      300,
    );
  });
  it("приймає excluded як масив", () => {
    expect(calcFinykSpendingTotal(txs, { excludedTxIds: ["1", "2"] })).toBe(
      100,
    );
  });
  it("ігнорує позитивні суми (це доходи)", () => {
    const positives = [{ id: "p", amount: 99999 }];
    expect(calcFinykSpendingTotal(positives)).toBe(0);
  });
  it("повертає 0 для не-масиву на вході", () => {
    expect(calcFinykSpendingTotal(null)).toBe(0);
    expect(calcFinykSpendingTotal(undefined)).toBe(0);
  });
  it("враховує txSplits (виключає internal transfer)", () => {
    const splits = {
      1: [
        { amount: 200, categoryId: "food" },
        { amount: 300, categoryId: INTERNAL_TRANSFER_ID },
      ],
    };
    const one = [{ id: "1", amount: -50000 }];
    expect(calcFinykSpendingTotal(one, { txSplits: splits })).toBe(200);
  });
});

describe("calcFinykSpendingByDate", () => {
  it("агрегує витрати по днях і узгоджує total з сумою округлених daily", () => {
    const dateSet = new Set(["2024-06-01", "2024-06-02"]);
    const localDateKeyFn = (d: Date) => {
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const day = String(d.getUTCDate()).padStart(2, "0");
      return `${d.getUTCFullYear()}-${m}-${day}`;
    };
    const tsJun1 = Math.floor(Date.UTC(2024, 5, 1, 10, 0, 0) / 1000);
    const tsJun2 = Math.floor(Date.UTC(2024, 5, 2, 10, 0, 0) / 1000);
    const txs = [
      { id: "a", amount: -10045, time: tsJun1 },
      { id: "b", amount: -20055, time: tsJun2 },
      { id: "c", amount: -9999, time: tsJun2 },
      { id: "d", amount: 55555, time: tsJun1 }, // positive, ignored
    ];
    const res = calcFinykSpendingByDate(txs, {
      dateSet,
      localDateKeyFn,
    });
    expect(res).toHaveProperty("total");
    expect(res).toHaveProperty("daily");
    const sumDaily = Object.values(res.daily).reduce((s, v) => s + v, 0);
    expect(res.total).toBe(sumDaily);
  });
});

describe("getMonoTotals", () => {
  it("сумує балансі та борги по видимих рахунках", () => {
    const accounts = [
      {
        id: "a1",
        type: "white",
        balance: 100000,
        creditLimit: 0,
        currencyCode: CURRENCY.UAH,
      },
      {
        id: "a2",
        type: "black",
        balance: -50000,
        creditLimit: 0,
        currencyCode: CURRENCY.UAH,
      },
      {
        id: "a3",
        type: "black",
        balance: 200000,
        creditLimit: 500000,
        currencyCode: CURRENCY.UAH,
      },
    ];
    const res = getMonoTotals(accounts, []);
    expect(res).toHaveProperty("balance");
    expect(res).toHaveProperty("debt");
    expect(res.balance).toBe(1000);
    // a2 — дебетова картка у мінусі (-500 UAH), a3 — кредитка (-3000 UAH).
    expect(res.debt).toBe(3500);
  });
  it("пропускає приховані рахунки (і з balance, і з debt)", () => {
    const accounts = [
      {
        id: "a1",
        type: "white",
        balance: 100000,
        creditLimit: 0,
        currencyCode: CURRENCY.UAH,
      },
      {
        id: "a2",
        type: "white",
        balance: 200000,
        creditLimit: 0,
        currencyCode: CURRENCY.UAH,
      },
      {
        id: "a3",
        type: "black",
        balance: 0,
        creditLimit: 500000,
        currencyCode: CURRENCY.UAH,
      },
    ];
    const visible = getMonoTotals(accounts, []);
    const hiddenBalance = getMonoTotals(accounts, ["a2"]);
    expect(hiddenBalance.balance).toBeLessThan(visible.balance);
    // Regression: схована кредитка має випадати і з debt —
    // раніше `debt` рахувався по всіх рахунках, ігноруючи `hiddenAccountIds`.
    const hiddenDebt = getMonoTotals(accounts, ["a3"]);
    expect(hiddenDebt.debt).toBe(0);
    expect(visible.debt).toBe(5000);
  });
});
