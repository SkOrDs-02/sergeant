// @vitest-environment jsdom
/**
 * Unit tests for useOverviewData.
 *
 * The hook computes ~25 derived values from the mono data slice and finyk
 * storage. We supply stub objects for both inputs and verify the pure
 * derivations: networth, spent, income, budget alerts, projection ratios,
 * debt/receivable totals, and the first-insight banner flag.
 *
 * We do NOT test effects that write back to storage (saveNetworthSnapshot)
 * or fire analytics — those are side-effecting branches exercised by e2e.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useOverviewData } from "./useOverviewData";
import type { UseOverviewDataParams } from "./useOverviewData";

// ── stub factories ──────────────────────────────────────────────────────────

function mkMonoAccount(
  id: string,
  balance: number,
  creditLimit = 0,
): Record<string, unknown> {
  return {
    id,
    balance,
    creditLimit,
    // UAH currencyCode required by getMonoTotals to count in balance
    currencyCode: 980,
    _source: "monobank",
  };
}

function mkTx(
  id: string,
  amount: number,
  opts: { time?: number } = {},
): Record<string, unknown> {
  return {
    id,
    amount,
    time: opts.time ?? Math.floor(Date.now() / 1000),
    date: new Date().toISOString().slice(0, 10),
    description: "",
    mcc: 0,
    categoryId: "other",
    type: amount > 0 ? "income" : "expense",
    source: "manual",
    accountId: null,
    manual: false,
    _source: "manual",
    _accountId: null,
    _manual: false,
  };
}

function buildMono(
  overrides: Partial<UseOverviewDataParams["mono"]> = {},
): UseOverviewDataParams["mono"] {
  return {
    realTx: [],
    loadingTx: false,
    clientInfo: null,
    accounts: [],
    transactions: [],
    syncState: "idle" as const,
    lastUpdated: null,
    error: null,
    refresh: vi.fn(),
    privatTotal: 0,
    ...overrides,
  } as UseOverviewDataParams["mono"];
}

function buildStorage(
  overrides: Partial<UseOverviewDataParams["storage"]> = {},
): UseOverviewDataParams["storage"] {
  return {
    budgets: [],
    subscriptions: [],
    manualDebts: [],
    receivables: [],
    hiddenAccounts: [],
    excludedTxIds: new Set<string>(),
    monthlyPlan: null,
    networthHistory: [],
    saveNetworthSnapshot: vi.fn(),
    txCategories: {},
    txSplits: {},
    manualAssets: [],
    customCategories: [],
    manualExpenses: [],
    ...overrides,
  } as UseOverviewDataParams["storage"];
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("useOverviewData", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 2026-06-04 12:00 EEST (UTC+3) → UTC 09:00
    vi.setSystemTime(new Date("2026-06-04T09:00:00Z"));
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("networth calculation", () => {
    it("is zero when no accounts, debts, or assets", () => {
      const { result } = renderHook(() =>
        useOverviewData({
          mono: buildMono(),
          storage: buildStorage(),
        }),
      );
      expect(result.current.networth).toBe(0);
    });

    it("sums mono account balances", () => {
      // getMonoTotals divides by 100 (kopecks → hryvnias), only counts
      // accounts with balance > 0, no creditLimit, currencyCode === 980.
      // a1: 100_000 kopecks = 1000 UAH; a2: 50_000 kopecks = 500 UAH
      const accounts = [
        mkMonoAccount("a1", 100_000),
        mkMonoAccount("a2", 50_000),
      ];
      const { result } = renderHook(() =>
        useOverviewData({
          mono: buildMono({
            accounts: accounts as UseOverviewDataParams["mono"]["accounts"],
          }),
          storage: buildStorage(),
        }),
      );
      // monoTotal = 1000 + 500 = 1500 UAH
      expect(result.current.monoTotal).toBe(1500);
    });

    it("adds privatTotal to monoTotal", () => {
      // monoAccount contributes 1000 UAH (100_000 kopecks / 100)
      // privatTotal is already in UAH (not kopecks)
      const accounts = [mkMonoAccount("a1", 100_000)];
      const { result } = renderHook(() =>
        useOverviewData({
          mono: buildMono({
            accounts: accounts as UseOverviewDataParams["mono"]["accounts"],
            privatTotal: 500,
          }),
          storage: buildStorage(),
        }),
      );
      // monoOnlyTotal = 1000, privatTotal = 500 → monoTotal = 1500
      expect(result.current.monoTotal).toBe(1500);
    });

    it("credit account balance is included in monoTotal, debt in totalDebt", () => {
      const accounts = [mkMonoAccount("credit1", -5000, 10000)];
      const { result } = renderHook(() =>
        useOverviewData({
          mono: buildMono({
            accounts: accounts as UseOverviewDataParams["mono"]["accounts"],
          }),
          storage: buildStorage(),
        }),
      );
      // monoTotalDebt comes from getMonoTotals; creditLimit > 0 means debt
      expect(result.current.totalDebt).toBeGreaterThan(0);
    });
  });

  describe("spending calculation", () => {
    it("spent sums absolute values of negative-amount stat transactions", () => {
      const realTx = [
        mkTx("a", -10000),
        mkTx("b", -5000),
        mkTx("c", 20000), // income — not counted in spent
      ] as UseOverviewDataParams["mono"]["realTx"];
      const { result } = renderHook(() =>
        useOverviewData({
          mono: buildMono({ realTx }),
          storage: buildStorage(),
        }),
      );
      // calcFinykSpendingTotal sums expense amounts (in UAH, divided by 100)
      expect(result.current.spent).toBeGreaterThan(0);
    });

    it("excluded transactions are not counted in spent", () => {
      const realTx = [
        mkTx("a", -10000),
        mkTx("excluded", -99999),
      ] as UseOverviewDataParams["mono"]["realTx"];
      const excludedTxIds = new Set(["excluded"]);
      const { result } = renderHook(() =>
        useOverviewData({
          mono: buildMono({ realTx }),
          storage: buildStorage({ excludedTxIds }),
        }),
      );
      // Only "a" counts → spent = 100 UAH (10000 kopecks / 100)
      expect(result.current.spent).toBe(100);
    });
  });

  describe("income from monthlySummary", () => {
    it("income is non-negative for positive transactions", () => {
      const realTx = [
        mkTx("inc", 50000),
      ] as UseOverviewDataParams["mono"]["realTx"];
      const { result } = renderHook(() =>
        useOverviewData({
          mono: buildMono({ realTx }),
          storage: buildStorage(),
        }),
      );
      expect(result.current.income).toBeGreaterThanOrEqual(0);
    });
  });

  describe("today summary", () => {
    it("uses the Kyiv day, excludes transfers, and derives the daily plan", () => {
      const todayTime = Math.floor(
        new Date("2026-06-04T08:00:00Z").getTime() / 1000,
      );
      const yesterdayTime = Math.floor(
        new Date("2026-06-03T08:00:00Z").getTime() / 1000,
      );
      const realTx = [
        mkTx("today-expense", -10_000, { time: todayTime }),
        mkTx("today-income", 20_000, { time: todayTime }),
        mkTx("transfer", -70_000, { time: todayTime }),
        mkTx("yesterday", -90_000, { time: yesterdayTime }),
      ] as UseOverviewDataParams["mono"]["realTx"];

      const { result } = renderHook(() =>
        useOverviewData({
          mono: buildMono({ realTx }),
          storage: buildStorage({
            excludedTxIds: new Set(["transfer"]),
            monthlyPlan: { income: 0, expense: 3000, savings: 0 },
          }),
        }),
      );

      expect(result.current.todaySpent).toBe(100);
      expect(result.current.todayIncome).toBe(200);
      expect(result.current.dailyPlan).toBe(100);
    });

    it("returns no daily plan when the monthly plan is absent", () => {
      const { result } = renderHook(() =>
        useOverviewData({ mono: buildMono(), storage: buildStorage() }),
      );
      expect(result.current.dailyPlan).toBeNull();
    });
  });

  describe("budget alerts", () => {
    it("budgetAlerts is empty when no limit budgets are defined", () => {
      const { result } = renderHook(() =>
        useOverviewData({
          mono: buildMono(),
          storage: buildStorage({ budgets: [] }),
        }),
      );
      expect(result.current.budgetAlerts).toHaveLength(0);
    });
  });

  describe("planned flows", () => {
    it("plannedFlows is empty when no subscriptions/debts/receivables", () => {
      const { result } = renderHook(() =>
        useOverviewData({
          mono: buildMono(),
          storage: buildStorage(),
        }),
      );
      expect(result.current.plannedFlows).toHaveLength(0);
    });

    it("combines subscriptions, debts, and receivables into planned and monthly flows", () => {
      const transactions = [
        {
          id: "tx-spotify",
          amount: -19900,
          time: new Date(2026, 4, 10, 12, 0).getTime(),
          date: "2026-05-10",
          description: "spotify premium",
          categoryId: "subscriptions",
          type: "expense",
          source: "monobank",
          accountId: null,
          manual: false,
          _source: "monobank",
          _accountId: null,
          _manual: false,
          currencyCode: 980,
        },
      ] as unknown as UseOverviewDataParams["mono"]["transactions"];
      const storage = buildStorage({
        monthlyPlan: { income: 0, expense: 1000, savings: 0 },
        subscriptions: [
          {
            id: "sub-spotify",
            emoji: "S",
            name: "Spotify",
            billingDay: 6,
            keyword: "spotify",
            currency: "UAH",
          },
          {
            id: "sub-unknown",
            emoji: "?",
            name: "No amount yet",
            billingDay: 8,
            keyword: "",
            currency: "UAH",
          },
          {
            id: "sub-next-month",
            emoji: "N",
            name: "Already billed",
            billingDay: 1,
            keyword: "",
            currency: "UAH",
          },
        ],
        manualDebts: [
          {
            id: "debt-1",
            emoji: "D",
            name: "Loan",
            amount: 500,
            totalAmount: 500,
            dueDate: "2026-06-07",
          },
        ],
        receivables: [
          {
            id: "recv-1",
            emoji: "R",
            name: "Refund",
            amount: 120,
            dueDate: "2026-06-09",
          },
        ],
      });

      const { result } = renderHook(() =>
        useOverviewData({
          mono: buildMono({ transactions }),
          storage,
        }),
      );

      expect(result.current.plannedFlows.map((f) => f.id)).toEqual([
        "sub-sub-spotify",
        "debt-debt-1",
        "sub-sub-unknown",
        "recv-recv-1",
      ]);
      expect(result.current.recurringOutThisMonth).toBe(699);
      expect(result.current.recurringInThisMonth).toBe(120);
      expect(result.current.unknownOutCount).toBe(1);
      expect(result.current.dayBudget).toBeGreaterThan(0);
    });
  });

  // PR-5 (Фаза 2, детермінована частина): прогноз враховує заплановані
  // потоки місяця і обрізається доступними коштами.
  describe("projected spend v2 (Фаза 2, PR-5)", () => {
    it("is deterministic across repeated renders on unchanged data", () => {
      const mono = buildMono({
        realTx: [
          mkTx("spend-1", -10_000, {
            time: Math.floor(new Date("2026-06-02T09:00:00Z").getTime() / 1000),
          }),
        ] as UseOverviewDataParams["mono"]["realTx"],
      });
      const storage = buildStorage();

      const first = renderHook(() => useOverviewData({ mono, storage }));
      const second = renderHook(() => useOverviewData({ mono, storage }));

      expect(second.result.current.projectedSpend).toBe(
        first.result.current.projectedSpend,
      );
    });

    it("adds recurring planned outflows to the raw forecast when funds allow", () => {
      const storage = buildStorage({
        subscriptions: [
          {
            id: "sub-spotify",
            emoji: "S",
            name: "Spotify",
            billingDay: 6,
            keyword: "spotify",
            currency: "UAH",
          },
        ],
      });
      const { result } = renderHook(() =>
        useOverviewData({
          mono: buildMono({
            // Величезний залишок: стеля точно не заважає цьому тесту.
            accounts: [
              mkMonoAccount("a1", 100_000_000),
            ] as UseOverviewDataParams["mono"]["accounts"],
            realTx: [
              mkTx("spend-1", -10_000, {
                time: Math.floor(
                  new Date("2026-06-02T09:00:00Z").getTime() / 1000,
                ),
              }),
            ] as UseOverviewDataParams["mono"]["realTx"],
            // `getSubscriptionAmountMeta` виводить суму підписки з минулого
            // збігу за ключовим словом (окреме поле від `realTx`).
            transactions: [
              {
                id: "tx-spotify",
                amount: -19900,
                time: new Date(2026, 4, 10, 12, 0).getTime(),
                date: "2026-05-10",
                description: "spotify premium",
                categoryId: "subscriptions",
                type: "expense",
                source: "monobank",
                accountId: null,
                manual: false,
                _source: "monobank",
                _accountId: null,
                _manual: false,
                currencyCode: 980,
              },
            ] as unknown as UseOverviewDataParams["mono"]["transactions"],
          }),
          storage,
        }),
      );

      // daysPassed=4, daysInMonth=30, spent=100 → лінійний прогноз 750 ₴.
      // Spotify (billingDay=6) ще попереду в цьому місяці → +199 ₴.
      expect(result.current.recurringOutThisMonth).toBeGreaterThan(0);
      expect(result.current.projectedSpendCapped).toBe(false);
      expect(result.current.projectedSpend).toBeCloseTo(
        (100 / 4) * 30 + result.current.recurringOutThisMonth,
        5,
      );
    });

    it("caps the forecast at available funds and flags it as capped", () => {
      const { result } = renderHook(() =>
        useOverviewData({
          mono: buildMono({
            // Залишок у кілька гривень, навмисно менший за лінійний прогноз.
            accounts: [
              mkMonoAccount("a1", 500),
            ] as UseOverviewDataParams["mono"]["accounts"],
            realTx: [
              mkTx("spend-1", -10_000, {
                time: Math.floor(
                  new Date("2026-06-02T09:00:00Z").getTime() / 1000,
                ),
              }),
            ] as UseOverviewDataParams["mono"]["realTx"],
          }),
          storage: buildStorage(),
        }),
      );

      // Лінійний прогноз (750 ₴) набагато більший за залишок (5 ₴): прогноз
      // не має обіцяти тисячі витрат, коли грошей на них нема.
      expect(result.current.monoTotal).toBe(5);
      expect(result.current.projectedSpendCapped).toBe(true);
      expect(result.current.projectedSpend).toBe(5);
    });
  });

  describe("first-insight banner", () => {
    it("showFirstInsight is true when the seen-key is absent from localStorage", () => {
      localStorage.removeItem("finyk_first_insight_seen_v1");
      const { result } = renderHook(() =>
        useOverviewData({
          mono: buildMono(),
          storage: buildStorage(),
        }),
      );
      expect(result.current.showFirstInsight).toBe(true);
    });

    it("showFirstInsight is false when the seen-key is present", () => {
      localStorage.setItem("finyk_first_insight_seen_v1", "1");
      const { result } = renderHook(() =>
        useOverviewData({
          mono: buildMono(),
          storage: buildStorage(),
        }),
      );
      expect(result.current.showFirstInsight).toBe(false);
    });

    it("hasAnyData is true when manualExpenses has entries", () => {
      const manualExpenses = [
        {
          id: "m1",
          amount: 50,
          date: "2026-06-04",
          description: "test",
          category: "food",
        },
      ];
      const { result } = renderHook(() =>
        useOverviewData({
          mono: buildMono(),
          storage: buildStorage({ manualExpenses }),
        }),
      );
      expect(result.current.hasAnyData).toBe(true);
    });

    it("hasAnyData is true when realTx has entries", () => {
      const realTx = [
        mkTx("t1", -100),
      ] as UseOverviewDataParams["mono"]["realTx"];
      const { result } = renderHook(() =>
        useOverviewData({
          mono: buildMono({ realTx }),
          storage: buildStorage(),
        }),
      );
      expect(result.current.hasAnyData).toBe(true);
    });

    it("hasAnyData is false when no transactions or manual expenses", () => {
      const { result } = renderHook(() =>
        useOverviewData({
          mono: buildMono({ realTx: [] }),
          storage: buildStorage({ manualExpenses: [] }),
        }),
      );
      expect(result.current.hasAnyData).toBe(false);
    });

    it("handleSetBudgetFromInsight dismisses the banner and navigates to budgets", () => {
      const onNavigate = vi.fn();
      const { result } = renderHook(() =>
        useOverviewData({
          mono: buildMono(),
          storage: buildStorage(),
          onNavigate,
        }),
      );

      act(() => result.current.handleSetBudgetFromInsight());

      expect(result.current.showFirstInsight).toBe(false);
      expect(onNavigate).toHaveBeenCalledWith("budgets");
    });
  });

  // Regression: founder report 2026-07-31 — «Статистику на серпень вже велику
  // пише, хоча він тільки почався» + «124 686 ₴/день можна сьогодні».
  describe("current-month clamp and day budget (regression 2026-07-31)", () => {
    /**
     * `realTx` is NOT guaranteed to be current-month-only: the read overlay in
     * `useMonobankWebhook` substitutes the full SQLite mirror whenever the
     * current-month network slice comes back empty — which is exactly the
     * state on day 1 of a new month.
     */
    function monthMixMono() {
      const kyiv = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);
      return buildMono({
        realTx: [
          // Previous month (липень) — must NOT count toward "цього місяця".
          mkTx("prev-1", -1_000_00, { time: kyiv("2026-07-15T09:00:00Z") }),
          mkTx("prev-2", 5_000_00, { time: kyiv("2026-07-20T09:00:00Z") }),
          // Current month (серпень).
          mkTx("cur-1", -250_00, { time: kyiv("2026-08-01T09:00:00Z") }),
          mkTx("cur-2", 700_00, { time: kyiv("2026-08-01T10:00:00Z") }),
        ],
      } as Partial<UseOverviewDataParams["mono"]>);
    }

    beforeEach(() => {
      // 2026-08-01 01:47 Kyiv (EEST, UTC+3) → 2026-07-31T22:47Z. The Kyiv day
      // boundary must win over the host/UTC one: this instant is 1 серпня.
      vi.setSystemTime(new Date("2026-07-31T22:47:00Z"));
    });

    it("counts only current-Kyiv-month transactions in spent/income", () => {
      const { result } = renderHook(() =>
        useOverviewData({ mono: monthMixMono(), storage: buildStorage() }),
      );
      // 250 ₴ spent and 700 ₴ received in серпень; липень's 1 000 / 5 000 are
      // outside the window and must not leak into the "Місяць" card.
      expect(result.current.spent).toBe(250);
      expect(result.current.income).toBe(700);
    });

    it("keeps the mirror's older months out of the month aggregates entirely", () => {
      const { result } = renderHook(() =>
        useOverviewData({ mono: monthMixMono(), storage: buildStorage() }),
      );
      expect(result.current.statTx.map((t) => t.id)).toEqual([
        "cur-1",
        "cur-2",
      ]);
    });

    it("returns dayBudget = null when no monthly plan is set", () => {
      // Previously this fell back to `projectedSpend`, which is itself derived
      // from `spent` — the number collapsed to ≈ spent · 30/31, i.e. "ти можеш
      // витратити сьогодні стільки, скільки вже витратив".
      const { result } = renderHook(() =>
        useOverviewData({ mono: monthMixMono(), storage: buildStorage() }),
      );
      expect(result.current.hasExpensePlan).toBe(false);
      expect(result.current.dayBudget).toBeNull();
    });

    it("computes dayBudget from the user's plan when one is set", () => {
      const { result } = renderHook(() =>
        useOverviewData({
          mono: monthMixMono(),
          storage: buildStorage({
            monthlyPlan: { income: 0, expense: 31_000, savings: 0 },
          } as Partial<UseOverviewDataParams["storage"]>),
        }),
      );
      // План 31 000 − витрачено 250, поділити на 31 день, що лишився.
      expect(result.current.dayBudget).toBeCloseTo((31_000 - 250) / 31, 5);
    });
  });

  describe("projection and plan", () => {
    it("hasExpensePlan is false when no monthlyPlan is set", () => {
      const { result } = renderHook(() =>
        useOverviewData({
          mono: buildMono(),
          storage: buildStorage({}),
        }),
      );
      expect(result.current.hasExpensePlan).toBe(false);
    });

    it("showMonthForecast is false at start of month when daysPassed=0", () => {
      // Set to 2026-06-01 (first day of month)
      vi.setSystemTime(new Date("2026-06-01T09:00:00Z"));
      const { result } = renderHook(() =>
        useOverviewData({
          mono: buildMono(),
          storage: buildStorage(),
        }),
      );
      // daysPassed = 0 at start of month → showMonthForecast = false
      expect(result.current.showMonthForecast).toBe(false);
    });

    it("adds only UAH manual assets to networth and counts excluded non-UAH assets", () => {
      const { result } = renderHook(() =>
        useOverviewData({
          mono: buildMono(),
          storage: buildStorage({
            manualAssets: [
              { id: "asset-uah", amount: 300, currency: "UAH" },
              { id: "asset-usd", amount: 999, currency: "USD" },
            ],
          }),
        }),
      );

      expect(result.current.networth).toBe(300);
      expect(result.current.nonUahManualAssetCount).toBe(1);
    });
  });

  describe("returned values shape", () => {
    it("exposes all expected keys", () => {
      const { result } = renderHook(() =>
        useOverviewData({
          mono: buildMono(),
          storage: buildStorage(),
        }),
      );
      const keys = Object.keys(result.current);
      // Spot check a representative set of returned fields
      expect(keys).toContain("networth");
      expect(keys).toContain("monoTotal");
      expect(keys).toContain("spent");
      expect(keys).toContain("income");
      expect(keys).toContain("budgetAlerts");
      expect(keys).toContain("plannedFlows");
      expect(keys).toContain("showFirstInsight");
      expect(keys).toContain("hasAnyData");
      expect(keys).toContain("dayBudget");
      expect(keys).toContain("projectedSpend");
      expect(keys).toContain("projectedSpendCapped");
    });

    it("dateLabel is a non-empty string", () => {
      const { result } = renderHook(() =>
        useOverviewData({
          mono: buildMono(),
          storage: buildStorage(),
        }),
      );
      expect(typeof result.current.dateLabel).toBe("string");
      expect(result.current.dateLabel.length).toBeGreaterThan(0);
    });
  });
});
