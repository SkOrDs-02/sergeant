import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  applyFinykDualWriteOps: vi.fn(async () => ({ applied: 1 })),
  getFinykDualWriteRuntime: vi.fn(),
}));

vi.mock("./adapter.js", () => ({
  applyFinykDualWriteOps: hoisted.applyFinykDualWriteOps,
}));
vi.mock("./index.js", () => ({
  getFinykDualWriteRuntime: hoisted.getFinykDualWriteRuntime,
}));
vi.mock("../../../../core/observability/dualWriteTelemetry.js", () => ({
  recordDualWriteOutcome: vi.fn(),
  recordReadFallback: vi.fn(),
}));
vi.mock("../sqliteReadGate.js", () => ({
  notifyFinykSqliteCacheRefresh: vi.fn(),
}));

import {
  __setFinykSqliteStateCacheForTests,
  clearFinykSqliteCache,
} from "../sqliteReader";
import {
  mirrorFinykChatDualWrite,
  mirrorFinykChatMonthlyPlan,
} from "./chatBridge";
import { blobsFromArray, stateWithSlice } from "./extract";

beforeEach(() => {
  vi.clearAllMocks();
  clearFinykSqliteCache();
  hoisted.getFinykDualWriteRuntime.mockReturnValue({
    userId: "u1",
    getMigrationClient: async () => ({}),
    getNow: () => "2026-10-01T00:00:00.000Z",
  });
});
afterEach(() => clearFinykSqliteCache());

function prefsOps() {
  const calls = hoisted.applyFinykDualWriteOps.mock.calls as unknown as Array<
    [unknown, Array<{ kind: string; prefs?: Record<string, unknown> }>]
  >;
  return calls.flatMap(([, ops]) => ops);
}

describe("mirrorFinykChatMonthlyPlan (data-08)", () => {
  it("пише ПОВНИЙ змерджений план і зберігає решту канонічних prefs", async () => {
    // Кеш уже оптимістично пропатчений новим планом (як робить міст), тож
    // база для diff-а мусить прийти зі знімка prev, інакше апсерт зникне.
    __setFinykSqliteStateCacheForTests({
      monthlyPlan: { income: "60000", expense: "30000", savings: "10000" },
      showBalance: false,
      excludedStatTxIds: ["tx9"],
      dismissedRecurring: ["rec1"],
    });
    await mirrorFinykChatMonthlyPlan(
      JSON.stringify({ income: "60000", expense: "30000", savings: "10000" }),
      JSON.stringify({ income: "50000", expense: "30000", savings: "10000" }),
    );
    const [op] = prefsOps();
    expect(op?.kind).toBe("prefs-upsert");
    expect(JSON.parse(String(op?.prefs?.["monthlyPlanJson"]))).toEqual({
      income: "60000",
      expense: "30000",
      savings: "10000",
    });
    // Решта канонічних полів prefs не обнулена дефолтами.
    expect(op?.prefs?.["showBalance"]).toBe(false);
    expect(op?.prefs?.["excludedStatTxIdsJson"]).toBe('["tx9"]');
    expect(op?.prefs?.["dismissedRecurringJson"]).toBe('["rec1"]');
  });

  it("без prevMonthlyPlanJson база береться з кешу (сумісність)", async () => {
    __setFinykSqliteStateCacheForTests({
      monthlyPlan: { income: "1" } as never,
    });
    await mirrorFinykChatMonthlyPlan(JSON.stringify({ income: "2" }));
    expect(prefsOps()).toHaveLength(1);
  });

  it("план не змінився -> нічого не пишеться", async () => {
    __setFinykSqliteStateCacheForTests({});
    await mirrorFinykChatMonthlyPlan(
      JSON.stringify({ income: "1" }),
      JSON.stringify({ income: "1" }),
    );
    expect(hoisted.applyFinykDualWriteOps).not.toHaveBeenCalled();
  });
});

// rel-16: міст віддає чесне «ліг у SQLite», а не тихий no-op.
describe("підтвердження запису (rel-16)", () => {
  const debtsDiff = () =>
    [
      stateWithSlice("debts", blobsFromArray([])),
      stateWithSlice("debts", blobsFromArray([{ id: "d1", name: "Борг" }])),
    ] as const;

  it("false, коли dual-write runtime не зареєстровано", async () => {
    hoisted.getFinykDualWriteRuntime.mockReturnValue(null);
    await expect(mirrorFinykChatDualWrite(...debtsDiff())).resolves.toBe(false);
    await expect(
      mirrorFinykChatMonthlyPlan(JSON.stringify({ income: "2" }), "{}"),
    ).resolves.toBe(false);
    expect(hoisted.applyFinykDualWriteOps).not.toHaveBeenCalled();
  });

  it("false, коли SQLite-клієнт недоступний", async () => {
    hoisted.getFinykDualWriteRuntime.mockReturnValue({
      userId: "u1",
      getMigrationClient: async () => null,
      getNow: () => "2026-10-01T00:00:00.000Z",
    });
    await expect(mirrorFinykChatDualWrite(...debtsDiff())).resolves.toBe(false);
  });

  it("false, коли apply кинув або повернув errored > 0", async () => {
    hoisted.applyFinykDualWriteOps.mockRejectedValueOnce(new Error("boom"));
    await expect(mirrorFinykChatDualWrite(...debtsDiff())).resolves.toBe(false);
    hoisted.applyFinykDualWriteOps.mockResolvedValueOnce({
      applied: 0,
      errored: 1,
    } as never);
    await expect(mirrorFinykChatDualWrite(...debtsDiff())).resolves.toBe(false);
  });

  it("true після вдалого apply і для порожнього diff", async () => {
    await expect(mirrorFinykChatDualWrite(...debtsDiff())).resolves.toBe(true);
    const same = stateWithSlice("debts", blobsFromArray([]));
    await expect(mirrorFinykChatDualWrite(same, same)).resolves.toBe(true);
  });
});
