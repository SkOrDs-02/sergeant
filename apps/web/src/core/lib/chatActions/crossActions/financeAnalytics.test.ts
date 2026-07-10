import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../hubChatUtils", () => ({ ls: vi.fn() }));
vi.mock("../../../../modules/finyk/utils", () => ({
  calcCategorySpent: vi.fn(() => 0),
  getTxStatAmount: vi.fn((t: { amount: number }) => Math.abs(t.amount) / 100),
}));
vi.mock("../../../../modules/finyk/constants", () => ({
  INTERNAL_TRANSFER_ID: "_internal",
  mergeExpenseCategoryDefinitions: vi.fn(() => [
    { id: "food", label: "Їжа" },
    { id: "transport", label: "Транспорт" },
  ]),
}));
vi.mock("../../../../modules/finyk/lib/sqliteReader", () => ({
  getCachedFinykSqliteState: vi.fn(),
}));
vi.mock("../../../../modules/finyk/lib/monoMirrorReader", () => ({
  getCachedFinykMonoMirrorState: vi.fn(),
}));

import { ls } from "../../hubChatUtils";
import { getTxStatAmount } from "../../../../modules/finyk/utils";
import { getCachedFinykSqliteState } from "../../../../modules/finyk/lib/sqliteReader";
import { getCachedFinykMonoMirrorState } from "../../../../modules/finyk/lib/monoMirrorReader";
import {
  categoryBreakdown,
  detectAnomalies,
  spendingTrend,
} from "./financeAnalytics";

const mockLs = vi.mocked(ls) as ReturnType<typeof vi.fn>;
const mockGetCached = vi.mocked(getCachedFinykSqliteState);
const mockGetMirror = vi.mocked(getCachedFinykMonoMirrorState);
const mockGetTxAmount = vi.mocked(getTxStatAmount);

const RECENT_SEC = Math.floor((Date.now() - 3600 * 1000) / 1000);

function makeState() {
  return {
    hiddenTransactions: [],
    customCategories: [],
    txCategories: {},
  } as unknown as ReturnType<typeof getCachedFinykSqliteState>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCached.mockReturnValue(makeState());
  // finyk_tx_cache is tombstoned — bank transactions now come from the mirror.
  mockGetMirror.mockReturnValue({
    transactions: [],
    accounts: [],
    refreshedAt: null,
  });
  mockLs.mockImplementation((_key: string) => ({}));
  mockGetTxAmount.mockImplementation(
    (t: { amount: number }) => Math.abs(t.amount) / 100,
  );
});

// ─── spendingTrend ────────────────────────────────────────────────────────────

describe("spendingTrend", () => {
  it("returns formatted report with header", () => {
    const result = spendingTrend({ name: "spending_trend", input: {} });
    expect(result).toContain("Тренд витрат");
    expect(result).toContain("Витрати:");
    expect(result).toContain("Дохід:");
    expect(result).toContain("Зміна:");
  });

  it("shows 0 when no transactions", () => {
    const result = spendingTrend({ name: "spending_trend", input: {} });
    expect(result).toContain("Витрати: 0 грн");
  });

  it("uses default 30-day period", () => {
    const result = spendingTrend({ name: "spending_trend", input: {} });
    expect(result).toContain("30 днів");
  });

  it("respects custom period_days", () => {
    const result = spendingTrend({
      name: "spending_trend",
      input: { period_days: 7 },
    });
    expect(result).toContain("7 днів");
  });

  it("excludes hidden transactions", () => {
    mockGetCached.mockReturnValue({
      ...makeState(),
      hiddenTransactions: ["t_hidden"],
    });
    // finyk_tx_cache is tombstoned — seed the canonical Mono mirror cache.
    mockGetMirror.mockReturnValue({
      transactions: [
        { id: "t_hidden", amount: -100000, time: RECENT_SEC },
        { id: "t_visible", amount: -5000, time: RECENT_SEC },
      ] as never,
      accounts: [],
      refreshedAt: new Date().toISOString(),
    });
    const result = spendingTrend({ name: "spending_trend", input: {} });
    expect(result).toContain("Транзакцій: 1");
  });
});

// ─── detectAnomalies ──────────────────────────────────────────────────────────

describe("detectAnomalies", () => {
  it("returns insufficient data message for < 3 expenses", () => {
    // finyk_tx_cache is tombstoned — seed the canonical Mono mirror cache.
    mockGetMirror.mockReturnValue({
      transactions: [{ id: "t1", amount: -1000, time: RECENT_SEC }] as never,
      accounts: [],
      refreshedAt: new Date().toISOString(),
    });
    const result = detectAnomalies({ name: "detect_anomalies", input: {} });
    expect(result).toContain("Недостатньо");
  });

  it("returns no anomalies message when all amounts are similar", () => {
    // finyk_tx_cache is tombstoned — seed the canonical Mono mirror cache.
    mockGetMirror.mockReturnValue({
      transactions: [
        { id: "t1", amount: -1000, time: RECENT_SEC },
        { id: "t2", amount: -1000, time: RECENT_SEC },
        { id: "t3", amount: -1000, time: RECENT_SEC },
      ] as never,
      accounts: [],
      refreshedAt: new Date().toISOString(),
    });
    const result = detectAnomalies({ name: "detect_anomalies", input: {} });
    expect(result).toContain("аномалій не виявлено");
  });

  it("detects large outlier transaction", () => {
    // finyk_tx_cache is tombstoned — seed the canonical Mono mirror cache.
    mockGetMirror.mockReturnValue({
      transactions: [
        { id: "t1", amount: -1000, time: RECENT_SEC, description: "Кава" },
        { id: "t2", amount: -1000, time: RECENT_SEC, description: "Їжа" },
        { id: "t3", amount: -1000, time: RECENT_SEC, description: "Транспорт" },
        {
          id: "big",
          amount: -100000,
          time: RECENT_SEC,
          description: "Великий платіж",
        },
      ] as never,
      accounts: [],
      refreshedAt: new Date().toISOString(),
    });
    const result = detectAnomalies({ name: "detect_anomalies", input: {} });
    expect(result).toContain("Аномальні витрати");
    expect(result).toContain("Великий платіж");
  });
});

// ─── categoryBreakdown ────────────────────────────────────────────────────────

describe("categoryBreakdown", () => {
  it("returns formatted header with period", () => {
    const result = categoryBreakdown({ name: "category_breakdown", input: {} });
    expect(result).toContain("30 днів");
    expect(result).toContain("грн)");
  });

  it("returns empty breakdown when no expenses", () => {
    const result = categoryBreakdown({ name: "category_breakdown", input: {} });
    expect(result).toContain("0 грн");
  });
});
