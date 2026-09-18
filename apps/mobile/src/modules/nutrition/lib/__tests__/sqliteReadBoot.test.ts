const mockGetSqliteMigrationClient = jest.fn();
const mockMigrateNutrition = jest.fn();
const mockImportNutritionResidualFromMmkv = jest.fn();
const mockRefreshNutritionSqliteState = jest.fn();

jest.mock("@/core/db/sqlite", () => ({
  getSqliteMigrationClient: (...args: unknown[]) =>
    mockGetSqliteMigrationClient(...args),
}));

jest.mock("../clientMigrate", () => ({
  migrateNutrition: (...args: unknown[]) => mockMigrateNutrition(...args),
}));

jest.mock("../residualImport", () => ({
  importNutritionResidualFromMmkv: (...args: unknown[]) =>
    mockImportNutritionResidualFromMmkv(...args),
}));

jest.mock("../sqliteReader", () => ({
  refreshNutritionSqliteState: (...args: unknown[]) =>
    mockRefreshNutritionSqliteState(...args),
}));

import { bootNutritionSqliteReadPath } from "../sqliteReadBoot";

describe("bootNutritionSqliteReadPath", () => {
  beforeEach(() => {
    mockGetSqliteMigrationClient.mockReset();
    mockMigrateNutrition.mockReset();
    mockImportNutritionResidualFromMmkv.mockReset();
    mockRefreshNutritionSqliteState.mockReset();
  });

  it("skips without a user id", async () => {
    await expect(bootNutritionSqliteReadPath(null)).resolves.toBe(false);

    expect(mockGetSqliteMigrationClient).not.toHaveBeenCalled();
  });

  it("migrates, drains residual MMKV data, and refreshes cache", async () => {
    const client = { all: jest.fn() };
    mockGetSqliteMigrationClient.mockResolvedValue(client);
    mockMigrateNutrition.mockResolvedValue(undefined);
    mockImportNutritionResidualFromMmkv.mockResolvedValue({
      imported: true,
      cleaned: true,
    });
    mockRefreshNutritionSqliteState.mockResolvedValue({});

    await expect(bootNutritionSqliteReadPath("user-1")).resolves.toBe(true);

    expect(mockMigrateNutrition).toHaveBeenCalledWith(client);
    expect(mockImportNutritionResidualFromMmkv).toHaveBeenCalledWith(
      client,
      "user-1",
    );
    expect(mockRefreshNutritionSqliteState).toHaveBeenCalledWith(
      client,
      "user-1",
    );
  });

  it("fails soft when any boot step throws", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockGetSqliteMigrationClient.mockRejectedValue(new Error("sqlite down"));

    await expect(bootNutritionSqliteReadPath("user-1")).resolves.toBe(false);

    expect(warn).toHaveBeenCalledWith(
      "[nutrition.sqliteRead] boot failed, falling back to MMKV",
      "sqlite down",
    );
    warn.mockRestore();
  });
});
