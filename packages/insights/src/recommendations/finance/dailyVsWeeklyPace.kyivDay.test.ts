// Межа доби денної картки «Сьогодні вище середнього» за Києвом на пристрої в
// іншому поясі (рішення власника 2026-10-01: гроші за Києвом; ADR-0078,
// `AGENTS.md § Domain invariants`). До цього картка різала «сьогодні», «минулі
// 7 днів» і поріг «після 14:00» за годинником телефона, тож поза Києвом біля
// опівночі вона розходилась з Аналітикою Фініка й тижневою карткою.
//
// Пояс пристрою тут перемикається прямо в тесті: Node перечитує
// `process.env.TZ` на льоту, а правило дат при імпорті не створює (так само
// зроблено в `finyk-domain/domain/overview.kyivBoundary.test.ts`). Моменти
// задані явним UTC, тож Київ завжди UTC+3 (літо 2025).
import { afterEach, describe, expect, it } from "vitest";
import {
  evaluateDailyPace,
  type DailyPaceSignal,
} from "./dailyVsWeeklyPace.js";
import type {
  FinanceContext,
  ManualExpense,
  Transaction,
} from "../financeContext.js";

const ORIGINAL_TZ = process.env["TZ"];

afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env["TZ"];
  else process.env["TZ"] = ORIGINAL_TZ;
});

/** Київ — еталон; решта — пристрої на різних боках від нього. */
const DEVICE_TZS = [
  "Europe/Kyiv",
  "UTC",
  "America/New_York", // позаду Києва на 7 год
  "Asia/Tokyo", // попереду на 6 год
] as const;

function ctx(
  now: string,
  transactions: Transaction[],
  manualExpenses: ManualExpense[] = [],
): FinanceContext {
  return {
    now: new Date(now),
    monthStart: new Date("2025-06-01T00:00:00Z"),
    transactions,
    manualExpenses,
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
  };
}

const tx = (id: string, uah: number, iso: string): Transaction => ({
  id,
  amount: -Math.round(uah * 100),
  time: Date.parse(iso),
});

/** 11–17 червня 2025, по 200 ₴ опівдні за Києвом: «минулі 7 днів» = 1400 ₴. */
const PREV_WEEK: Transaction[] = [11, 12, 13, 14, 15, 16, 17].map((day) =>
  tx(`p${day}`, 200, `2025-06-${day}T09:00:00Z`),
);

/** Оцінює сигнал на пристрої з поясом `tz`. */
function evaluateOn(tz: string, context: FinanceContext) {
  process.env["TZ"] = tz;
  return evaluateDailyPace(context);
}

/** Один сценарій — однакова відповідь на КОЖНОМУ поясі пристрою. */
function expectSameOnEveryDevice(
  context: FinanceContext,
  expected: DailyPaceSignal | null,
) {
  for (const tz of DEVICE_TZS) {
    expect(evaluateOn(tz, context), `пояс пристрою: ${tz}`).toEqual(expected);
  }
}

const SIGNAL_500: DailyPaceSignal = {
  todaySpend: 500,
  avgDaily: 200,
  pctMore: 150,
};

describe("evaluateDailyPace: година-поріг київська", () => {
  it("о 14:30 за Києвом картка є, хоч на пристрої в Нью-Йорку ще 07:30", () => {
    // 11:30Z = 14:30 Київ = 07:30 Нью-Йорк = 20:30 Токіо.
    const c = ctx("2025-06-18T11:30:00Z", [
      ...PREV_WEEK,
      tx("today", 500, "2025-06-18T10:00:00Z"),
    ]);
    expectSameOnEveryDevice(c, SIGNAL_500);
  });

  it("о 12:30 за Києвом картки немає, хоч на пристрої в Токіо вже 18:30", () => {
    // 09:30Z = 12:30 Київ = 18:30 Токіо = 05:30 Нью-Йорк.
    const c = ctx("2025-06-18T09:30:00Z", [
      ...PREV_WEEK,
      tx("today", 500, "2025-06-18T08:00:00Z"),
    ]);
    expectSameOnEveryDevice(c, null);
  });
});

describe("evaluateDailyPace: початок доби київський", () => {
  it("покупка о 21:00 за Києвом учора не стає сьогоднішньою на пристрої в Токіо", () => {
    // Токіо: 17.06 18:00Z = 18.06 03:00, тобто «сьогодні» на пристрої. Київ:
    // вівторок 21:00, тобто вчора — і вона йде в «минулі 7 днів».
    const c = ctx("2025-06-18T12:00:00Z", [
      ...PREV_WEEK,
      tx("late-yesterday", 500, "2025-06-17T18:00:00Z"),
    ]);
    expectSameOnEveryDevice(c, null);
  });

  it("покупка о 00:30 за Києвом — уже сьогодні, хоч на пристрої в Нью-Йорку ще вчора", () => {
    // 17.06 21:30Z = 18.06 00:30 Київ, але 17.06 17:30 Нью-Йорк.
    const c = ctx("2025-06-18T18:00:00Z", [
      ...PREV_WEEK,
      tx("after-midnight", 500, "2025-06-17T21:30:00Z"),
    ]);
    expectSameOnEveryDevice(c, SIGNAL_500);
  });

  it("«минулі 7 днів» — київські доби: покупка о 00:30 тиждень тому лишається в темпі", () => {
    // Київська доба 11.06 починається 10.06 21:00Z. Покупка 10.06 21:30Z
    // (Київ 11.06 00:30; Нью-Йорк 10.06 17:30) входить у 7 днів, і вона ж
    // тримає суму над порогом 700 ₴ там, де без неї було б 600.
    const c = ctx("2025-06-18T18:00:00Z", [
      tx("p12", 200, "2025-06-12T09:00:00Z"),
      tx("p13", 200, "2025-06-13T09:00:00Z"),
      tx("p14", 200, "2025-06-14T09:00:00Z"),
      tx("edge", 100, "2025-06-10T21:30:00Z"),
      tx("today", 500, "2025-06-18T12:00:00Z"),
    ]);
    // prev7 = 600 + 100 = 700 → середня 100, сьогодні 500 → +400%.
    expectSameOnEveryDevice(c, {
      todaySpend: 500,
      avgDaily: 100,
      pctMore: 400,
    });
  });
});

describe("evaluateDailyPace: «сьогодні» — це [початок, кінець) київської доби", () => {
  it("банківський запис, датований наперед, сьогоднішнім не є", () => {
    const c = ctx("2025-06-18T18:00:00Z", [
      ...PREV_WEEK,
      tx("future", 500, "2025-06-19T09:00:00Z"),
    ]);
    expectSameOnEveryDevice(c, null);
  });

  it("ручна витрата, датована наперед, сьогоднішньою не є, а вчорашня — є вчорашньою", () => {
    const c = ctx("2025-06-18T18:00:00Z", PREV_WEEK, [
      // Завтра за Києвом: не сьогодні й не серед минулих 7 днів.
      { id: "me-future", amount: 500, date: "2025-06-19T09:00:00.000Z" },
      // Вчора за Києвом: у «минулі 7 днів», тож середня росте.
      { id: "me-yesterday", amount: 100, date: "2025-06-17T10:00:00.000Z" },
    ]);
    // today = 0 → картки немає, хоч «майбутні» 500 ₴ і лежать у даних.
    expectSameOnEveryDevice(c, null);
  });

  it("ручна витрата опівдні за UTC лягає в свою київську добу на будь-якому поясі", () => {
    // Дата без часу зберігається як 12:00Z (`manualExpenseForm`) = 15:00
    // Київ тієї ж дати — тож тримається своєї доби і в Нью-Йорку, і в Токіо.
    const c = ctx("2025-06-18T18:00:00Z", PREV_WEEK, [
      { id: "me-today", amount: 500, date: "2025-06-18T12:00:00.000Z" },
    ]);
    expectSameOnEveryDevice(c, SIGNAL_500);
  });
});

describe("evaluateDailyPace: канонічний excluded-set (logic-08)", () => {
  it("ручна витрата з «Не враховувати» (manual_<id>) сьогоднішньою не є", () => {
    const base = ctx("2025-06-18T18:00:00Z", PREV_WEEK, [
      { id: "me-today", amount: 500, date: "2025-06-18T12:00:00.000Z" },
    ]);
    expectSameOnEveryDevice(base, SIGNAL_500);
    expectSameOnEveryDevice(
      { ...base, excludedTxIds: new Set(["manual_me-today"]) },
      null,
    );
  });

  it("виключена банківська витрата сьогодні не будить картку", () => {
    const base = ctx("2025-06-18T18:00:00Z", [
      ...PREV_WEEK,
      tx("big", 500, "2025-06-18T09:00:00Z"),
    ]);
    expectSameOnEveryDevice({ ...base, excludedTxIds: new Set(["big"]) }, null);
  });
});
