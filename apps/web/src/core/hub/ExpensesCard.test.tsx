// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const getFinykExcludedTxIdsFromStorage = vi.fn(() => [] as string[]);
const getFinykTxSplitsFromStorage = vi.fn(
  () => ({}) as Record<string, unknown[]>,
);
vi.mock("@finyk/utils", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    getFinykExcludedTxIdsFromStorage: () => getFinykExcludedTxIdsFromStorage(),
    getFinykTxSplitsFromStorage: () => getFinykTxSplitsFromStorage(),
  };
});

// ExpensesCard reads bank transactions from the SQLite Mono mirror cache.
// Bridge it to localStorage so test-seeded `finyk_tx_cache` entries flow
// through — this matches the pattern used in crossActions.test.ts.
vi.mock("@finyk/lib/monoMirrorReader", () => {
  const readMockMirrorState = () => {
    const raw = localStorage.getItem("finyk_tx_cache");
    if (!raw) return { transactions: [], accounts: [], refreshedAt: null };
    try {
      const parsed = JSON.parse(raw) as unknown;
      const txs = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as { txs?: unknown[] })?.txs)
          ? (parsed as { txs: unknown[] }).txs
          : [];
      return {
        transactions: txs,
        accounts: [],
        refreshedAt: new Date().toISOString(),
      };
    } catch {
      return { transactions: [], accounts: [], refreshedAt: null };
    }
  };
  return {
    getCachedFinykMonoMirrorState: vi.fn(readMockMirrorState),
    // ExpensesCard читає visible-геттер (без прихованих карток); у моку
    // обидва — один і той самий фейк.
    getVisibleFinykMonoMirrorState: vi.fn(readMockMirrorState),
    useFinykMonoMirrorTick: vi.fn(() => 0),
  };
});

import ExpensesCard from "./ExpensesCard";

// One spending tx (negative amount) timed at noon today. `time` is unix
// seconds; the finyk domain aggregator multiplies by 1000 internally.
function txCacheToday(): { txs: unknown[] } {
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  const timeSec = Math.floor(now.getTime() / 1000);
  return {
    txs: [{ id: "t1", amount: -50000, time: timeSec, description: "Кава" }],
  };
}

describe("ExpensesCard", () => {
  beforeEach(() => {
    // AI-CONTEXT: годинник заморожений на середу опівдні за Києвом.
    // `txCacheToday()` бере «сьогодні» з пристрою, а картка відбирає
    // операції за КИЇВСЬКИЙ тиждень. Різниця в 3 години робить неділю
    // ввечері за UTC уже понеділком у Києві, тож на межі тижня операція
    // випадала б за межі періоду і сума ставала нулем. Середина тижня
    // прибирає цю щілину для всіх тестів файлу, а не лише для одного.
    vi.setSystemTime(new Date("2026-08-05T09:00:00.000Z"));
    localStorage.clear();
    getFinykExcludedTxIdsFromStorage.mockReturnValue([]);
    getFinykTxSplitsFromStorage.mockReturnValue({});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("renders collapsed by default with a hryvnia summary and toggles open", () => {
    localStorage.setItem("finyk_tx_cache", JSON.stringify(txCacheToday()));
    render(<ExpensesCard period="week" offset={0} />);

    const toggle = screen.getByRole("button", { name: /Фінік/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByText(/₴/).length).toBeGreaterThan(0);

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/Минулий/i)).toBeInTheDocument();
  });

  /**
   * Сума набрана `Money`, а не рядком `toLocaleString() + " ₴"`. Перевіряємо
   * саме тири: символ валюти має бути ОКРЕМИМ вузлом (П4), інакше цифра й
   * символ знову зростаються в один рядок, як було до анти-слоп-проходу.
   * `getAllByText(/₴/)` цього не ловить — він проходив і на сирому рядку.
   */
  it("renders the amount through Money, with the symbol as its own tier", () => {
    localStorage.setItem("finyk_tx_cache", JSON.stringify(txCacheToday()));
    const { container } = render(<ExpensesCard period="week" offset={0} />);

    // −50 000 копійок у фікстурі → 500 ₴.
    const money = screen.getAllByText(
      (_, el) =>
        el?.tagName === "SPAN" &&
        el.className.includes("tabular-nums") &&
        (el.textContent ?? "").replace(/[\s\u00a0\u202f]/g, " ") === "500 ₴",
    )[0];
    expect(money).toBeDefined();
    expect(container.querySelector(".text-\\[0\\.72em\\]")).not.toBeNull();

    // Розгорнутий стан — ще два `Money`: головне число і підпис із
    // попереднім періодом. PR міняв усі три сайти, тож перевіряємо всі три.
    fireEvent.click(screen.getByRole("button", { name: /Фінік/i }));
    const expanded = screen.getAllByText(
      (_, el) =>
        el?.tagName === "SPAN" && el.className.includes("tabular-nums"),
    );
    expect(expanded.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Минулий/i)).toBeInTheDocument();
  });

  it("renders the no-data placeholder when the tx cache is empty", () => {
    render(<ExpensesCard period="week" offset={0} />);
    fireEvent.click(screen.getByRole("button", { name: /Фінік/i }));
    expect(screen.getByText(/Немає даних/i)).toBeInTheDocument();
  });

  it("accepts a bare array tx cache shape", () => {
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    const timeSec = Math.floor(now.getTime() / 1000);
    localStorage.setItem(
      "finyk_tx_cache",
      JSON.stringify([{ id: "t2", amount: -30000, time: timeSec }]),
    );
    render(<ExpensesCard period="week" offset={0} />);
    fireEvent.click(screen.getByRole("button", { name: /Фінік/i }));
    const chart = screen.getByLabelText("Графік");
    expect(chart.querySelectorAll("button").length).toBeGreaterThan(0);
  });

  it("renders month period without crashing", () => {
    localStorage.setItem("finyk_tx_cache", JSON.stringify(txCacheToday()));
    render(<ExpensesCard period="month" offset={0} />);
    fireEvent.click(screen.getByRole("button", { name: /Фінік/i }));
    expect(screen.getByText(/Минулий/i)).toBeInTheDocument();

    const scroller = screen.getByTestId("report-chart-scroller");
    expect(scroller.className).toContain("overflow-x-auto");
    expect(
      scroller.querySelectorAll("button[data-compact]").length,
    ).toBeGreaterThan(28);
  });
});
