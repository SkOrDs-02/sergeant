import { beforeEach, describe, expect, it, vi } from "vitest";

const { mirrorTxs } = vi.hoisted(() => ({
  mirrorTxs: {
    current: [] as Array<{
      id: string;
      amount: number;
      time?: number;
      description?: string;
      mcc?: number;
    }>,
  },
}));

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
  getCachedFinykMonoMirrorState: () => ({
    transactions: mirrorTxs.current,
    accounts: [],
    refreshedAt: null,
  }),
}));

import { ls } from "../../hubChatUtils";
import { getTxStatAmount } from "../../../../modules/finyk/utils";
import { getCachedFinykSqliteState } from "../../../../modules/finyk/lib/sqliteReader";
import {
  categoryBreakdown,
  detectAnomalies,
  spendingTrend,
} from "./financeAnalytics";

const mockLs = vi.mocked(ls) as ReturnType<typeof vi.fn>;
const mockGetCached = vi.mocked(getCachedFinykSqliteState);
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
  mirrorTxs.current = [];
  mockGetCached.mockReturnValue(makeState());
  mockLs.mockImplementation(() => ({}));
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
    mirrorTxs.current = [
      { id: "t_hidden", amount: -100000, time: RECENT_SEC },
      { id: "t_visible", amount: -5000, time: RECENT_SEC },
    ];
    const result = spendingTrend({ name: "spending_trend", input: {} });
    expect(result).toContain("Транзакцій: 1");
  });
});

// ─── detectAnomalies ──────────────────────────────────────────────────────────

describe("detectAnomalies", () => {
  it("returns insufficient data message for < 3 expenses", () => {
    mirrorTxs.current = [{ id: "t1", amount: -1000, time: RECENT_SEC }];
    const result = detectAnomalies({ name: "detect_anomalies", input: {} });
    expect(result).toContain("Недостатньо");
  });

  it("returns no anomalies message when all amounts are similar", () => {
    mirrorTxs.current = [
      { id: "t1", amount: -1000, time: RECENT_SEC },
      { id: "t2", amount: -1000, time: RECENT_SEC },
      { id: "t3", amount: -1000, time: RECENT_SEC },
    ];
    const result = detectAnomalies({ name: "detect_anomalies", input: {} });
    expect(result).toContain("аномалій не виявлено");
  });

  it("detects large outlier transaction", () => {
    mirrorTxs.current = [
      { id: "t1", amount: -1000, time: RECENT_SEC, description: "Кава" },
      { id: "t2", amount: -1000, time: RECENT_SEC, description: "Їжа" },
      {
        id: "t3",
        amount: -1000,
        time: RECENT_SEC,
        description: "Транспорт",
      },
      {
        id: "big",
        amount: -100000,
        time: RECENT_SEC,
        description: "Великий платіж",
      },
    ];
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
