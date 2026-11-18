import { describe, expect, it } from "vitest";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import {
  buildBankHistoryFacts,
  hasAnyBankHistoryFact,
  hasWeekdayFactHistory,
  shiftDayKeyMonths,
} from "./bankHistoryFacts";

// Полудень за Києвом: доба операції не залежить від поясу машини тесту.
function tx(
  id: string,
  amount: number,
  day: string,
  description = "Магазин",
  mcc = 5411,
): Transaction {
  const time = Math.floor(Date.parse(`${day}T10:00:00Z`) / 1000);
  return {
    id,
    amount,
    date: day,
    categoryId: "",
    type: amount < 0 ? "expense" : "income",
    source: "mono",
    time,
    description,
    mcc,
    accountId: "acc",
    manual: false,
    _source: "mono",
    _accountId: "acc",
    _manual: false,
  } as unknown as Transaction;
}

const NOW = Date.parse("2026-11-18T10:00:00Z");

describe("shiftDayKeyMonths / hasWeekdayFactHistory", () => {
  it("зсуває календарно і обрізає кінець місяця", () => {
    expect(shiftDayKeyMonths("2026-11-18", 3)).toBe("2026-08-18");
    expect(shiftDayKeyMonths("2026-05-31", 3)).toBe("2026-02-28");
  });

  it("три місяці рівно до дня: так; на день менше: ні", () => {
    expect(hasWeekdayFactHistory("2026-08-18", "2026-11-18")).toBe(true);
    expect(hasWeekdayFactHistory("2026-08-19", "2026-11-18")).toBe(false);
  });
});

describe("buildBankHistoryFacts", () => {
  it("порожня історія: жодного факту", () => {
    const facts = buildBankHistoryFacts([], { nowMs: NOW });
    expect(facts).toEqual({ topCategory: null, recurring: null, third: null });
    expect(hasAnyBankHistoryFact(facts)).toBe(false);
  });

  it("історія коротша за три місяці: третій факт — найбільша разова операція", () => {
    const facts = buildBankHistoryFacts(
      [
        tx("a", -12_000, "2026-10-20", "АТБ"),
        tx("b", -250_000, "2026-11-02", "Rozetka", 5732),
        tx("c", -30_000, "2026-11-10", "Сільпо"),
        tx("d", 1_000_000, "2026-11-01", "Зарплата", 0),
      ],
      { nowMs: NOW },
    );
    expect(facts.third).toEqual({
      kind: "largest",
      amountMinor: 250_000,
      description: "Rozetka",
      time: Math.floor(Date.parse("2026-11-02T10:00:00Z") / 1000),
    });
    expect(facts.topCategory?.spent).toBeGreaterThan(0);
    expect(hasAnyBankHistoryFact(facts)).toBe(true);
  });

  it("три місяці історії: третій факт — найдорожчий день тижня (середнє на такий день)", () => {
    const txs: Transaction[] = [tx("old", -100, "2026-08-10")];
    // Кожна субота (2026-08-15 …) по 1000 ₴, кожна середа по 100 ₴.
    for (let t = Date.parse("2026-08-15"); t <= NOW; t += 7 * 86_400_000) {
      const day = new Date(t).toISOString().slice(0, 10);
      txs.push(tx(`sat-${day}`, -100_000, day));
    }
    for (let t = Date.parse("2026-08-12"); t <= NOW; t += 7 * 86_400_000) {
      const day = new Date(t).toISOString().slice(0, 10);
      txs.push(tx(`wed-${day}`, -10_000, day));
    }
    const facts = buildBankHistoryFacts(txs, { nowMs: NOW });
    expect(facts.third?.kind).toBe("weekday");
    if (facts.third?.kind === "weekday") {
      expect(facts.third.mondayIndex).toBe(5); // субота
      expect(facts.third.avgMinor).toBe(100_000);
    }
  });

  it("регулярні платежі: кількість і найбільший за середньою сумою", () => {
    const facts = buildBankHistoryFacts(
      [
        tx("n1", -29_900, "2026-09-05", "Netflix", 4899),
        tx("n2", -29_900, "2026-10-05", "Netflix", 4899),
        tx("n3", -29_900, "2026-11-05", "Netflix", 4899),
        tx("r1", -1_200_000, "2026-09-01", "Оренда квартири", 6513),
        tx("r2", -1_200_000, "2026-10-01", "Оренда квартири", 6513),
        tx("r3", -1_200_000, "2026-11-01", "Оренда квартири", 6513),
      ],
      { nowMs: NOW },
    );
    expect(facts.recurring?.count).toBe(2);
    expect(facts.recurring?.biggestAmount).toBe(12_000);
  });
});
