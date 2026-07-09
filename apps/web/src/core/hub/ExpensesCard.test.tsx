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
vi.mock("@finyk/lib/monoMirrorReader", () => ({
  getCachedFinykMonoMirrorState: vi.fn(() => {
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
  }),
  useFinykMonoMirrorTick: vi.fn(() => 0),
}));

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
    localStorage.clear();
    getFinykExcludedTxIdsFromStorage.mockReturnValue([]);
    getFinykTxSplitsFromStorage.mockReturnValue({});
  });
  afterEach(() => vi.clearAllMocks());

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
  });
});
