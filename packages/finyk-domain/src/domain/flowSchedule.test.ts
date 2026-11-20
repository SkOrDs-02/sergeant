import { describe, expect, it } from "vitest";
import {
  buildFinykFlowSchedule,
  finykDueDedupKey,
  nextDayKey,
  selectFinykChargesDueOn,
  selectPlannedOutflows,
} from "./flowSchedule";

// 29 липня 2026, полудень за Києвом.
const NOW = Date.parse("2026-07-29T12:00:00+03:00");

const subscriptions = [
  { id: "s-tomorrow", name: "Netflix", billingDay: 30, expectedAmount: 19_900 },
  { id: "s-later", name: "Spotify", billingDay: 31, expectedAmount: 9_900 },
  { id: "s-unknown", name: "Хмара", billingDay: 29 },
];

const manualDebts = [
  {
    id: "d-today",
    name: "Кредит",
    amount: 0,
    totalAmount: 1_500,
    dueDate: "2026-07-29",
  },
  {
    id: "d-tomorrow",
    name: "",
    amount: 0,
    totalAmount: 250,
    dueDate: "2026-07-30",
  },
  {
    id: "d-overdue",
    name: "Сусід",
    amount: 0,
    totalAmount: 300,
    dueDate: "2026-07-20",
  },
  { id: "d-nodate", name: "Без строку", amount: 0, totalAmount: 800 },
];

const receivables = [
  { id: "r-tomorrow", name: "Олег", amount: 500, dueDate: "2026-07-30" },
];

describe("buildFinykFlowSchedule", () => {
  it("підписки, борги й «мені винні» з київським daysLeft і dueDayKey", () => {
    const s = buildFinykFlowSchedule({
      subscriptions,
      manualDebts,
      receivables,
      transactions: [],
      nowMs: NOW,
    });
    expect(
      s.subscriptionFlows.map((f) => [f.id, f.daysLeft, f.dueDayKey, f.amount]),
    ).toEqual([
      ["sub-s-tomorrow", 1, "2026-07-30", 199],
      ["sub-s-later", 2, "2026-07-31", 99],
      ["sub-s-unknown", 0, "2026-07-29", null],
    ]);
    expect(s.debtOutFlows.map((f) => [f.id, f.daysLeft, f.name])).toEqual([
      ["debt-d-today", 0, "Кредит"],
      ["debt-d-tomorrow", 1, null],
      ["debt-d-overdue", -9, "Сусід"],
    ]);
    expect(s.debtInFlows.map((f) => [f.id, f.sign])).toEqual([
      ["recv-r-tomorrow", "+"],
    ]);
  });
});

describe("цикл підписки, закритий раннім списанням", () => {
  it("списання за день до дати закриває цикл: наступна дата — через місяць", () => {
    const s = buildFinykFlowSchedule({
      subscriptions: [
        { id: "n", name: "Netflix", billingDay: 30, linkedTxId: "tx-n" },
      ],
      manualDebts: [],
      transactions: [
        {
          id: "tx-n",
          amount: -21_000,
          time: Math.floor(Date.parse("2026-07-29T08:00:00+03:00") / 1000),
        },
      ],
      nowMs: NOW,
    });
    expect(s.subscriptionFlows[0]).toMatchObject({
      dueDayKey: "2026-08-30",
      amount: 210,
    });
  });
});

describe("selectPlannedOutflows (П-4 (Б))", () => {
  it("підписки й погашення боргів без протермінованих і без «мені винні»", () => {
    const s = buildFinykFlowSchedule({
      subscriptions,
      manualDebts,
      receivables,
      transactions: [],
      nowMs: NOW,
    });
    expect(selectPlannedOutflows(s).map((f) => [f.id, f.kind])).toEqual([
      ["sub-s-tomorrow", "subscription"],
      ["sub-s-later", "subscription"],
      ["sub-s-unknown", "subscription"],
      ["debt-d-today", "debt"],
      ["debt-d-tomorrow", "debt"],
    ]);
  });
});

describe("selectFinykChargesDueOn: «завтра спишеться»", () => {
  it("лише списання, що припадають на названий день, сума в копійках", () => {
    const due = selectFinykChargesDueOn({
      subscriptions,
      manualDebts,
      receivables,
      transactions: [],
      nowMs: NOW,
      dueDayKey: nextDayKey("2026-07-29"),
    });
    expect(due).toEqual([
      {
        flowId: "debt-d-tomorrow",
        kind: "debt",
        name: null,
        amountMinor: 25_000,
        currency: "₴",
        dueDayKey: "2026-07-30",
      },
      {
        flowId: "sub-s-tomorrow",
        kind: "subscription",
        name: "Netflix",
        amountMinor: 19_900,
        currency: "₴",
        dueDayKey: "2026-07-30",
      },
    ]);
  });

  it("межа місяця: 31 липня «завтра» — це списання 1 серпня", () => {
    const lastDay = Date.parse("2026-07-31T09:00:00+03:00");
    const due = selectFinykChargesDueOn({
      subscriptions: [
        { id: "gym", name: "Gym", billingDay: 1, expectedAmount: 50_000 },
        { id: "end", name: "End", billingDay: 31, expectedAmount: 1_000 },
      ],
      manualDebts: [],
      transactions: [],
      nowMs: lastDay,
      dueDayKey: nextDayKey("2026-07-31"),
    });
    expect(due.map((c) => [c.flowId, c.dueDayKey])).toEqual([
      ["sub-gym", "2026-08-01"],
    ]);
  });

  it("порожньо, коли на день нічого не заплановано", () => {
    expect(
      selectFinykChargesDueOn({
        subscriptions: [],
        manualDebts: [],
        transactions: [],
        nowMs: NOW,
        dueDayKey: "2026-07-30",
      }),
    ).toEqual([]);
  });
});

describe("ключі", () => {
  it("nextDayKey перетинає межу місяця й року", () => {
    expect(nextDayKey("2026-07-31")).toBe("2026-08-01");
    expect(nextDayKey("2026-12-31")).toBe("2027-01-01");
    expect(nextDayKey("2028-02-28")).toBe("2028-02-29");
  });

  it("finykDueDedupKey: finyk_due_<flowId>_<day>", () => {
    expect(finykDueDedupKey("sub-s1", "2026-07-30")).toBe(
      "finyk_due_sub-s1_2026-07-30",
    );
  });
});
