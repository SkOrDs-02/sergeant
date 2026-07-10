import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../hubChatUtils", () => ({ ls: vi.fn() }));
vi.mock("../../../../modules/finyk/utils", () => ({
  getTxStatAmount: vi.fn((t: { amount: number }) => Math.abs(t.amount) / 100),
}));
vi.mock("../../../../modules/finyk/lib/sqliteReader", () => ({
  getCachedFinykSqliteState: vi.fn(),
}));
vi.mock("../../../../modules/finyk/lib/monoMirrorReader", () => ({
  getCachedFinykMonoMirrorState: vi.fn(),
}));

import { ls } from "../../hubChatUtils";
import { getCachedFinykSqliteState } from "../../../../modules/finyk/lib/sqliteReader";
import { getCachedFinykMonoMirrorState } from "../../../../modules/finyk/lib/monoMirrorReader";
import { exportReport } from "./report";

const mockLs = vi.mocked(ls) as ReturnType<typeof vi.fn>;
const mockGetCached = vi.mocked(getCachedFinykSqliteState);
const mockGetMirror = vi.mocked(getCachedFinykMonoMirrorState);

// Use a timestamp within the last 7 days so "week" period filter passes
const TX_EPOCH_SEC = Math.floor((Date.now() - 3600 * 1000) / 1000);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCached.mockReturnValue({
    hiddenTransactions: [],
  } as unknown as ReturnType<typeof getCachedFinykSqliteState>);
  mockGetMirror.mockReturnValue({
    transactions: [],
    accounts: [],
    refreshedAt: null,
  });
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
    mockGetMirror.mockReturnValue({
      transactions: [
        { id: "t1", amount: -5000, time: TX_EPOCH_SEC },
        { id: "t2", amount: -3000, time: TX_EPOCH_SEC },
      ] as never,
      accounts: [],
      refreshedAt: new Date().toISOString(),
    });
    const result = exportReport({
      name: "export_report",
      input: { period: "week" },
    }) as string;
    expect(result).toContain("Витрати: 80 грн");
  });

  it("sums income (positive amounts)", () => {
    mockGetMirror.mockReturnValue({
      transactions: [{ id: "t3", amount: 10000, time: TX_EPOCH_SEC }] as never,
      accounts: [],
      refreshedAt: new Date().toISOString(),
    });
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
    mockGetMirror.mockReturnValue({
      transactions: [
        { id: "t_hidden", amount: -20000, time: TX_EPOCH_SEC },
        { id: "t_visible", amount: -5000, time: TX_EPOCH_SEC },
      ] as never,
      accounts: [],
      refreshedAt: new Date().toISOString(),
    });
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
    const result = exportReport({
      name: "export_report",
      input: { period: "custom", from: "2026-04-01", to: "2026-04-30" },
    }) as string;
    expect(result).toContain("Звіт за");
  });

  it("shows correct counts in Транзакцій line", () => {
    mockGetMirror.mockReturnValue({
      transactions: [
        { id: "t1", amount: -1000, time: TX_EPOCH_SEC },
        { id: "t2", amount: 500, time: TX_EPOCH_SEC },
      ] as never,
      accounts: [],
      refreshedAt: new Date().toISOString(),
    });
    const result = exportReport({
      name: "export_report",
      input: { period: "week" },
    }) as string;
    expect(result).toContain("Транзакцій: 2 (витрат: 1, доходів: 1)");
  });
});
