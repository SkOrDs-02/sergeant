import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../hubChatUtils", () => ({ ls: vi.fn() }));
vi.mock("../../../../modules/finyk/utils", () => ({
  getTxStatAmount: vi.fn((t: { amount: number }) => Math.abs(t.amount) / 100),
}));
vi.mock("../../../../modules/finyk/lib/sqliteReader", () => ({
  getCachedFinykSqliteState: vi.fn(),
}));
vi.mock("../../../../modules/finyk/lib/monoMirrorReader", () => {
  // Продакшн-код читає visible-геттер; інстанс мока один на обидва імені.
  const shared = vi.fn();
  return {
    getCachedFinykMonoMirrorState: shared,
    getVisibleFinykMonoMirrorState: shared,
  };
});

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
    expect(result).toContain("Операцій:");
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
    expect(result).toContain("Операцій: 1");
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

  it("shows correct counts in Операцій line", () => {
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
    expect(result).toContain("Операцій: 2 (витрат: 1, доходів: 1)");
  });
});

// Власний діапазон `custom` ріжеться за КИЇВСЬКИМИ добами, а не за годинником
// пристрою (гроші, ADR-0078; рішення власника 2026-10-01): від 00:00 дня `from`
// до 23:59:59.999 дня `to` за Києвом. `new Date("…T00:00:00")` читав би їх за
// пристроєм, тож межа й підпис «Звіт за …» (він у Києві) розходились на
// пристрої поза Києвом. Пояс перемикається прямо в тесті (Node перечитує
// `process.env.TZ` на льоту); квітень 2026: Київ = UTC+3.
describe("exportReport: власний діапазон — київські доби", () => {
  const ORIGINAL_TZ = process.env["TZ"];
  const sec = (iso: string) => Math.floor(Date.parse(iso) / 1000);

  afterEach(() => {
    if (ORIGINAL_TZ === undefined) delete process.env["TZ"];
    else process.env["TZ"] = ORIGINAL_TZ;
  });

  const TXS = [
    // 31.03 23:30 Київ — до діапазону. У Токіо (00:00 JST = 31.03 15:00Z)
    // стара межа брала її всередину.
    { id: "before", amount: -10_000, time: sec("2026-03-31T20:30:00Z") },
    // 01.04 00:30 Київ — перша доба. У Нью-Йорку (00:00 EDT = 01.04 04:00Z)
    // стара межа її губила.
    { id: "first", amount: -20_000, time: sec("2026-03-31T21:30:00Z") },
    // 30.04 23:30 Київ — остання доба. У Токіо (кінець = 30.04 14:59Z) стара
    // межа її губила.
    { id: "last", amount: -40_000, time: sec("2026-04-30T20:30:00Z") },
    // 01.05 00:30 Київ — після діапазону. У Нью-Йорку (кінець = 01.05
    // 03:59Z) стара межа брала її всередину.
    { id: "after", amount: -80_000, time: sec("2026-04-30T21:30:00Z") },
  ];

  it.each(["Europe/Kyiv", "UTC", "America/New_York", "Asia/Tokyo"])(
    "пристрій %s: 01.04–30.04 — це 200 + 400 грн і підпис 01.04 – 30.04",
    (tz) => {
      process.env["TZ"] = tz;
      mockGetMirror.mockReturnValue({
        transactions: TXS as never,
        accounts: [],
        refreshedAt: "2026-05-01T00:00:00.000Z",
      });
      const result = exportReport({
        name: "export_report",
        input: { period: "custom", from: "2026-04-01", to: "2026-04-30" },
      }) as string;
      expect(result, `пояс пристрою: ${tz}`).toContain("Витрати: 600 грн");
      expect(result, `пояс пристрою: ${tz}`).toContain("Операцій: 2");
      expect(result, `пояс пристрою: ${tz}`).toMatch(
        /01\.04\.2026.*30\.04\.2026/,
      );
    },
  );
});
