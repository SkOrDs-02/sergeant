import { describe, expect, it } from "vitest";

import {
  aggregateMonthFlows,
  buildDebtOutFlows,
  buildPlannedFlows,
  buildReceivableInFlows,
  buildSubscriptionFlows,
  computePulseStyle,
  deriveFirstName,
  formatDaysLeft,
  getNextBillingDate,
  OVERVIEW_FLOW_COLOR,
  parseLocalDate,
  type PlannedFlow,
} from "./overview.js";

/**
 * Pinned "now" used across time-sensitive tests — 15-May-2025 Kyiv time so
 * that a `billingDay=20` subscription lands inside the same month and
 * `billingDay=10` gets pushed to next month.
 */
const NOW = new Date(2025, 4, 15); // months are 0-based

describe("parseLocalDate", () => {
  it("parses 'YYYY-MM-DD' as local midnight (timezone-stable)", () => {
    const d = parseLocalDate("2025-05-20");
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(4);
    expect(d.getDate()).toBe(20);
  });

  it("falls back to 1-Jan year 0 on missing/empty input", () => {
    const d = parseLocalDate("");
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(1);
  });
});

describe("formatDaysLeft", () => {
  it("returns Ukrainian copy for today / tomorrow / longer", () => {
    expect(formatDaysLeft(0)).toBe("сьогодні");
    expect(formatDaysLeft(1)).toBe("завтра");
    expect(formatDaysLeft(7)).toBe("через 7 дн");
  });
});

describe("getNextBillingDate", () => {
  it("keeps the same month if billing day is still ahead", () => {
    const d = getNextBillingDate(20, NOW);
    expect(d.getMonth()).toBe(4);
    expect(d.getDate()).toBe(20);
  });

  it("rolls to next month when billing day already passed", () => {
    const d = getNextBillingDate(10, NOW);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(10);
  });

  it("clamps day=31 to the last day of a short month (Feb)", () => {
    const feb = new Date(2025, 1, 1); // 1 Feb 2025
    const d = getNextBillingDate(31, feb);
    expect(d.getMonth()).toBe(1);
    expect(d.getDate()).toBe(28);
  });
});

describe("buildSubscriptionFlows", () => {
  it("projects subscription billing to a PlannedFlow row", () => {
    const flows = buildSubscriptionFlows(
      [
        {
          id: "s1",
          name: "Netflix",
          emoji: "🎬",
          billingDay: 20,
          keyword: "",
        },
      ],
      [],
      NOW,
    );
    expect(flows).toHaveLength(1);
    expect(flows[0]).toMatchObject({
      id: "sub-s1",
      sign: "-",
      color: OVERVIEW_FLOW_COLOR.danger,
      currency: "₴",
      amount: null,
    });
    expect(flows[0]!.daysLeft).toBe(5);
    expect(flows[0]!.hint).toBe("через 5 дн");
  });
});

describe("buildDebtOutFlows / buildReceivableInFlows", () => {
  it("skips debts without dueDate", () => {
    const flows = buildDebtOutFlows(
      [{ id: "d1", amount: 500, totalAmount: 500, dueDate: null }],
      [],
      NOW,
    );
    expect(flows).toHaveLength(0);
  });

  it("maps receivables with a positive remaining balance", () => {
    const flows = buildReceivableInFlows(
      [
        {
          id: "r1",
          name: "Борис",
          emoji: "💰",
          amount: 1000,
          dueDate: "2025-05-22",
        },
      ],
      [],
      NOW,
    );
    expect(flows).toHaveLength(1);
    expect(flows[0]!.sign).toBe("+");
    expect(flows[0]!.color).toBe(OVERVIEW_FLOW_COLOR.success);
    expect(flows[0]!.daysLeft).toBe(7);
  });
});

describe("buildPlannedFlows", () => {
  const sample = (over: Partial<PlannedFlow>): PlannedFlow => ({
    id: "x",
    title: "x",
    amount: 100,
    sign: "-",
    color: OVERVIEW_FLOW_COLOR.danger,
    daysLeft: 1,
    hint: "завтра",
    currency: "₴",
    dueDate: new Date(2025, 4, 16),
    ...over,
  });

  it("filters to 0..10 window and sorts by daysLeft", () => {
    const merged = buildPlannedFlows([
      [sample({ id: "a", daysLeft: 11 })],
      [sample({ id: "b", daysLeft: 3 })],
      [sample({ id: "c", daysLeft: 0 })],
      [sample({ id: "d", daysLeft: -1 })],
    ]);
    expect(merged.map((f) => f.id)).toEqual(["c", "b"]);
  });
});

describe("aggregateMonthFlows", () => {
  const sample = (over: Partial<PlannedFlow>): PlannedFlow => ({
    id: "x",
    title: "x",
    amount: 100,
    sign: "-",
    color: OVERVIEW_FLOW_COLOR.danger,
    daysLeft: 2,
    hint: "",
    currency: "₴",
    dueDate: new Date(2025, 4, 17),
    ...over,
  });

  it("nets outgoing vs incoming flows within the calendar month", () => {
    const res = aggregateMonthFlows(
      [
        sample({ id: "a", sign: "-", amount: 300 }),
        sample({ id: "b", sign: "-", amount: null }),
        sample({ id: "c", sign: "+", amount: 200 }),
        sample({
          id: "d",
          sign: "-",
          amount: 50,
          dueDate: new Date(2025, 5, 2),
        }),
      ],
      NOW,
    );
    expect(res.recurringOutThisMonth).toBe(300);
    expect(res.recurringInThisMonth).toBe(200);
    expect(res.unknownOutCount).toBe(1);
    expect(res.monthFlows.map((f) => f.id)).toEqual(["a", "b", "c"]);
  });
});

describe("computePulseStyle", () => {
  it("returns danger classes when spending is >75% of plan", () => {
    const s = computePulseStyle({
      hasExpensePlan: true,
      spendPlanRatio: 0.8,
      dayBudget: 0,
    });
    expect(s.color).toBe("text-danger");
    expect(s.statusText).toBe("Понад 75% запланованого");
  });

  it("falls back to dayBudget-only classification without a plan", () => {
    const good = computePulseStyle({
      hasExpensePlan: false,
      spendPlanRatio: 0,
      dayBudget: 500,
    });
    expect(good.statusText).toBe("В нормі");

    const bad = computePulseStyle({
      hasExpensePlan: false,
      spendPlanRatio: 0,
      dayBudget: -50,
    });
    expect(bad.statusText).toBe("Перевитрата");
  });
});

describe("deriveFirstName", () => {
  it("prefers the second token (Ukrainian 'Surname Name' order)", () => {
    expect(deriveFirstName("Коваленко Іван")).toBe("Іван");
  });

  it("returns the only token when there's just one", () => {
    expect(deriveFirstName("Іван")).toBe("Іван");
  });

  it("uses fallback when clientName is null/empty", () => {
    expect(deriveFirstName(null)).toBe("друже");
    expect(deriveFirstName("", "юзер")).toBe("юзер");
  });
});
