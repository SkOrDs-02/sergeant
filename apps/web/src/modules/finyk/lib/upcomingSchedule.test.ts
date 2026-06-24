import { describe, it, expect, vi, afterEach } from "vitest";
import {
  parseLocalDate,
  getNextBillingDate,
  formatRelativeDue,
  formatShortDate,
  startOfToday,
  computeFinykSchedule,
} from "./upcomingSchedule";
import { CURRENCY } from "@sergeant/finyk-domain/constants";

describe("parseLocalDate", () => {
  it("парсить ISO-дату без часового поясу", () => {
    const d = parseLocalDate("2025-03-15");
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(2); // 0-indexed
    expect(d.getDate()).toBe(15);
  });

  it("повертає fallback для null/undefined/порожнього рядка", () => {
    expect(parseLocalDate(null).getFullYear()).toBeGreaterThan(0);
    expect(parseLocalDate(undefined).getFullYear()).toBeGreaterThan(0);
    expect(parseLocalDate("").getFullYear()).toBeGreaterThan(0);
  });
});

describe("getNextBillingDate", () => {
  it("повертає дату в поточному місяці, якщо ще не настала", () => {
    const now = new Date(2025, 5, 10); // June 10
    const d = getNextBillingDate(20, now);
    expect(d.getMonth()).toBe(5); // June
    expect(d.getDate()).toBe(20);
  });

  it("переходить на наступний місяць, якщо день вже пройшов", () => {
    const now = new Date(2025, 5, 25); // June 25
    const d = getNextBillingDate(10, now);
    expect(d.getMonth()).toBe(6); // July
    expect(d.getDate()).toBe(10);
  });

  it("обрізає billingDay до останнього дня місяця (лютий)", () => {
    const now = new Date(2025, 1, 1); // Feb 1
    const d = getNextBillingDate(31, now);
    expect(d.getMonth()).toBe(1);
    expect(d.getDate()).toBe(28);
  });
});

describe("formatRelativeDue", () => {
  const today = new Date(2025, 5, 15); // June 15

  it("'сьогодні' якщо та сама дата", () => {
    expect(formatRelativeDue(new Date(2025, 5, 15), today)).toBe("сьогодні");
  });

  it("'завтра' якщо наступний день", () => {
    expect(formatRelativeDue(new Date(2025, 5, 16), today)).toBe("завтра");
  });

  it("'через N дн' якщо до 7 днів", () => {
    expect(formatRelativeDue(new Date(2025, 5, 18), today)).toBe("через 3 дн");
  });

  it("коротка дата якщо більше тижня", () => {
    const result = formatRelativeDue(new Date(2025, 5, 30), today);
    expect(result).toContain("30");
  });
});

describe("computeFinykSchedule — paid current cycle", () => {
  // Фіксуємо `todayStart` на 26 квітня (день списання).
  const todayStart = new Date(2026, 3, 26);

  function makeSub(linkedTxId = "tx-today") {
    return {
      id: "sub-gpt",
      name: "ChatGPT Plus",
      billingDay: 26,
      linkedTxId,
      currency: "UAH",
    };
  }

  it("переносить `nextCharge` на наступний місяць, якщо привʼязана транзакція припадає на сьогодні", () => {
    const tx = {
      id: "tx-today",
      amount: -101694,
      time: new Date(2026, 3, 26, 12, 37).getTime(),
      currencyCode: CURRENCY.UAH,
    };
    const { nextCharge } = computeFinykSchedule({
      subscriptions: [makeSub()],
      manualDebts: [],
      receivables: [],
      transactions: [tx],
      todayStart,
    });
    expect(nextCharge).not.toBeNull();
    expect(nextCharge?.dueDate.getMonth()).toBe(4); // травень
    expect(nextCharge?.dueDate.getDate()).toBe(26);
  });

  it("не переносить, якщо остання транзакція з минулого циклу", () => {
    const tx = {
      id: "tx-prev",
      amount: -101694,
      time: new Date(2026, 2, 26, 12, 0).getTime(), // 26 березня
      currencyCode: CURRENCY.UAH,
    };
    const { nextCharge } = computeFinykSchedule({
      subscriptions: [makeSub("tx-prev")],
      manualDebts: [],
      receivables: [],
      transactions: [tx],
      todayStart,
    });
    expect(nextCharge?.dueDate.getMonth()).toBe(3); // квітень (сьогодні)
    expect(nextCharge?.dueDate.getDate()).toBe(26);
  });
});

describe("formatShortDate", () => {
  it("formats a date as a short uk-UA day + month", () => {
    const label = formatShortDate(new Date(2026, 5, 30));
    expect(label).toContain("30");
  });
});

describe("computeFinykSchedule — aggregation branches", () => {
  const todayStart = new Date(2026, 5, 1); // 2026-06-01

  it("sums only UAH subscriptions into subsMonthly and skips non-UAH", () => {
    // Amount + currency are derived from the matched transaction
    // (`getSubscriptionAmountMeta`), so each sub needs a keyword-matching tx.
    const uahSub = {
      id: "s-uah",
      name: "Spotify",
      billingDay: 10,
      keyword: "spotify",
      currency: "UAH",
    };
    const usdSub = {
      id: "s-usd",
      name: "GitHub",
      billingDay: 12,
      keyword: "github",
      currency: "USD",
    };
    const uahTx = {
      id: "tx-uah",
      amount: -19900, // 199 ₴
      time: new Date(2026, 4, 10, 12, 0).getTime(),
      description: "spotify premium",
      currencyCode: CURRENCY.UAH,
    };
    const usdTx = {
      id: "tx-usd",
      amount: -400,
      time: new Date(2026, 4, 12, 12, 0).getTime(),
      description: "github copilot",
      currencyCode: CURRENCY.USD,
    };
    const { subsMonthly, subsCount, nextCharge } = computeFinykSchedule({
      subscriptions: [uahSub, usdSub],
      manualDebts: [],
      receivables: [],
      transactions: [uahTx, usdTx],
      todayStart,
    });
    // Only the UAH subscription contributes to the monthly total.
    expect(subsMonthly).toBe(199);
    // subsCount counts every subscription, currency-agnostic.
    expect(subsCount).toBe(2);
    // The only upcoming UAH charge becomes nextCharge (USD is excluded).
    expect(nextCharge?.label).toBe("Spotify");
    expect(nextCharge?.sign).toBe("-");
  });

  it("includes manual debts and receivables with dueDate + remaining in nextCharge", () => {
    const debt = {
      id: "d-1",
      name: "Кредит",
      totalAmount: 5000,
      dueDate: "2026-06-05",
    };
    const recv = {
      id: "r-1",
      name: "Повернення",
      amount: 1000,
      dueDate: "2026-06-03",
    };
    const { nextCharge, urgentLiability } = computeFinykSchedule({
      subscriptions: [],
      manualDebts: [debt],
      receivables: [recv],
      transactions: [],
      todayStart,
    });
    // The receivable is due earliest (06-03) → it is the next charge.
    expect(nextCharge?.label).toBe("Повернення");
    expect(nextCharge?.sign).toBe("+");
    // Urgent liability is the largest debt with a dueDate.
    expect(urgentLiability?.name).toBe("Кредит");
    expect(urgentLiability?.remaining).toBe(5000);
  });

  it("picks the largest debt as urgentLiability, not the soonest", () => {
    const small = {
      id: "d-small",
      name: "Дрібний",
      totalAmount: 100,
      dueDate: "2026-06-02",
    };
    const big = {
      id: "d-big",
      name: "Великий",
      totalAmount: 9000,
      dueDate: "2026-06-20",
    };
    const { urgentLiability } = computeFinykSchedule({
      subscriptions: [],
      manualDebts: [small, big],
      receivables: [],
      transactions: [],
      todayStart,
    });
    expect(urgentLiability?.name).toBe("Великий");
    expect(urgentLiability?.remaining).toBe(9000);
  });

  it("skips debts without a dueDate or with nothing remaining", () => {
    const noDue = { id: "d-no-due", name: "Без дати", totalAmount: 500 };
    const settled = {
      id: "d-settled",
      name: "Закрито",
      totalAmount: 0,
      dueDate: "2026-06-05",
    };
    const { urgentLiability, nextCharge } = computeFinykSchedule({
      subscriptions: [],
      manualDebts: [noDue, settled],
      receivables: [],
      transactions: [],
      todayStart,
    });
    expect(urgentLiability).toBeNull();
    expect(nextCharge).toBeNull();
  });

  it("returns null nextCharge / urgentLiability for empty input", () => {
    const result = computeFinykSchedule({
      subscriptions: [],
      manualDebts: [],
      receivables: [],
      transactions: [],
      todayStart,
    });
    expect(result.subsMonthly).toBe(0);
    expect(result.subsCount).toBe(0);
    expect(result.nextCharge).toBeNull();
    expect(result.urgentLiability).toBeNull();
  });
});

describe("startOfToday", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("повертає опівночі поточного дня", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 5, 15, 14, 30, 0));
    const d = startOfToday();
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getDate()).toBe(15);
  });
});
