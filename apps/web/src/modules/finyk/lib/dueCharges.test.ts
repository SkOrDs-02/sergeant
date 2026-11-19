import { describe, expect, it } from "vitest";
import { DUE_CHARGES_WINDOW_DAYS, selectDueCharges } from "./dueCharges";
import { getFinykDayPlan } from "./dayPlan";
import { getFlowSchedule, selectPlannedOutflows } from "./flowSchedule";

// 29 липня 2026, полудень за Києвом: «завтра» = 30-те, «післязавтра» = 31-ше.
const NOW = Date.parse("2026-07-29T12:00:00+03:00");

type Input = Parameters<typeof selectDueCharges>[0];

const subscriptions = [
  // Завтра, сума з очікуваної (копійки).
  { id: "s-tomorrow", name: "Netflix", billingDay: 30, expectedAmount: 19_900 },
  // Післязавтра: поза вікном «сьогодні й завтра».
  { id: "s-later", name: "Spotify", billingDay: 31, expectedAmount: 9_900 },
  // Сьогодні, суми не знаємо.
  { id: "s-unknown", name: "Хмара", billingDay: 29 },
] as unknown as Input["subscriptions"];

const manualDebts = [
  { id: "d-today", name: "Кредит", totalAmount: 1_500, dueDate: "2026-07-29" },
  // Протермінований: денна норма його не віднімає, рядок теж мовчить.
  { id: "d-overdue", name: "Сусід", totalAmount: 300, dueDate: "2026-07-20" },
  { id: "d-nodate", name: "Без строку", totalAmount: 800 },
] as unknown as Input["manualDebts"];

const receivables = [
  // «Мені винні» — надходження, а не списання.
  { id: "r-today", name: "Борг Олега", amount: 500, dueDate: "2026-07-29" },
] as unknown as Input["receivables"];

describe("selectDueCharges (OD-26 Ф-4 (а), П-4 (Б))", () => {
  it("вікно рядка: сьогодні й завтра (дефолт § 11.8)", () => {
    expect(DUE_CHARGES_WINDOW_DAYS).toBe(2);
  });

  it("бере підписки й погашення боргів на сьогодні й завтра, сума в копійках", () => {
    const due = selectDueCharges({
      subscriptions,
      manualDebts,
      receivables,
      transactions: [],
      nowMs: NOW,
    });

    expect(due.map((c) => c.id)).toEqual([
      "debt-d-today",
      "sub-s-unknown",
      "sub-s-tomorrow",
    ]);
    expect(due[0]).toMatchObject({
      kind: "debt",
      title: "Кредит",
      amountMinor: 150_000,
      currency: "₴",
      daysLeft: 0,
    });
    expect(due[1]).toMatchObject({
      kind: "subscription",
      amountMinor: null,
      daysLeft: 0,
    });
    expect(due[2]).toMatchObject({
      kind: "subscription",
      title: "Netflix",
      amountMinor: 19_900,
      daysLeft: 1,
    });
  });

  it("порожній стан: нічого запланованого — порожній список", () => {
    expect(
      selectDueCharges({
        subscriptions: [],
        manualDebts: [],
        receivables,
        transactions: [],
        nowMs: NOW,
      }),
    ).toEqual([]);
  });

  it("списання 1-го числа завтра лишається «завтра», хоча до норми місяця не входить", () => {
    const lastDay = Date.parse("2026-07-31T12:00:00+03:00");
    const due = selectDueCharges({
      subscriptions: [
        { id: "s1", name: "Gym", billingDay: 1, expectedAmount: 50_000 },
      ] as unknown as Input["subscriptions"],
      manualDebts: [],
      receivables: [],
      transactions: [],
      nowMs: lastDay,
    });
    expect(due).toHaveLength(1);
    expect(due[0]!.daysLeft).toBe(1);
  });
});

describe("одне джерело правди з «Можна сьогодні»", () => {
  it("денна норма віднімає рівно заплановані списання місяця з selectPlannedOutflows", () => {
    const flows = getFlowSchedule({
      subscriptions,
      manualDebts,
      receivables: [],
      transactions: [],
      kyivYear: 2026,
      kyivMonth: 6,
      kyivDay: 29,
    });
    const monthEnd = new Date(2026, 7, 0);
    const outMinor = selectPlannedOutflows(flows)
      .filter((f) => f.dueDate <= monthEnd)
      .reduce(
        (s, f) =>
          s + (typeof f.amount === "number" ? Math.round(f.amount * 100) : 0),
        0,
      );
    // Netflix 199 + Spotify 99 + Кредит 1500 (протермінований і без строку ні).
    expect(outMinor).toBe(179_800);

    const { dayPlan } = getFinykDayPlan({
      transactions: [],
      subscriptions,
      manualDebts,
      receivables: [],
      planExpense: 10_000,
      nowMs: NOW,
    });
    // 29 липня: лишається 3 дні включно з сьогодні.
    expect(dayPlan).toBeCloseTo((1_000_000 - outMinor) / 3 / 100, 6);
  });
});
