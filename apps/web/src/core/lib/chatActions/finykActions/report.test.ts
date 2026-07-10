import { beforeEach, describe, expect, it, vi } from "vitest";

const { mirrorTxs } = vi.hoisted(() => ({
  mirrorTxs: {
    current: [] as Array<{ id: string; amount: number; time?: number }>,
  },
}));

vi.mock("../../hubChatUtils", () => ({ ls: vi.fn() }));
vi.mock("../../../../modules/finyk/utils", () => ({
  getTxStatAmount: vi.fn((t: { amount: number }) => Math.abs(t.amount) / 100),
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
import { getCachedFinykSqliteState } from "../../../../modules/finyk/lib/sqliteReader";
import { exportReport } from "./report";

const mockLs = vi.mocked(ls) as ReturnType<typeof vi.fn>;
const mockGetCached = vi.mocked(getCachedFinykSqliteState);

// Use a timestamp within the last 7 days so "week" period filter passes
const TX_EPOCH_SEC = Math.floor((Date.now() - 3600 * 1000) / 1000);

function seedMirror(
  txs: Array<{ id: string; amount: number; time?: number }>,
): void {
  mirrorTxs.current = txs;
}

beforeEach(() => {
  vi.clearAllMocks();
  mirrorTxs.current = [];
  mockGetCached.mockReturnValue({
    hiddenTransactions: [],
  } as unknown as ReturnType<typeof getCachedFinykSqliteState>);
  mockLs.mockImplementation((key: string) => {
    if (key === "finyk_tx_splits") return {};
    return null;
  });
});

describe("exportReport", () => {
  it("returns a formatted report with header line", () => {
    const result = exportReport({ name: "export_report", input: {} }) as string;
    expect(result).toContain("Звіт за");
    expect(result).toContain("Дохід:");
    expect(result).toContain("Витрати:");
    expect(result).toContain("Баланс:");
    expect(result).toContain("Транзакцій:");
  });

  it("reports 0 income/expense for empty cache", () => {
    const result = exportReport({ name: "export_report", input: {} }) as string;
    expect(result).toContain("Дохід: 0 грн");
    expect(result).toContain("Витрати: 0 грн");
    expect(result).toContain("Баланс: 0 грн");
  });

  it("sums expenses (negative amounts)", () => {
    seedMirror([
      { id: "t1", amount: -5000, time: TX_EPOCH_SEC },
      { id: "t2", amount: -3000, time: TX_EPOCH_SEC },
    ]);
    const result = exportReport({
      name: "export_report",
      input: { period: "week" },
    }) as string;
    expect(result).toContain("Витрати: 80 грн");
  });

  it("sums income (positive amounts)", () => {
    seedMirror([{ id: "t3", amount: 10000, time: TX_EPOCH_SEC }]);
    const result = exportReport({
      name: "export_report",
      input: { period: "week" },
    }) as string;
    expect(result).toContain("Дохід: 100 грн");
  });

  it("excludes hidden transactions", () => {
    mockGetCached.mockReturnValue({
      hiddenTransactions: ["t_hidden"],
    } as unknown as ReturnType<typeof getCachedFinykSqliteState>);
    seedMirror([
      { id: "t_hidden", amount: -20000, time: TX_EPOCH_SEC },
      { id: "t_visible", amount: -5000, time: TX_EPOCH_SEC },
    ]);
    const result = exportReport({
      name: "export_report",
      input: { period: "week" },
    }) as string;
    expect(result).toContain("Транзакцій: 1");
  });

  it("uses current month range by default", () => {
    const result = exportReport({ name: "export_report", input: {} }) as string;
    const year = new Date().getFullYear().toString();
    expect(result).toContain(year);
  });

  it("accepts custom period with from/to dates", () => {
    seedMirror([]);
    const result = exportReport({
      name: "export_report",
      input: { period: "custom", from: "2026-04-01", to: "2026-04-30" },
    }) as string;
    expect(result).toContain("Звіт за");
  });

  it("shows correct counts in Транзакцій line", () => {
    seedMirror([
      { id: "t1", amount: -1000, time: TX_EPOCH_SEC },
      { id: "t2", amount: 500, time: TX_EPOCH_SEC },
    ]);
    const result = exportReport({
      name: "export_report",
      input: { period: "week" },
    }) as string;
    expect(result).toContain("Транзакцій: 2 (витрат: 1, доходів: 1)");
  });
});
