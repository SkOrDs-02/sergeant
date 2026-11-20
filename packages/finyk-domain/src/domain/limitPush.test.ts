import { describe, expect, it } from "vitest";
import {
  calcFinykLimitProgress,
  finykLimitDedupKey,
  finykLimitPeriodKey,
  finykLimitPushVerdict,
  limitThresholdCrossed,
  reachedLimitThresholds,
} from "./limitPush";
import { manualExpenseToTransaction } from "./transactions";
import type { Budget } from "./types";

// 15 липня 2026, полудень за Києвом (середа).
const NOW = Date.parse("2026-07-15T12:00:00+03:00");

const expense = (id: string, date: string, amount: number, category: string) =>
  manualExpenseToTransaction({ id, date, amount, category });

const foodLimit: Budget = {
  id: "b-food",
  type: "limit",
  categoryId: "food",
  limit: 1_000,
  period: "month",
} as Budget;

describe("finykLimitPeriodKey: фінансовий період за Києвом", () => {
  it("місячний ліміт: YYYY-MM київського місяця", () => {
    // 31 липня 23:30 за Києвом це вже 20:30 UTC того ж дня, а 1 серпня 00:30
    // за Києвом ще 31 липня за UTC: ключ іде за Києвом.
    expect(
      finykLimitPeriodKey(
        { period: "month" },
        Date.parse("2026-07-31T23:30:00+03:00"),
      ),
    ).toBe("2026-07");
    expect(
      finykLimitPeriodKey(
        { period: "month" },
        Date.parse("2026-08-01T00:30:00+03:00"),
      ),
    ).toBe("2026-08");
  });

  it("legacy-ліміт без period читається як місячний", () => {
    expect(finykLimitPeriodKey({}, NOW)).toBe("2026-07");
  });

  it("тижневий ліміт: ISO-тиждень з понеділка, рік тижня, а не календаря", () => {
    // Неділя 12 липня 2026 — ще 28-й тиждень, понеділок 13-го — 29-й.
    expect(
      finykLimitPeriodKey(
        { period: "week" },
        Date.parse("2026-07-12T23:59:00+03:00"),
      ),
    ).toBe("2026-W28");
    expect(
      finykLimitPeriodKey(
        { period: "week" },
        Date.parse("2026-07-13T00:01:00+03:00"),
      ),
    ).toBe("2026-W29");
    // 1 січня 2027 (пʼятниця) належить 53-му тижню 2026 року.
    expect(
      finykLimitPeriodKey(
        { period: "week" },
        Date.parse("2027-01-01T12:00:00+02:00"),
      ),
    ).toBe("2026-W53");
    // 29 грудня 2025 (понеділок) — перший тиждень 2026 року.
    expect(
      finykLimitPeriodKey(
        { period: "week" },
        Date.parse("2025-12-29T12:00:00+02:00"),
      ),
    ).toBe("2026-W01");
  });

  it("разовий ліміт періоду не має: null", () => {
    expect(finykLimitPeriodKey({ period: "one_time" }, NOW)).toBeNull();
  });
});

describe("пороги 80 % і 100 %", () => {
  it("reachedLimitThresholds іде за єдиною шкалою LIMIT_THRESHOLDS", () => {
    expect(reachedLimitThresholds(79.99)).toEqual([]);
    expect(reachedLimitThresholds(80)).toEqual([80]);
    expect(reachedLimitThresholds(99.9)).toEqual([80]);
    expect(reachedLimitThresholds(100)).toEqual([80, 100]);
    expect(reachedLimitThresholds(222)).toEqual([80, 100]);
  });

  it("limitThresholdCrossed: найвищий поріг, перетнутий цією подією", () => {
    expect(limitThresholdCrossed(70, 79)).toBeNull();
    expect(limitThresholdCrossed(70, 80)).toBe(80);
    expect(limitThresholdCrossed(70, 105)).toBe(100);
    expect(limitThresholdCrossed(85, 100)).toBe(100);
    // Попередня сума вже вище порога: нового перетину немає.
    expect(limitThresholdCrossed(85, 95)).toBeNull();
    expect(limitThresholdCrossed(120, 130)).toBeNull();
  });
});

describe("calcFinykLimitProgress", () => {
  it("ліміт без витрат: 0 копійок, порогів немає", () => {
    const [p] = calcFinykLimitProgress({
      budgets: [foodLimit],
      transactions: [],
      nowMs: NOW,
    });
    expect(p).toMatchObject({
      budgetId: "b-food",
      period: "month",
      periodKey: "2026-07",
      spentMinor: 0,
      limitMinor: 100_000,
      reached: [],
    });
  });

  it("рахує лише витрати періоду і категорії ліміту, у копійках", () => {
    const [p] = calcFinykLimitProgress({
      budgets: [foodLimit],
      transactions: [
        expense("1", "2026-07-03", 500, "food"),
        expense("2", "2026-07-10", 350.5, "food"),
        // Інша категорія.
        expense("3", "2026-07-10", 900, "transport"),
        // Минулий місяць.
        expense("4", "2026-06-30", 900, "food"),
      ],
      nowMs: NOW,
    });
    expect(p!.spentMinor).toBe(85_050);
    expect(p!.reached).toEqual([80]);
  });

  it("прихована чи виключена зі статистики операція не рахується", () => {
    const tx = [
      expense("1", "2026-07-03", 500, "food"),
      expense("2", "2026-07-04", 600, "food"),
    ];
    const [p] = calcFinykLimitProgress({
      budgets: [foodLimit],
      transactions: tx,
      excludedTxIds: new Set(["manual_2"]),
      nowMs: NOW,
    });
    expect(p!.spentMinor).toBe(50_000);
    expect(p!.reached).toEqual([]);
  });

  it("спліт між двома категоріями: у ліміт іде лише своя частка", () => {
    const tx = [expense("1", "2026-07-03", 1_000, "food")];
    const [food, fun] = calcFinykLimitProgress({
      budgets: [
        foodLimit,
        {
          id: "b-fun",
          type: "limit",
          categoryId: "entertainment",
          limit: 300,
          period: "month",
        } as Budget,
      ],
      transactions: tx,
      txSplits: {
        manual_1: [
          { categoryId: "food", amount: 700 },
          { categoryId: "entertainment", amount: 300 },
        ],
      },
      nowMs: NOW,
    });
    expect(food!.spentMinor).toBe(70_000);
    expect(food!.reached).toEqual([]);
    expect(fun!.spentMinor).toBe(30_000);
    expect(fun!.reached).toEqual([80, 100]);
  });

  it("тижневий ліміт бере вікно з понеділка, а не місяць", () => {
    const [p] = calcFinykLimitProgress({
      budgets: [{ ...foodLimit, period: "week", limit: 500 } as Budget],
      transactions: [
        // Неділя попереднього тижня.
        expense("1", "2026-07-12", 400, "food"),
        // Понеділок цього тижня.
        expense("2", "2026-07-13", 450, "food"),
      ],
      nowMs: NOW,
    });
    expect(p).toMatchObject({
      period: "week",
      periodKey: "2026-W29",
      spentMinor: 45_000,
      reached: [80],
    });
  });

  it("разовий ліміт і ліміт без суми в push не йдуть", () => {
    expect(
      calcFinykLimitProgress({
        budgets: [
          { ...foodLimit, id: "once", period: "one_time" } as Budget,
          { ...foodLimit, id: "zero", limit: 0 } as Budget,
          { id: "g", type: "goal", name: "Ціль", targetAmount: 1 } as Budget,
        ],
        transactions: [expense("1", "2026-07-03", 5_000, "food")],
        nowMs: NOW,
      }),
    ).toEqual([]);
  });

  it("правило мерчанта перекидає банківську операцію в категорію ліміту", () => {
    const bank = {
      id: "bank-1",
      time: Math.floor(Date.parse("2026-07-05T10:00:00+03:00") / 1000),
      amount: -90_000,
      mcc: 5812,
      description: "Сільпо Кафе",
    };
    const [p] = calcFinykLimitProgress({
      budgets: [foodLimit],
      transactions: [bank as never],
      txCategories: { "bank-1": "food" },
      nowMs: NOW,
    });
    expect(p!.spentMinor).toBe(90_000);
  });
});

describe("finykLimitPushVerdict і ключі дедупу", () => {
  const progress = (pct: number) => ({
    budgetId: "b-food",
    periodKey: "2026-07",
    reached: reachedLimitThresholds(pct),
  });

  it("ключ: finyk_limit_<id>_<period>_<80|100>", () => {
    expect(finykLimitDedupKey("b-food", "2026-07", 80)).toBe(
      "finyk_limit_b-food_2026-07_80",
    );
    expect(finykLimitDedupKey("b1", "2026-W29", 100)).toBe(
      "finyk_limit_b1_2026-W29_100",
    );
  });

  it("поріг 80 % перетинається рівно один раз за період", () => {
    const first = finykLimitPushVerdict(progress(85), new Set());
    expect(first).toEqual({
      notify: 80,
      claimKeys: ["finyk_limit_b-food_2026-07_80"],
    });
    const again = finykLimitPushVerdict(progress(90), new Set(first.claimKeys));
    expect(again).toEqual({ notify: null, claimKeys: [] });
  });

  it("поріг 100 % після 80 % у тому самому періоді — окремий push", () => {
    const verdict = finykLimitPushVerdict(
      progress(104),
      new Set(["finyk_limit_b-food_2026-07_80"]),
    );
    expect(verdict).toEqual({
      notify: 100,
      claimKeys: ["finyk_limit_b-food_2026-07_100"],
    });
  });

  it("стрибок одразу через обидва пороги: один push про 100 %, займаються обидва ключі", () => {
    expect(finykLimitPushVerdict(progress(105), new Set())).toEqual({
      notify: 100,
      claimKeys: [
        "finyk_limit_b-food_2026-07_80",
        "finyk_limit_b-food_2026-07_100",
      ],
    });
  });

  it("новий місяць — нові ключі: 80 % знову можна надіслати", () => {
    const verdict = finykLimitPushVerdict(
      { ...progress(85), periodKey: "2026-08" },
      new Set(["finyk_limit_b-food_2026-07_80"]),
    );
    expect(verdict.notify).toBe(80);
  });

  it("нижче 80 % — нічого", () => {
    expect(finykLimitPushVerdict(progress(79), new Set())).toEqual({
      notify: null,
      claimKeys: [],
    });
  });
});
