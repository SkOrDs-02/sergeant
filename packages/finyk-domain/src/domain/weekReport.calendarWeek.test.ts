// «Тиждень у цифрах» — календарний тиждень пн–нд за Києвом і однакові відрізки
// (рішення власника 2026-10-01, f1). До цього звіт брав ковзні 7 днів проти
// попередніх 7, тож у середу рахував не ті дні, що картка «Витрати на N% вище
// ніж минулого тижня».
import { describe, expect, it } from "vitest";
import { buildWeekReport } from "./weekReport";
import type { Transaction } from "./types";

function tx(id: string, amount: number, iso: string, mcc = 5411): Transaction {
  const date = new Date(iso);
  return {
    id,
    amount,
    date: iso.slice(0, 10),
    categoryId: "",
    type: amount < 0 ? "expense" : "income",
    source: "manual",
    time: Math.floor(date.getTime() / 1000),
    description: "tx",
    mcc,
    accountId: null,
    manual: true,
    _source: "manual",
    _accountId: null,
    _manual: true,
  };
}

// Середа 2026-09-16 15:00 за Києвом: пн 14 – ср 16 проти пн 7 – ср 9.
const WEDNESDAY = new Date("2026-09-16T12:00:00Z");

describe("buildWeekReport: календарний тиждень, однакові відрізки", () => {
  const txs = [
    // Цей тиждень до середи.
    tx("f1", -50_000, "2026-09-14T09:00:00Z", 5411),
    tx("c1", -30_000, "2026-09-16T09:00:00Z", 5814),
    // Минулий тиждень, ті самі дні: пн 7 і вт 8.
    tx("f0", -40_000, "2026-09-07T09:00:00Z", 5411),
    tx("c0", -10_000, "2026-09-08T09:00:00Z", 5814),
    // Четвер 10 минулого тижня: ковзні 7 днів («10–16 вересня») брали його в
    // ЦЕЙ тиждень, а календарний відрізок «пн–ср» не бачить зовсім.
    tx("thu", -99_999, "2026-09-10T09:00:00Z", 5411),
    // Неділя 13 — кінець минулого тижня, поза відрізком пн–ср.
    tx("sun", -77_777, "2026-09-13T09:00:00Z", 5411),
  ];

  it("підсумок тижня стоїть проти того самого відрізка минулого, а не проти повного", () => {
    const report = buildWeekReport(txs, { now: WEDNESDAY });
    expect(report.total).toMatchObject({
      spentMinor: 80_000,
      prevMinor: 50_000,
    });
    expect(report.total?.delta.pct).toBeCloseTo(60);
  });

  it("найбільша категорія й зростання рахуються по календарному тижню", () => {
    const report = buildWeekReport(txs, { now: WEDNESDAY });
    // Ковзне вікно 10–16 вересня додало б сюди четвер і неділю минулого
    // тижня, а календарний тиждень бачить лише пн 14.
    expect(report.top).toMatchObject({
      categoryId: "food",
      spentMinor: 50_000,
    });
    expect(report.growth).toMatchObject({
      categoryId: "restaurant",
      spentMinor: 30_000,
      prevMinor: 10_000,
    });
  });

  it("понеділок: один день проти одного, а не неповний тиждень проти повного", () => {
    const monday = new Date("2026-09-14T09:00:00Z");
    const report = buildWeekReport(
      [
        tx("now", -20_000, "2026-09-14T06:00:00Z"),
        tx("prev-mon", -10_000, "2026-09-07T06:00:00Z"),
        tx("prev-tue", -50_000, "2026-09-08T06:00:00Z"),
      ],
      { now: monday },
    );
    expect(report.total).toMatchObject({
      spentMinor: 20_000,
      prevMinor: 10_000,
    });
  });

  it("межа тижня київська: 00:30 понеділка за Києвом уже новий тиждень", () => {
    // 2026-09-13T21:30Z = 2026-09-14 00:30 Kyiv. За UTC це ще неділя минулого
    // тижня; київський понеділок бачить цей запис своїм.
    const report = buildWeekReport(
      [
        tx("late", -12_300, "2026-09-13T21:30:00Z"),
        tx("sun-day", -45_600, "2026-09-13T12:00:00Z"),
      ],
      { now: new Date("2026-09-14T12:00:00Z") },
    );
    expect(report.total?.spentMinor).toBe(12_300);
  });

  it("лише надходження: підсумку витрат немає, а запис тижня є", () => {
    const report = buildWeekReport(
      [tx("salary", 500_000, "2026-09-15T09:00:00Z")],
      { now: WEDNESDAY },
    );
    expect(report.hasRecords).toBe(true);
    expect(report.total).toBeNull();
  });

  it("минулого тижня за той самий відрізок витрат не було: відсотка немає", () => {
    const report = buildWeekReport(
      [tx("now", -30_000, "2026-09-15T09:00:00Z")],
      { now: WEDNESDAY },
    );
    expect(report.total).toMatchObject({ spentMinor: 30_000, prevMinor: 0 });
    expect(report.total?.delta.pct).toBeNull();
  });
});
