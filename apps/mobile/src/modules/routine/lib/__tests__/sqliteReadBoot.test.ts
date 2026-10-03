const mockGetSqliteMigrationClient = jest.fn();
const mockMigrateRoutine = jest.fn();
const mockImportResidual = jest.fn();
const mockRefreshCompletions = jest.fn();
const mockRefreshRoutineState = jest.fn();

jest.mock("@/core/db/sqlite", () => ({
  getSqliteMigrationClient: (...args: unknown[]) =>
    mockGetSqliteMigrationClient(...args),
}));

jest.mock("../clientMigrate", () => ({
  migrateRoutine: (...args: unknown[]) => mockMigrateRoutine(...args),
}));

jest.mock("../residualImport", () => ({
  importRoutineResidualFromMmkv: (...args: unknown[]) =>
    mockImportResidual(...args),
}));

jest.mock("../sqliteReader", () => ({
  refreshSqliteCompletions: (...args: unknown[]) =>
    mockRefreshCompletions(...args),
  refreshSqliteRoutineState: (...args: unknown[]) =>
    mockRefreshRoutineState(...args),
}));

import { bootRoutineSqliteReadPath } from "../sqliteReadBoot";

const mockClient = { __label: "sqlite-client" };

beforeEach(() => {
  mockGetSqliteMigrationClient.mockReset();
  mockMigrateRoutine.mockReset();
  mockImportResidual.mockReset();
  mockRefreshCompletions.mockReset();
  mockRefreshRoutineState.mockReset();
  mockGetSqliteMigrationClient.mockResolvedValue(mockClient);
  mockMigrateRoutine.mockResolvedValue(undefined);
  mockImportResidual.mockResolvedValue(undefined);
  mockRefreshCompletions.mockResolvedValue(undefined);
  mockRefreshRoutineState.mockResolvedValue(undefined);
});

describe("bootRoutineSqliteReadPath (mobile)", () => {
  it("skips boot when the user id is missing", async () => {
    await expect(bootRoutineSqliteReadPath(null)).resolves.toBe(false);

    expect(mockGetSqliteMigrationClient).not.toHaveBeenCalled();
    expect(mockMigrateRoutine).not.toHaveBeenCalled();
  });

  it("migrates, drains residual MMKV, and warms both routine caches", async () => {
    await expect(bootRoutineSqliteReadPath("user-1")).resolves.toBe(true);

    expect(mockGetSqliteMigrationClient).toHaveBeenCalledTimes(1);
    expect(mockMigrateRoutine).toHaveBeenCalledWith(mockClient);
    expect(mockImportResidual).toHaveBeenCalledWith(mockClient, "user-1");
    expect(mockRefreshCompletions).toHaveBeenCalledWith(mockClient, "user-1");
    expect(mockRefreshRoutineState).toHaveBeenCalledWith(mockClient, "user-1");
  });

  it("fails soft and returns false when any boot step throws", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockRefreshRoutineState.mockRejectedValueOnce(new Error("cache failed"));

    await expect(bootRoutineSqliteReadPath("user-1")).resolves.toBe(false);

    expect(warn).toHaveBeenCalledWith(
      "[routine.sqliteRead] boot failed, falling back to MMKV",
      "cache failed",
    );
    warn.mockRestore();
  });
});
