// Сигнали про темп витрат (рішення власника 2026-10-01, «Одна правда про
// витрати»): одна картка про темп (f2), «Відкрити» веде в «Звіт тижня» (f3),
// текст денної картки (f4) і список попереджень, який читає хаб для «Закрито
// сьогодні» (f5). Однакові відрізки тижня (f1) — у `spendingVelocity.test.ts`.
//
// Правила читають `ctx.now`, а не системний годинник, тож дата в тестах
// задається в контексті. Денна картка дивиться на ЛОКАЛЬНИЙ час
// (`getHours() >= 14`), тому її тести будують `now` локальним конструктором і
// покладаються на UTC-середовище (CI runner і dev-VM усі в UTC).
import { describe, it, expect } from "vitest";
import {
  dailyVsWeeklyPaceRule,
  evaluateDailyPace,
} from "./dailyVsWeeklyPace.js";
import { spendingVelocityRule } from "./spendingVelocity.js";
import {
  DAILY_PACE_REC_ID,
  SPENDING_PACE_WARNING_REC_IDS,
  WEEK_REPORT_ACTION,
  WEEKLY_PACE_HIGH_REC_ID,
  WEEKLY_PACE_LOW_REC_ID,
} from "./paceSignals.js";
import type { FinanceContext, Transaction } from "../financeContext.js";

const WED_NOON = new Date("2025-06-18T12:00:00Z");

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

function spending(id: string, uah: number, time: number): Transaction {
  return { id, amount: -Math.round(uah * 100), time };
}

const spendingAt = (id: string, uah: number, iso: string): Transaction =>
  spending(id, uah, new Date(iso).getTime());

describe("f2: одна картка про темп за раз", () => {
  // Середа 2025-06-18. Ранок (до 14:00) денна картка ще мовчить, вечір – може.
  const MORNING = new Date(2025, 5, 18, 10, 0, 0);
  const EVENING = new Date(2025, 5, 18, 16, 0, 0);
  const at = (day: number, hour = 16) => new Date(2025, 5, day, hour).getTime();

  // Попередні 7 днів (11–17 червня) по 200 ₴ (середня 200) + сьогодні 500 ₴:
  // денна картка «+150%». Тиждень пн–ср 16–18 = 200 + 200 + 500 = 900.
  const calmPrev7: Transaction[] = [11, 12, 13, 14, 15, 16, 17].map((day) =>
    spending(`d${day}`, 200, at(day)),
  );
  const today = spending("today", 500, at(18));

  it("денна картка спрацювала, тижнева (вище) мовчить", () => {
    // Минулий пн–ср (9–11 червня) = 300 + 100 + 200 = 600 → тиждень 900/600
    // = +50%: сама по собі тижнева картка була б «вище».
    const txs = [
      ...calmPrev7,
      today,
      spending("prev-mon", 300, at(9)),
      spending("prev-tue", 100, at(10)),
    ];
    const evening = ctx({ now: EVENING, transactions: txs });
    expect(evaluateDailyPace(evening)).not.toBeNull();
    expect(dailyVsWeeklyPaceRule.evaluate(evening)).toHaveLength(1);
    expect(spendingVelocityRule.evaluate(evening)).toEqual([]);

    // Контроль: ті самі дані до 14:00 – денної картки немає, і тижнева є.
    const morning = ctx({ now: MORNING, transactions: txs });
    expect(evaluateDailyPace(morning)).toBeNull();
    expect(spendingVelocityRule.evaluate(morning)[0]?.id).toBe(
      WEEKLY_PACE_HIGH_REC_ID,
    );
  });

  it("денна картка спрацювала, тижнева (нижче, «Чудовий темп») теж мовчить", () => {
    // Минулий пн–ср = 1400 + 0 + 200 = 1600 → тиждень 900/1600 ≈ −44%:
    // сама по собі тижнева картка була б «нижче».
    const txs = [...calmPrev7, today, spending("prev-mon", 1400, at(9))];
    const evening = ctx({ now: EVENING, transactions: txs });
    expect(evaluateDailyPace(evening)).not.toBeNull();
    expect(spendingVelocityRule.evaluate(evening)).toEqual([]);

    const morning = ctx({ now: MORNING, transactions: txs });
    expect(spendingVelocityRule.evaluate(morning)[0]?.id).toBe(
      WEEKLY_PACE_LOW_REC_ID,
    );
  });

  it("без денної картки тижнева працює як зазвичай", () => {
    const c = ctx({
      now: EVENING,
      transactions: [
        spending("this-mon", 1500, at(16)),
        spending("prev-mon", 1000, at(9)),
      ],
    });
    expect(evaluateDailyPace(c)).toBeNull();
    expect(spendingVelocityRule.evaluate(c)[0]?.id).toBe(
      WEEKLY_PACE_HIGH_REC_ID,
    );
  });
});

describe("f3: «Відкрити» з тижневої картки веде в «Звіт тижня»", () => {
  it("обидві гілки (вище й нижче) несуть дію звіту тижня, а не модуль", () => {
    const high = spendingVelocityRule.evaluate(
      ctx({
        transactions: [
          spendingAt("this", 1500, "2025-06-17T10:00:00Z"),
          spendingAt("prev", 1000, "2025-06-10T10:00:00Z"),
        ],
      }),
    )[0];
    const low = spendingVelocityRule.evaluate(
      ctx({
        transactions: [
          spendingAt("this", 500, "2025-06-17T10:00:00Z"),
          spendingAt("prev", 1000, "2025-06-10T10:00:00Z"),
        ],
      }),
    )[0];
    expect(high?.id).toBe(WEEKLY_PACE_HIGH_REC_ID);
    expect(low?.id).toBe(WEEKLY_PACE_LOW_REC_ID);
    expect(high?.action).toBe(WEEK_REPORT_ACTION);
    expect(low?.action).toBe(WEEK_REPORT_ACTION);
  });

  it("денна картка лишається імперативною: ведe в «Додати витрату»", () => {
    const NOW = new Date(2025, 5, 18, 16, 0, 0);
    const rec = dailyVsWeeklyPaceRule.evaluate(
      ctx({
        now: NOW,
        transactions: [
          ...[1, 2, 3, 4, 5, 6, 7].map((n) =>
            spending(`d${n}`, 200, NOW.getTime() - n * 86_400_000),
          ),
          spending("today", 500, NOW.getTime()),
        ],
      }),
    )[0];
    expect(rec?.pwaAction).toBe("add_expense");
    expect(rec?.action).not.toBe(WEEK_REPORT_ACTION);
  });
});

describe("f4: текст денної картки", () => {
  it("просить додати готівку, а не «зафіксувати поточні витрати»", () => {
    const NOW = new Date(2025, 5, 18, 16, 0, 0);
    const rec = dailyVsWeeklyPaceRule.evaluate(
      ctx({
        now: NOW,
        transactions: [
          ...[1, 2, 3, 4, 5, 6, 7].map((n) =>
            spending(`d${n}`, 200, NOW.getTime() - n * 86_400_000),
          ),
          spending("today", 500, NOW.getTime()),
        ],
      }),
    )[0];
    expect(rec?.title).toBe("Сьогодні 500 ₴, на 150% вище середнього");
    expect(rec?.body).toBe(
      "7-денна середня: 200 ₴/день. Якщо платив готівкою, додай, поки памʼятаєш.",
    );
    expect(rec?.body).not.toContain("Зафіксуй");
  });
});

describe("f5: які id читає хаб як попередження про темп", () => {
  it("попередження — денна і тижнева «вище»; похвала «нижче» не входить", () => {
    expect(SPENDING_PACE_WARNING_REC_IDS).toEqual([
      DAILY_PACE_REC_ID,
      WEEKLY_PACE_HIGH_REC_ID,
    ]);
    expect(SPENDING_PACE_WARNING_REC_IDS).not.toContain(WEEKLY_PACE_LOW_REC_ID);
  });

  it("id збігаються з тим, що правила реально віддають", () => {
    const NOW = new Date(2025, 5, 18, 16, 0, 0);
    const daily = dailyVsWeeklyPaceRule.evaluate(
      ctx({
        now: NOW,
        transactions: [
          ...[1, 2, 3, 4, 5, 6, 7].map((n) =>
            spending(`d${n}`, 200, NOW.getTime() - n * 86_400_000),
          ),
          spending("today", 500, NOW.getTime()),
        ],
      }),
    )[0];
    expect(daily?.id).toBe(DAILY_PACE_REC_ID);
    expect(daily?.id).toBe("finyk_daily_vs_weekly_pace");
    expect(WEEKLY_PACE_HIGH_REC_ID).toBe("spending_velocity_high");
    expect(WEEKLY_PACE_LOW_REC_ID).toBe("spending_velocity_low");
  });
});
