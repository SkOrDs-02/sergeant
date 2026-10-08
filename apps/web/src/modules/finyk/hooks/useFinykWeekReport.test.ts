// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";

const state = vi.hoisted(() => ({
  statTransactions: [] as unknown[],
  budgets: [] as unknown[],
}));

vi.mock("./useFinykStatTransactions", () => ({
  useFinykStatTransactions: () => ({
    statTransactions: state.statTransactions,
    slots: {
      budgets: state.budgets,
      txCategories: {},
      txSplits: {},
      customCategories: [],
    },
  }),
}));

import { useFinykWeekReport } from "./useFinykWeekReport";

function tx(id: string, amount: number, daysAgo: number, mcc = 5411) {
  const time = Math.floor(Date.now() / 1000) - daysAgo * 86_400;
  return {
    id,
    amount,
    time,
    description: "tx",
    mcc,
    categoryId: "",
  } as unknown as Transaction;
}

describe("useFinykWeekReport", () => {
  beforeEach(() => {
    // Четвер 2026-06-18 15:00 за Києвом: календарний тиждень пн 15 – чт 18
    // проти пн 8 – чт 11. Середина місяця й тижня навмисно: ліміт рахується
    // за поточний київський місяць, тож 1–2 числа «вчорашня» витрата падала в
    // попередній місяць і тест червонів на `main` двічі на місяць; а на
    // початку тижня (пн–вт) вікно «пн–ср» мало б лише кілька днів.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-18T12:00:00+03:00"));
    state.statTransactions = [];
    state.budgets = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("каже одним рядком, що на цьому тижні витрат ще немає", () => {
    // Витрата минулого тижня (чт 11) – поза календарним тижнем пн–чт.
    state.statTransactions = [tx("old", -10_000, 7)];
    const { result } = renderHook(() => useFinykWeekReport());
    expect(result.current).toEqual(["На цьому тижні витрат ще немає"]);
  });

  it("мовчить зовсім, коли Фінік вимкнено", () => {
    state.statTransactions = [tx("old", -10_000, 20)];
    const { result } = renderHook(() => useFinykWeekReport(false));
    expect(result.current).toEqual([]);
  });

  it("дає рядки підсумку, найбільшої категорії, зростання і ліміту", () => {
    state.statTransactions = [
      tx("f1", -80_000, 1, 5411),
      tx("c1", -30_000, 2, 5814),
      tx("c0", -10_000, 9, 5814),
    ];
    state.budgets = [
      { id: "b", type: "limit", categoryId: "food", limit: 500 },
    ];
    const { result } = renderHook(() => useFinykWeekReport());
    const [total, top, growth, limit] = result.current;
    // Тиждень пн–чт 1100 ₴ проти 100 ₴ за пн–чт минулого: попередня сума
    // менша за 10 % поточної – відсотка немає (Р4), тож суми гривнями.
    expect(total).toMatch(
      /^За тиждень витрачено 1.100.₴, за ті самі дні минулого тижня 100.₴$/,
    );
    expect(top).toMatch(/^Найбільше за тиждень: Продукти, 800/);
    expect(growth).toMatch(/^Виросло проти минулого тижня: Кафе.*\+200/);
    expect(limit).toMatch(/^Продукти: /);
  });

  it("підсумок називає відсоток, коли попередній відрізок є базою", () => {
    state.statTransactions = [
      tx("now", -150_000, 1, 5411),
      tx("then", -100_000, 8, 5411),
    ];
    const { result } = renderHook(() => useFinykWeekReport());
    expect(result.current[0]).toMatch(
      /^За тиждень витрачено 1.500.₴, на 50.%.більше, ніж за ті самі дні минулого тижня \(1.000.₴\)$/,
    );
  });

  it("підсумок каже «менше», коли витрат поменшало", () => {
    state.statTransactions = [
      tx("now", -50_000, 1, 5411),
      tx("then", -100_000, 8, 5411),
    ];
    const { result } = renderHook(() => useFinykWeekReport());
    expect(result.current[0]).toMatch(/на 50.%.менше, ніж за ті самі дні/);
  });

  it("підсумок чесно каже, коли минулого тижня за ті дні витрат не було", () => {
    state.statTransactions = [tx("now", -50_000, 1, 5411)];
    const { result } = renderHook(() => useFinykWeekReport());
    expect(result.current[0]).toMatch(
      /^За тиждень витрачено 500.₴, за ті самі дні минулого тижня витрат не було$/,
    );
  });

  it("у понеділок рахує один день проти одного, а не неповний тиждень проти повного", () => {
    vi.setSystemTime(new Date("2026-06-15T12:00:00+03:00"));
    state.statTransactions = [
      tx("mon", -20_000, 0, 5411),
      // Минулий пн 8 – той самий відрізок; вт 9 – поза ним.
      tx("prev-mon", -10_000, 7, 5411),
      tx("prev-tue", -50_000, 6, 5411),
    ];
    const { result } = renderHook(() => useFinykWeekReport());
    expect(result.current[0]).toMatch(
      /^За тиждень витрачено 200.₴, на 100.%.більше, ніж за ті самі дні минулого тижня \(100.₴\)$/,
    );
  });
});
