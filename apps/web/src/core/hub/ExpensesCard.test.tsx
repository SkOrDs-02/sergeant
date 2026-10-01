// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

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

// CALC-4 — the Finyk SQLite warm cache (`manualExpenses`) is a plain
// module-level snapshot; simulate the pull-hydration race by swapping
// this mutable box's `.value` and firing the REAL cache-refresh gate
// (not mocked — the card's fix listens to it via `useFinykSqliteReadTick`).
import type { SqliteFinykCache } from "@finyk/lib/sqliteReader";

const fakeSqliteCache: { value: SqliteFinykCache } = {
  value: emptySqliteCache(),
};

vi.mock("@finyk/lib/sqliteReader", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@finyk/lib/sqliteReader")>();
  return {
    ...actual,
    getCachedFinykSqliteState: () => fakeSqliteCache.value,
  };
});

function emptySqliteCache(): SqliteFinykCache {
  return {
    hiddenAccounts: [],
    hiddenTransactions: [],
    budgets: [],
    subscriptions: [],
    manualAssets: [],
    manualDebts: [],
    receivables: [],
    customCategories: [],
    manualExpenses: [],
    txCategories: {},
    txSplits: {},
    monoDebtLinkedTxIds: {},
    networthHistory: [],
    monthlyPlan: null,
    showBalance: null,
    excludedStatTxIds: null,
    dismissedRecurring: null,
    refreshedAt: null,
  };
}

import {
  __resetFinykSqliteReadGateForTests,
  notifyFinykSqliteCacheRefresh,
} from "@finyk/lib/sqliteReadGate";

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
    fakeSqliteCache.value = emptySqliteCache();
    __resetFinykSqliteReadGateForTests();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("без жодної витрати показує порожній стан, а не «0 ₴»", () => {
    // Нуль в обох вікнах не результат, а відсутність предмета (критика
    // екранів 2026-09-23): у шапці тире, розгорнуто текст із дією.
    render(<ExpensesCard period="week" offset={0} />);
    expect(screen.queryByText(/0\s*₴/)).toBeNull();
    expect(screen.getByText("–")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Витрати/i }));
    expect(screen.getByText(/Витрат ще не записано/)).toBeInTheDocument();
    expect(screen.queryByText(/Минулий/i)).toBeNull();
  });

  it("renders collapsed by default with a hryvnia summary and toggles open", () => {
    localStorage.setItem("finyk_tx_cache", JSON.stringify(txCacheToday()));
    render(<ExpensesCard period="week" offset={0} />);

    const toggle = screen.getByRole("button", { name: /Витрати/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByText(/₴/).length).toBeGreaterThan(0);

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    // Середа: тиждень ще йде, тож порівняння з тими ж днями минулого.
    expect(screen.getByText(/Минулий за ті ж дні/)).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: /Витрати/i }));
    const expanded = screen.getAllByText(
      (_, el) =>
        el?.tagName === "SPAN" && el.className.includes("tabular-nums"),
    );
    expect(expanded.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Минулий/i)).toBeInTheDocument();
  });

  // Р4 (канон finyk, журнал 2026-09-24): відсоток лише коли попередня сума
  // є базою (≥ 10 % поточної), інакше абсолютна дельта в гривнях. Раніше
  // чип рахував відсоток із круглих гривень без цього правила.
  describe("дельта до минулого періоду (Р4)", () => {
    // Середа 2026-08-05: «ті ж дні» минулого тижня — пн-ср 07-27…07-29.
    const sameDaysLastWeek = Math.floor(
      new Date("2026-07-29T09:00:00.000Z").getTime() / 1000,
    );
    const seed = (prevMinor: number) =>
      localStorage.setItem(
        "finyk_tx_cache",
        JSON.stringify({
          txs: [
            ...txCacheToday().txs,
            {
              id: "prev",
              amount: -prevMinor,
              time: sameDaysLastWeek,
              description: "Минулий тиждень",
            },
          ],
        }),
      );
    const chipText = () =>
      (screen.getByTestId("delta-chip").textContent ?? "").replace(
        /[\s\u00a0\u202f]/g,
        " ",
      );

    it("минуле ≥ 10 % поточного — відсоток", () => {
      seed(40_000); // 400 ₴ проти 500 ₴ → +25 %
      render(<ExpensesCard period="week" offset={0} />);
      expect(chipText()).toBe("+25%");
    });

    it("минуле < 10 % поточного — абсолютна дельта в гривнях, без відсотка", () => {
      seed(2_000); // 20 ₴ проти 500 ₴: «+2400 %» було б шумом
      render(<ExpensesCard period="week" offset={0} />);
      expect(chipText()).toBe("+480 ₴");
    });

    it("те саме в розгорнутому стані картки", () => {
      seed(2_000);
      render(<ExpensesCard period="week" offset={0} />);
      fireEvent.click(screen.getByRole("button", { name: /Витрати/i }));
      expect(chipText()).toBe("+480 ₴");
    });
  });

  it("не каже «ще не записано», коли минулого тижня витрати були пізніше ніж сьогодні", () => {
    // Середа: «ті ж дні» минулого тижня (пн-ср) порожні, але в пʼятницю
    // витрата була. Предмет звіту є, тож порожнього стану не має бути.
    const lastFriday = Math.floor(
      new Date("2026-07-31T09:00:00.000Z").getTime() / 1000,
    );
    localStorage.setItem(
      "finyk_tx_cache",
      JSON.stringify({ txs: [{ id: "t3", amount: -20000, time: lastFriday }] }),
    );
    render(<ExpensesCard period="week" offset={0} />);
    fireEvent.click(screen.getByRole("button", { name: /Витрати/i }));
    expect(screen.queryByText(/Витрат ще не записано/)).toBeNull();
    expect(screen.getByText(/Минулий за ті ж дні/)).toBeInTheDocument();
  });

  it("renders the empty state when the tx cache is empty", () => {
    render(<ExpensesCard period="week" offset={0} />);
    fireEvent.click(screen.getByRole("button", { name: /Витрати/i }));
    expect(screen.getByText(/Витрат ще не записано/)).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: /Витрати/i }));
    const chart = screen.getByLabelText("Графік");
    expect(chart.querySelectorAll("button").length).toBeGreaterThan(0);
  });

  it("renders month period without crashing", () => {
    localStorage.setItem("finyk_tx_cache", JSON.stringify(txCacheToday()));
    render(<ExpensesCard period="month" offset={0} />);
    fireEvent.click(screen.getByRole("button", { name: /Витрати/i }));
    expect(screen.getByText(/Минулий/i)).toBeInTheDocument();

    const scroller = screen.getByTestId("report-chart-scroller");
    expect(scroller.className).toContain("overflow-x-auto");
    expect(
      scroller.querySelectorAll("button[data-compact]").length,
    ).toBeGreaterThan(28);
  });

  /**
   * CALC-4 (2026-09-01 product audit, blocker): deep-link `/?tab=reports`
   * on a cold boot showed «0 ₴» for an account with 60 days of manual
   * expenses, while the SAME account via SPA nav (which had already
   * warmed the Finyk SQLite cache by visiting `/finyk/*` first) showed
   * the correct total. Root cause: `readFinykStatsContext()` reads a
   * synchronous `getCachedFinykSqliteState()` snapshot, refreshed by
   * `refreshCachesAfterPull` once the sync pull lands — but that refresh
   * only bumps the Finyk SQLite read-tick, never `hubBus("storageUpdated")`,
   * so `ExpensesCard`'s `useMemo` (gated on `bump`/`mirrorTick`) never
   * re-ran once the pull-hydrated cache actually warmed after mount.
   */
  it("CALC-4: recomputes once the Finyk SQLite cache warms after mount (cold deep-link)", () => {
    // Cold mount: the SQLite cache hasn't warmed yet (refreshedAt: null) —
    // this is the deep-link `/?tab=reports` state before the sync pull lands.
    render(<ExpensesCard period="week" offset={0} />);
    fireEvent.click(screen.getByRole("button", { name: /Витрати/i }));
    expect(screen.getByText(/Витрат ще не записано/)).toBeInTheDocument();

    // The pull lands: SQLite cache warms with a manual expense dated
    // today, refreshCachesAfterPull calls `notifyFinykSqliteCacheRefresh`
    // (Finyk-specific tick) — NOT `hubBus("storageUpdated")`.
    const now = new Date();
    fakeSqliteCache.value = {
      ...emptySqliteCache(),
      manualExpenses: [
        {
          id: "m1",
          date: now.toISOString().slice(0, 10),
          description: "Продукти",
          amount: 500,
          category: "groceries",
          kind: "expense",
        },
      ],
      refreshedAt: now.toISOString(),
    };
    act(() => {
      notifyFinykSqliteCacheRefresh();
    });

    // The card must re-aggregate WITHOUT any `bump`/`mirrorTick` change —
    // the empty-state placeholder must be gone and a real amount shown
    // (the `Money` component splits "500" / "₴" into separate spans, so
    // assert on the bar-chart tooltip's `aria-label`, which renders the
    // full "<date>: <amount> ₴" string as one accessible string).
    expect(screen.queryByText(/Витрат ще не записано/)).not.toBeInTheDocument();
    const todayKey = now
      .toISOString()
      .slice(5, 10)
      .split("-")
      .reverse()
      .join(".");
    expect(screen.getByLabelText(`${todayKey}: 500 ₴`)).toBeInTheDocument();
  });
});
