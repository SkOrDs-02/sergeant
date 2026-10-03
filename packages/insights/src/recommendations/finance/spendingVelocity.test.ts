// Per-rule тести для `spendingVelocityRule` — тренд витрат «цей календарний
// тиждень (пн–нд за Києвом)» vs «той самий відрізок минулого». Покривають усі
// гілки: dow guard, prevSpend floor, ratio thresholds, hidden/transfer
// фільтрацію, агрегування manualExpenses, а також однакові відрізки тижня
// (рішення власника 2026-10-01, f1). Одна картка про темп, «Звіт тижня» і
// текст денної картки — у `paceSignals.test.ts`.
//
// Часові зони: правило читає `ctx.now`, а день тижня й межі бере за Києвом
// (`weekSliceWindows`). Тести задають `now` у UTC-полудень, де київська й
// локальна дати збігаються.
import { describe, it, expect } from "vitest";
import { formatNumberUk } from "@sergeant/shared";
import { buildWeekReport } from "@sergeant/finyk-domain/domain/weekReport";
import { spendingVelocityRule } from "./spendingVelocity.js";
import { WEEK_REPORT_ACTION } from "./paceSignals.js";
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
    limitUsage: [],
    canonicalMonthSpend: new Map(),
    canonicalTotalCount: new Map(),
    ...overrides,
  };
}

function spending(id: string, amountUah: number, time: number): Transaction {
  // amount у копійках, відʼємне = витрата (узгоджено з Mono webhook payload).
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
    // f3: «Відкрити» веде в «Звіт тижня» на хабі, а не в огляд Фініка.
    expect(rec?.action).toBe(WEEK_REPORT_ACTION);
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

describe("spendingVelocityRule — однакові відрізки календарного тижня (f1)", () => {
  const spendingAt = (id: string, uah: number, iso: string): Transaction =>
    spending(id, uah, new Date(iso).getTime());

  it("у середу порівнює пн–ср з пн–ср минулого тижня, а не з повним тижнем", () => {
    const c = ctx({
      // Ср 2025-06-18: цей тиждень пн 16 – ср 18, минулий пн 9 – ср 11.
      transactions: [
        spendingAt("this", 1500, "2025-06-17T10:00:00Z"),
        spendingAt("prev", 1000, "2025-06-10T10:00:00Z"),
        // Четвер–неділя минулого тижня — поза відрізком: повний тиждень
        // (6000) дав би ratio < 1, і картка промовчала б.
        spendingAt("prev-thu", 2500, "2025-06-12T10:00:00Z"),
        spendingAt("prev-sun", 2500, "2025-06-15T10:00:00Z"),
      ],
    });
    const rec = spendingVelocityRule.evaluate(c)[0];
    expect(rec?.id).toBe("spending_velocity_high");
    expect(rec?.title).toContain("50%");
  });

  it("день тижня й межі рахуються за Києвом, а не за годинником пристрою", () => {
    // Вівторок 22:30 UTC = середа 01:30 за Києвом (UTC+3 влітку): у Києві це
    // вже середа, тож відрізок «пн–ср», і картка активна. За годинником
    // пристрою в UTC це ще вівторок, і правило мовчало.
    // Витрата цього тижня стоїть на понеділку, а не на «сьогодні» пристрою:
    // інакше спрацювала б денна картка, і тижнева мовчала б (f2).
    const c = ctx({
      now: new Date("2025-06-17T22:30:00Z"),
      transactions: [
        spendingAt("this", 1500, "2025-06-16T10:00:00Z"),
        spendingAt("prev", 1000, "2025-06-10T10:00:00Z"),
      ],
    });
    expect(spendingVelocityRule.evaluate(c)[0]?.id).toBe(
      "spending_velocity_high",
    );
  });

  it("тиждень через перехід на зимовий час: межі доби лишаються київськими", () => {
    // Київ переходить на зимовий час 2025-10-26 о 04:00 (+3 → +2): неділя має
    // 25 годин. Середа 2025-10-29 — тиждень пн 27 – ср 29 проти пн 20 – ср 22.
    const c = ctx({
      now: new Date("2025-10-29T12:00:00Z"),
      transactions: [
        // Перша мить тижня за Києвом: 2025-10-27T00:00+02:00.
        spendingAt("this-edge", 1500, "2025-10-26T22:00:00Z"),
        // Перша мить минулого тижня: 2025-10-20T00:00+03:00.
        spendingAt("prev-edge", 1000, "2025-10-19T21:00:00Z"),
        // Четвер 23 — вже поза відрізком «пн–ср» минулого тижня.
        spendingAt("prev-after", 9000, "2025-10-22T21:00:00Z"),
      ],
    });
    const rec = spendingVelocityRule.evaluate(c)[0];
    expect(rec?.id).toBe("spending_velocity_high");
    expect(rec?.title).toContain("50%");
  });

  it("числа картки збігаються з «Тиждень у цифрах» на тих самих даних", () => {
    const txs: Transaction[] = [
      spendingAt("this", 1500, "2025-06-17T10:00:00Z"),
      spendingAt("prev", 1000, "2025-06-10T10:00:00Z"),
      spendingAt("prev-thu", 2500, "2025-06-12T10:00:00Z"),
    ];
    const rec = spendingVelocityRule.evaluate(ctx({ transactions: txs }))[0];
    const report = buildWeekReport(txs as never, { now: WED_NOON });
    expect(report.total).toMatchObject({
      spentMinor: 150_000,
      prevMinor: 100_000,
    });
    expect(Math.round(report.total?.delta.pct ?? 0)).toBe(50);
    expect(rec?.title).toContain("50%");
    expect(rec?.body).toBe(
      `За такий же проміжок: ${formatNumberUk(1500)} ₴ vs ${formatNumberUk(1000)} ₴`,
    );
  });
});
