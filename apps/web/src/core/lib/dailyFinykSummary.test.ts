// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  computeDailyFinykSummary,
  isDailySummaryDismissedToday,
  DAILY_SUMMARY_DISMISS_KEY,
} from "./dailyFinykSummary";

function setLS(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
function clearAll() {
  localStorage.clear();
}

function ts(date) {
  return Math.floor(date.getTime() / 1000);
}

function makeNow() {
  // Фіксуємо момент часу "сьогодні 20:00" — достатньо для reminder_no_expenses
  const n = new Date();
  n.setHours(20, 0, 0, 0);
  return n;
}

describe("computeDailyFinykSummary", () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it("повертає `hidden` якщо немає жодної історії витрат", () => {
    const r = computeDailyFinykSummary({ now: makeNow() });
    expect(r.status).toBe("hidden");
  });

  it("рахує сьогоднішні витрати з банківських транзакцій", () => {
    const now = makeNow();
    const todayTs = ts(now);
    setLS("finyk_tx_cache", {
      txs: [
        {
          id: "t1",
          amount: -25000, // 250 грн
          time: todayTs,
          mcc: 5411,
          description: "Сільпо",
        },
        {
          id: "t2",
          amount: -15000, // 150 грн
          time: todayTs - 60,
          mcc: 5812,
          description: "Кафе",
        },
      ],
    });

    const r = computeDailyFinykSummary({ now });
    expect(r.status).toBe("has_expenses");
    expect(r.todaySpent).toBe(400);
    expect(r.txCount).toBe(2);
    expect(r.topCategory).toBeDefined();
    expect(r.topCategory!.amount).toBe(250);
    expect(r.topCategory!.pct).toBe(63);
  });

  it("рахує також ручні витрати (finyk_manual_expenses_v1)", () => {
    const now = makeNow();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    setLS("finyk_manual_expenses_v1", [
      { id: "m1", amount: 100, category: "food", date: todayKey },
      { id: "m2", amount: 50, category: "transport", date: todayKey },
    ]);

    const r = computeDailyFinykSummary({ now });
    expect(r.status).toBe("has_expenses");
    expect(r.todaySpent).toBe(150);
    expect(r.topCategory!.id).toBe("food");
  });

  it("ігнорує внутрішні перекази (internal_transfer)", () => {
    const now = makeNow();
    const todayTs = ts(now);
    setLS("finyk_tx_cache", {
      txs: [
        { id: "tr1", amount: -50000, time: todayTs },
        { id: "t2", amount: -10000, time: todayTs, mcc: 5411 },
      ],
    });
    setLS("finyk_tx_cats", { tr1: "internal_transfer", t2: "food" });

    const r = computeDailyFinykSummary({ now });
    expect(r.todaySpent).toBe(100);
    expect(r.txCount).toBe(1);
  });

  it("ігнорує приховані транзакції (finyk_hidden_txs)", () => {
    const now = makeNow();
    const todayTs = ts(now);
    setLS("finyk_tx_cache", {
      txs: [
        { id: "t1", amount: -20000, time: todayTs, mcc: 5411 },
        { id: "t2", amount: -10000, time: todayTs, mcc: 5411 },
      ],
    });
    setLS("finyk_hidden_txs", ["t1"]);

    const r = computeDailyFinykSummary({ now });
    expect(r.todaySpent).toBe(100);
  });

  it("ігнорує транзакції з інших днів", () => {
    const now = makeNow();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    setLS("finyk_tx_cache", {
      txs: [{ id: "t1", amount: -50000, time: ts(yesterday), mcc: 5411 }],
    });

    const r = computeDailyFinykSummary({ now });
    // Історія є, але сьогодні пусто → не `hidden`; залежить від інших умов
    expect(r.todaySpent).toBe(0);
    expect(["quiet", "reminder_no_expenses", "reminder_active_day"]).toContain(
      r.status,
    );
  });

  it("повертає `reminder_no_expenses` увечері якщо користувач регулярний", () => {
    const now = makeNow();
    // 4 дні з витратами за останні 7 днів
    const txs: Array<{
      id: string;
      amount: number;
      time: number;
      mcc: number;
    }> = [];
    for (let i = 1; i <= 4; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      txs.push({ id: `t${i}`, amount: -10000, time: ts(d), mcc: 5411 });
    }
    setLS("finyk_tx_cache", { txs });

    const r = computeDailyFinykSummary({ now });
    expect(r.status).toBe("reminder_no_expenses");
  });

  it("повертає `quiet` зранку навіть для регулярних (щоб не набридати)", () => {
    const morning = new Date();
    morning.setHours(9, 0, 0, 0);
    const txs: Array<{
      id: string;
      amount: number;
      time: number;
      mcc: number;
    }> = [];
    for (let i = 1; i <= 4; i++) {
      const d = new Date(morning);
      d.setDate(d.getDate() - i);
      txs.push({ id: `t${i}`, amount: -10000, time: ts(d), mcc: 5411 });
    }
    setLS("finyk_tx_cache", { txs });

    const r = computeDailyFinykSummary({ now: morning });
    expect(r.status).toBe("quiet");
  });

  it("повертає `reminder_active_day` якщо є активність в інших модулях", () => {
    const now = makeNow();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    // Історія Фініка (щоб не був `hidden`), але без транзакцій сьогодні
    const yest = new Date(now);
    yest.setDate(yest.getDate() - 1);
    setLS("finyk_tx_cache", {
      txs: [{ id: "t1", amount: -10000, time: ts(yest), mcc: 5411 }],
    });
    // Routine: звичка позначена сьогодні
    setLS("hub_routine_v1", {
      habits: [{ id: "h1", name: "Читати" }],
      completions: { h1: [todayKey] },
    });

    const r = computeDailyFinykSummary({ now });
    expect(r.status).toBe("reminder_active_day");
  });

  it("не реагує на завтрашні дати", () => {
    const now = makeNow();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    setLS("finyk_tx_cache", {
      txs: [{ id: "t1", amount: -50000, time: ts(tomorrow), mcc: 5411 }],
    });

    const r = computeDailyFinykSummary({ now });
    expect(r.todaySpent).toBe(0);
  });

  it("не падає на битих даних у localStorage", () => {
    localStorage.setItem("finyk_tx_cache", "не-json");
    const r = computeDailyFinykSummary({ now: makeNow() });
    expect(r.status).toBe("hidden");
  });
});

describe("isDailySummaryDismissedToday", () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it("повертає false за замовчуванням", () => {
    expect(isDailySummaryDismissedToday()).toBe(false);
  });

  it("повертає true якщо сьогодні був dismiss", () => {
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    setLS(DAILY_SUMMARY_DISMISS_KEY, { date: todayKey, at: Date.now() });
    expect(isDailySummaryDismissedToday({ now })).toBe(true);
  });

  it("повертає false якщо dismiss був вчора", () => {
    const now = new Date();
    const yest = new Date(now);
    yest.setDate(yest.getDate() - 1);
    const yKey = `${yest.getFullYear()}-${String(yest.getMonth() + 1).padStart(2, "0")}-${String(yest.getDate()).padStart(2, "0")}`;
    setLS(DAILY_SUMMARY_DISMISS_KEY, { date: yKey, at: Date.now() });
    expect(isDailySummaryDismissedToday({ now })).toBe(false);
  });
});
