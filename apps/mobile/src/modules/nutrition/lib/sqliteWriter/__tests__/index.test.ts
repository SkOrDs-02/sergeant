const mockApplyNutritionDualWriteOps = jest.fn();
const mockDiffNutritionDualWriteOps = jest.fn();
const mockRefreshNutritionSqliteState = jest.fn();
const mockNotifyNutritionSqliteCacheRefresh = jest.fn();

jest.mock("../adapter", () => ({
  applyNutritionDualWriteOps: (...args: unknown[]) =>
    mockApplyNutritionDualWriteOps(...args),
}));

jest.mock("../diff", () => ({
  diffNutritionDualWriteOps: (...args: unknown[]) =>
    mockDiffNutritionDualWriteOps(...args),
}));

jest.mock("../../sqliteReader", () => ({
  refreshNutritionSqliteState: (...args: unknown[]) =>
    mockRefreshNutritionSqliteState(...args),
}));

jest.mock("../../sqliteReadGate", () => ({
  notifyNutritionSqliteCacheRefresh: (...args: unknown[]) =>
    mockNotifyNutritionSqliteCacheRefresh(...args),
}));

import {
  __clearNutritionDualWriteContextForTests,
  dualWriteNutritionState,
  isNutritionDualWriteRegistered,
  registerNutritionDualWriteContext,
  triggerNutritionDualWrite,
} from "../index";

const prevState = {
  meals: [],
  pantries: [],
  prefs: null,
  recipes: [],
  waterLog: {},
  shoppingList: null,
};
const nextState = {
  ...prevState,
  waterLog: { "2026-05-04": 250 },
};

describe("nutrition sqliteWriter orchestrator", () => {
  beforeEach(() => {
    __clearNutritionDualWriteContextForTests();
    mockApplyNutritionDualWriteOps.mockReset();
    mockDiffNutritionDualWriteOps.mockReset();
    mockRefreshNutritionSqliteState.mockReset();
    mockNotifyNutritionSqliteCacheRefresh.mockReset();
  });

  it("registers a context and unregisters only the active handle", () => {
    const first = { getUserId: () => "u1" } as never;
    const second = { getUserId: () => "u2" } as never;

    const teardownFirst = registerNutritionDualWriteContext(first);
    const teardownSecond = registerNutritionDualWriteContext(second);

    expect(isNutritionDualWriteRegistered()).toBe(true);
    teardownFirst();
    expect(isNutritionDualWriteRegistered()).toBe(true);
    teardownSecond();
    expect(isNutritionDualWriteRegistered()).toBe(false);
  });

  it("skips when no context or no diff operations exist", async () => {
    await expect(
      dualWriteNutritionState(prevState, nextState),
    ).resolves.toEqual({ status: "skipped", reason: "context-unset" });

    registerNutritionDualWriteContext({
      getUserId: () => "user-1",
      getMigrationClient: async () => ({}) as never,
      getNow: () => "2026-05-04T00:00:00.000Z",
    });
    mockDiffNutritionDualWriteOps.mockReturnValue([]);

    await expect(
      dualWriteNutritionState(prevState, nextState),
    ).resolves.toEqual({ status: "skipped", reason: "no-ops" });
  });

  it("skips and logs when user or sqlite client is unavailable", async () => {
    const logger = jest.fn();
    mockDiffNutritionDualWriteOps.mockReturnValue([{ kind: "water" }]);
    registerNutritionDualWriteContext({
      getUserId: () => null,
      getMigrationClient: async () => ({}) as never,
      getNow: () => "2026-05-04T00:00:00.000Z",
      logger,
    });

    await expect(
      dualWriteNutritionState(prevState, nextState),
    ).resolves.toEqual({ status: "skipped", reason: "user-id-missing" });
    expect(logger).toHaveBeenCalledWith(
      "warn",
      "dual-write skipped: user id unavailable",
      { ops: 1 },
    );

    __clearNutritionDualWriteContextForTests();
    registerNutritionDualWriteContext({
      getUserId: () => "user-1",
      getMigrationClient: async () => null,
      getNow: () => "2026-05-04T00:00:00.000Z",
      logger,
    });

    await expect(
      dualWriteNutritionState(prevState, nextState),
    ).resolves.toEqual({ status: "skipped", reason: "sqlite-unavailable" });
  });

  it("applies ops, refreshes the warm cache, and notifies readers", async () => {
    const logger = jest.fn();
    const client = { all: jest.fn(), exec: jest.fn(), run: jest.fn() };
    const result = { applied: 2 };
    mockDiffNutritionDualWriteOps.mockReturnValue([{ kind: "water" }]);
    mockApplyNutritionDualWriteOps.mockResolvedValue(result);
    mockRefreshNutritionSqliteState.mockResolvedValue({});
    registerNutritionDualWriteContext({
      getUserId: () => "user-1",
      getMigrationClient: async () => client,
      getNow: () => "2026-05-04T00:00:00.000Z",
      logger,
    });

    await expect(
      dualWriteNutritionState(prevState, nextState),
    ).resolves.toEqual({ status: "applied", result });

    expect(mockApplyNutritionDualWriteOps).toHaveBeenCalledWith(
      client,
      [{ kind: "water" }],
      {
        userId: "user-1",
        clientTs: "2026-05-04T00:00:00.000Z",
        logger,
      },
    );
    expect(mockRefreshNutritionSqliteState).toHaveBeenCalledWith(
      client,
      "user-1",
    );
    expect(mockNotifyNutritionSqliteCacheRefresh).toHaveBeenCalledTimes(1);
  });

  it("keeps applied outcome when cache refresh fails", async () => {
    const logger = jest.fn();
    mockDiffNutritionDualWriteOps.mockReturnValue([{ kind: "water" }]);
    mockApplyNutritionDualWriteOps.mockResolvedValue({ applied: 1 });
    mockRefreshNutritionSqliteState.mockRejectedValue(new Error("refresh"));
    registerNutritionDualWriteContext({
      getUserId: () => "user-1",
      getMigrationClient: async () => ({}) as never,
      getNow: () => "2026-05-04T00:00:00.000Z",
      logger,
    });

    await expect(
      dualWriteNutritionState(prevState, nextState),
    ).resolves.toMatchObject({ status: "applied" });

    expect(logger).toHaveBeenCalledWith(
      "warn",
      "dual-write cache-refresh failed",
      { error: "refresh" },
    );
    expect(mockNotifyNutritionSqliteCacheRefresh).not.toHaveBeenCalled();
  });

  it("queues triggerNutritionDualWrite in a microtask", async () => {
    mockDiffNutritionDualWriteOps.mockReturnValue([{ kind: "water" }]);
    mockApplyNutritionDualWriteOps.mockResolvedValue({ applied: 1 });
    mockRefreshNutritionSqliteState.mockResolvedValue({});
    registerNutritionDualWriteContext({
      getUserId: () => "user-1",
      getMigrationClient: async () => ({}) as never,
      getNow: () => "2026-05-04T00:00:00.000Z",
    });

    triggerNutritionDualWrite(prevState, nextState);
    expect(mockApplyNutritionDualWriteOps).not.toHaveBeenCalled();

    await Promise.resolve();
    await Promise.resolve();

    expect(mockApplyNutritionDualWriteOps).toHaveBeenCalledTimes(1);
  });
});
