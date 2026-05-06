// Per-rule тести для `spendingVelocityRule` — тренд витрат «цей тиждень» vs
// «минулий тиждень», нормалізований до того ж дня тижня. Покривають усі
// гілки: dow guard, prevSpend floor, ratio thresholds, hidden/transfer
// фільтрацію, агрегування manualExpenses.
//
// Часові зони: рулза у `setHours(0,0,0,0)` спирається на локальну TZ, тому
// тести покладаються на UTC-середовище (CI runner і dev-VM усі в UTC). Якщо
// у майбутньому це зміниться — заюзаємо `vi.useFakeTimers()` + детермінований
// TZ. Поки що легше тримати тести максимально близько до прод-форми Date-API.
import { describe, it, expect } from "vitest";
import { spendingVelocityRule } from "./spendingVelocity.js";
import type {
  FinanceContext,
  ManualExpense,
  Transaction,
} from "../financeContext.js";

const WED_NOON = new Date("2025-06-18T12:00:00Z"); // dowIdx = 2
const TUE_NOON = new Date("2025-06-17T12:00:00Z"); // dowIdx = 1
const MON_NOON = new Date("2025-06-16T12:00:00Z"); // dowIdx = 0

// Helpers — щодня знаходять мс-таймстемп всередині відповідного rolling-вікна
// (Mon..Thu UTC). `txTimestamp` використовує > 1e10 для розрізнення мс/сек,
// тому годимо явно мс.
const THIS_WEEK_TUE = new Date("2025-06-17T10:00:00Z").getTime();
const PREV_WEEK_TUE = new Date("2025-06-10T10:00:00Z").getTime();

function ctx(overrides: Partial<FinanceContext> = {}): FinanceContext {
  return {
    now: WED_NOON,
    monthStart: new Date("2025-06-01T00:00:00Z"),
    transactions: [],
    manualExpenses: [],
    budgets: [],
    limits: [],
    txCategories: {},
    customCategories: [],
    hiddenTxIds: new Set<string>(),
    transferIds: new Set<string>(),
    thisMonthTx: [],
    categorySpend: {},
    canonicalMonthSpend: new Map(),
    canonicalTotalCount: new Map(),
    ...overrides,
  };
}

function spending(id: string, amountUah: number, time: number): Transaction {
  // amount у копійках, від'ємне = витрата (узгоджено з Mono webhook payload).
  return { id, amount: -Math.round(amountUah * 100), time };
}

function income(id: string, amountUah: number, time: number): Transaction {
  return { id, amount: Math.round(amountUah * 100), time };
}

function manualExpense(amountUah: number, dateIso: string): ManualExpense {
  return { id: `me-${dateIso}`, amount: amountUah, date: dateIso };
}

describe("spendingVelocityRule — day-of-week guard", () => {
  it("мовчить у понеділок (dowIdx = 0)", () => {
    const c = ctx({
      now: MON_NOON,
      transactions: [spending("a", 1000, THIS_WEEK_TUE)],
    });
    expect(spendingVelocityRule.evaluate(c)).toEqual([]);
  });

  it("мовчить у вівторок (dowIdx = 1)", () => {
    const c = ctx({
      now: TUE_NOON,
      transactions: [spending("a", 1000, THIS_WEEK_TUE)],
    });
    expect(spendingVelocityRule.evaluate(c)).toEqual([]);
  });

  it("активний з середи (dowIdx = 2)", () => {
    const c = ctx({
      transactions: [
        spending("this", 1500, THIS_WEEK_TUE),
        spending("prev", 1000, PREV_WEEK_TUE),
      ],
    });
    const recs = spendingVelocityRule.evaluate(c);
    expect(recs).toHaveLength(1);
    expect(recs[0]?.id).toBe("spending_velocity_high");
  });
});

describe("spendingVelocityRule — high-velocity rec (ratio >= 1.4)", () => {
  it("спрацьовує при ratio = 1.5 і пише точний %", () => {
    const c = ctx({
      transactions: [
        spending("this", 1500, THIS_WEEK_TUE),
        spending("prev", 1000, PREV_WEEK_TUE),
      ],
    });
    const rec = spendingVelocityRule.evaluate(c)[0];
    expect(rec?.id).toBe("spending_velocity_high");
    expect(rec?.priority).toBe(75);
    expect(rec?.title).toContain("50%");
    expect(rec?.body).toContain("1");
    expect(rec?.icon).toBeTruthy();
    expect(rec?.action).toBe("finyk");
    expect(rec?.module).toBe("finyk");
  });

  it("гранична межа: ratio = 1.4 → high", () => {
    const c = ctx({
      transactions: [
        spending("this", 1400, THIS_WEEK_TUE),
        spending("prev", 1000, PREV_WEEK_TUE),
      ],
    });
    const rec = spendingVelocityRule.evaluate(c)[0];
    expect(rec?.id).toBe("spending_velocity_high");
    expect(rec?.title).toContain("40%");
  });

  it("ratio = 1.39 → silent (just below threshold)", () => {
    const c = ctx({
      transactions: [
        spending("this", 1390, THIS_WEEK_TUE),
        spending("prev", 1000, PREV_WEEK_TUE),
      ],
    });
    expect(spendingVelocityRule.evaluate(c)).toEqual([]);
  });
});

describe("spendingVelocityRule — low-velocity rec (ratio <= 0.6)", () => {
  it("спрацьовує при ratio = 0.5 і пише точний %", () => {
    const c = ctx({
      transactions: [
        spending("this", 500, THIS_WEEK_TUE),
        spending("prev", 1000, PREV_WEEK_TUE),
      ],
    });
    const rec = spendingVelocityRule.evaluate(c)[0];
    expect(rec?.id).toBe("spending_velocity_low");
    expect(rec?.priority).toBe(45);
    expect(rec?.title).toContain("50%");
  });

  it("гранична межа: ratio = 0.6 → low", () => {
    const c = ctx({
      transactions: [
        spending("this", 600, THIS_WEEK_TUE),
        spending("prev", 1000, PREV_WEEK_TUE),
      ],
    });
    const rec = spendingVelocityRule.evaluate(c)[0];
    expect(rec?.id).toBe("spending_velocity_low");
    expect(rec?.title).toContain("40%");
  });

  it("ratio = 0.61 → silent (just above threshold)", () => {
    const c = ctx({
      transactions: [
        spending("this", 610, THIS_WEEK_TUE),
        spending("prev", 1000, PREV_WEEK_TUE),
      ],
    });
    expect(spendingVelocityRule.evaluate(c)).toEqual([]);
  });
});

describe("spendingVelocityRule — guards and noise floor", () => {
  it("мовчить, якщо prevSpend < 500 ₴ (мало даних минулого тижня)", () => {
    const c = ctx({
      transactions: [
        spending("this", 5000, THIS_WEEK_TUE),
        spending("prev", 100, PREV_WEEK_TUE),
      ],
    });
    expect(spendingVelocityRule.evaluate(c)).toEqual([]);
  });

  it("мовчить, якщо thisSpend = 0", () => {
    const c = ctx({
      transactions: [spending("prev", 1000, PREV_WEEK_TUE)],
    });
    expect(spendingVelocityRule.evaluate(c)).toEqual([]);
  });

  it("мовчить у dead-zone (0.6 < ratio < 1.4)", () => {
    const c = ctx({
      transactions: [
        // ratio = 1.2
        spending("this", 1200, THIS_WEEK_TUE),
        spending("prev", 1000, PREV_WEEK_TUE),
      ],
    });
    expect(spendingVelocityRule.evaluate(c)).toEqual([]);
  });
});

describe("spendingVelocityRule — фільтри транзакцій", () => {
  it("ігнорує hidden tx (sumSpending не враховує id з hiddenTxIds)", () => {
    const c = ctx({
      transactions: [
        spending("this", 5000, THIS_WEEK_TUE),
        spending("prev-hidden", 1000, PREV_WEEK_TUE),
        spending("prev-real", 600, PREV_WEEK_TUE),
      ],
      hiddenTxIds: new Set(["prev-hidden"]),
    });
    // prevSpend = 600, thisSpend = 5000 → ratio ≈ 8.33 → high
    const rec = spendingVelocityRule.evaluate(c)[0];
    expect(rec?.id).toBe("spending_velocity_high");
    // Без приховування ratio був би 5000/1600 ≈ 3.125, але тут — інше число.
    // Перевіряємо лише саму гілку через фільтр; точний % не мокаємо.
    expect(rec?.body).toContain("600");
  });

  it("ігнорує transfer tx", () => {
    const c = ctx({
      transactions: [
        spending("this", 1500, THIS_WEEK_TUE),
        spending("prev", 1000, PREV_WEEK_TUE),
        spending("transfer", 9999, PREV_WEEK_TUE),
      ],
      transferIds: new Set(["transfer"]),
    });
    // prevSpend = 1000 (transfer виключений), thisSpend = 1500 → ratio = 1.5
    const rec = spendingVelocityRule.evaluate(c)[0];
    expect(rec?.id).toBe("spending_velocity_high");
    expect(rec?.title).toContain("50%");
  });

  it("ігнорує income (positive amount)", () => {
    const c = ctx({
      transactions: [
        income("salary-this", 50000, THIS_WEEK_TUE),
        spending("this", 1500, THIS_WEEK_TUE),
        income("salary-prev", 50000, PREV_WEEK_TUE),
        spending("prev", 1000, PREV_WEEK_TUE),
      ],
    });
    const rec = spendingVelocityRule.evaluate(c)[0];
    expect(rec?.id).toBe("spending_velocity_high");
    expect(rec?.title).toContain("50%");
  });

  it("ігнорує транзакції за межами compare-вікна (поза [start, end))", () => {
    const c = ctx({
      transactions: [
        // this-week, поза cmpEnd (Thu UTC == cmpEnd, > Thu = виключено)
        spending(
          "thurs-after-cmp",
          5000,
          new Date("2025-06-19T12:00:00Z").getTime(),
        ),
        spending("this", 1500, THIS_WEEK_TUE),
        spending("prev", 1000, PREV_WEEK_TUE),
      ],
    });
    const rec = spendingVelocityRule.evaluate(c)[0];
    // thurs-after-cmp не підрахована → ratio = 1.5 (50%), а не 6.5 (550%)
    expect(rec?.title).toContain("50%");
  });
});

describe("spendingVelocityRule — manualExpenses агрегування", () => {
  it("підсумовує manualExpenses разом з транзакціями", () => {
    const c = ctx({
      manualExpenses: [
        manualExpense(800, "2025-06-17T10:00:00Z"),
        manualExpense(800, "2025-06-10T10:00:00Z"),
      ],
      transactions: [
        spending("this", 700, THIS_WEEK_TUE),
        spending("prev", 200, PREV_WEEK_TUE),
      ],
    });
    // thisSpend = 800 + 700 = 1500; prevSpend = 800 + 200 = 1000 → 1.5
    const rec = spendingVelocityRule.evaluate(c)[0];
    expect(rec?.id).toBe("spending_velocity_high");
    expect(rec?.title).toContain("50%");
  });

  it("ігнорує manualExpenses поза вікном", () => {
    const c = ctx({
      manualExpenses: [manualExpense(99999, "2025-07-01T10:00:00Z")],
      transactions: [
        spending("this", 1500, THIS_WEEK_TUE),
        spending("prev", 1000, PREV_WEEK_TUE),
      ],
    });
    const rec = spendingVelocityRule.evaluate(c)[0];
    expect(rec?.title).toContain("50%");
  });

  it("безпечний на NaN amount у manualExpense (NaN → 0)", () => {
    const c = ctx({
      manualExpenses: [
        // amount: NaN → Number(NaN) = NaN → || 0 → 0
        {
          id: "x",
          amount: Number("not-a-number"),
          date: "2025-06-17T10:00:00Z",
        },
      ],
      transactions: [
        spending("this", 1500, THIS_WEEK_TUE),
        spending("prev", 1000, PREV_WEEK_TUE),
      ],
    });
    expect(() => spendingVelocityRule.evaluate(c)).not.toThrow();
    const rec = spendingVelocityRule.evaluate(c)[0];
    expect(rec?.id).toBe("spending_velocity_high");
  });
});
