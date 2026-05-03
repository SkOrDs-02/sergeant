/**
 * Boot-wiring unit tests for the mobile Nutrition dual-write context.
 *
 * Mirror of `apps/mobile/src/modules/fizruk/lib/__tests__/dualWriteBoot.test.ts`.
 */

const mockRegister = jest.fn();
const mockGetSqliteMigrationClient = jest.fn();
const mockMigrate = jest.fn();
const mockMigrationClient = { __label: "migration-client" };

jest.mock("../dualWrite", () => ({
  registerNutritionDualWriteContext: (ctx: unknown) => mockRegister(ctx),
}));

jest.mock("@/core/db/sqlite", () => ({
  getSqliteMigrationClient: (...args: unknown[]) =>
    mockGetSqliteMigrationClient(...args),
}));

jest.mock("../clientMigrate", () => ({
  migrateNutrition: (...args: unknown[]) => mockMigrate(...args),
}));

import {
  bootNutritionDualWrite,
  __resetNutritionDualWriteBootForTests,
} from "../dualWriteBoot";

beforeEach(() => {
  mockRegister.mockReset();
  mockGetSqliteMigrationClient.mockReset();
  mockMigrate.mockReset();
  __resetNutritionDualWriteBootForTests();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("bootNutritionDualWrite (mobile)", () => {
  it("registers a single context and forwards getUserId/isFlagEnabled", () => {
    const teardown = jest.fn();
    mockRegister.mockReturnValue(teardown);

    const getUserId = jest.fn(() => "user-1");
    const isFlagEnabled = jest.fn(() => true);

    const result = bootNutritionDualWrite({ getUserId, isFlagEnabled });

    expect(mockRegister).toHaveBeenCalledTimes(1);
    expect(result).toBe(teardown);

    const ctx = mockRegister.mock.calls[0][0] as {
      isEnabled(): boolean;
      getUserId(): string | null;
    };
    expect(ctx.isEnabled()).toBe(true);
    expect(isFlagEnabled).toHaveBeenCalledTimes(1);
    expect(ctx.getUserId()).toBe("user-1");
    expect(getUserId).toHaveBeenCalledTimes(1);
  });

  it("reads the live flag value on every isEnabled() call", () => {
    mockRegister.mockReturnValue(() => {});
    let live = false;
    bootNutritionDualWrite({
      getUserId: () => "u",
      isFlagEnabled: () => live,
    });
    const ctx = mockRegister.mock.calls[0][0] as { isEnabled(): boolean };
    expect(ctx.isEnabled()).toBe(false);
    live = true;
    expect(ctx.isEnabled()).toBe(true);
  });

  it("getMigrationClient resolves via getSqliteMigrationClient and runs migrations once", async () => {
    mockRegister.mockReturnValue(() => {});
    mockGetSqliteMigrationClient.mockResolvedValue(mockMigrationClient);
    mockMigrate.mockResolvedValue(undefined);

    bootNutritionDualWrite({
      getUserId: () => "u",
      isFlagEnabled: () => true,
    });

    const ctx = mockRegister.mock.calls[0][0] as {
      getMigrationClient(): Promise<unknown>;
    };
    await expect(ctx.getMigrationClient()).resolves.toBe(mockMigrationClient);
    await expect(ctx.getMigrationClient()).resolves.toBe(mockMigrationClient);
    expect(mockMigrate).toHaveBeenCalledTimes(1);
    expect(mockMigrate).toHaveBeenCalledWith(mockMigrationClient);
  });

  it("getNow returns a fresh ISO timestamp", () => {
    mockRegister.mockReturnValue(() => {});
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-05-03T12:00:00.000Z"));

    bootNutritionDualWrite({
      getUserId: () => "u",
      isFlagEnabled: () => true,
    });
    const ctx = mockRegister.mock.calls[0][0] as { getNow(): string };
    expect(ctx.getNow()).toBe("2026-05-03T12:00:00.000Z");
  });
});
