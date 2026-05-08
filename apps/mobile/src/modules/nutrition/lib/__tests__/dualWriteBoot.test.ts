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
  it("registers a single context and forwards getUserId", () => {
    const teardown = jest.fn();
    mockRegister.mockReturnValue(teardown);

    const getUserId = jest.fn(() => "user-1");

    const result = bootNutritionDualWrite({ getUserId });

    expect(mockRegister).toHaveBeenCalledTimes(1);
    expect(result).toBe(teardown);

    const ctx = mockRegister.mock.calls[0][0] as {
      getUserId(): string | null;
    };
    expect(ctx.getUserId()).toBe("user-1");
    expect(getUserId).toHaveBeenCalledTimes(1);
  });

  it("Stage 8 PR #056n drop: registered context exposes no isEnabled gate", () => {
    mockRegister.mockReturnValue(() => {});
    bootNutritionDualWrite({ getUserId: () => "u" });
    const ctx = mockRegister.mock.calls[0][0] as Record<string, unknown>;
    expect("isEnabled" in ctx).toBe(false);
  });

  it("getMigrationClient resolves via getSqliteMigrationClient and runs migrations once", async () => {
    mockRegister.mockReturnValue(() => {});
    mockGetSqliteMigrationClient.mockResolvedValue(mockMigrationClient);
    mockMigrate.mockResolvedValue(undefined);

    bootNutritionDualWrite({
      getUserId: () => "u",
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
    });
    const ctx = mockRegister.mock.calls[0][0] as { getNow(): string };
    expect(ctx.getNow()).toBe("2026-05-03T12:00:00.000Z");
  });
});
