/**
 * Boot-wiring unit tests for the mobile routine dual-write context.
 *
 * Mirror of `apps/web/src/modules/routine/lib/__tests__/dualWriteBoot.test.ts`.
 * Mobile uses Jest, hence the `jest.mock` shape and slightly different
 * mock-capture pattern.
 */

const mockRegister = jest.fn();
const mockGetSqliteMigrationClient = jest.fn();
const mockMigrationClient = { __label: "migration-client" };

jest.mock("../dualWrite", () => ({
  registerRoutineDualWriteContext: (ctx: unknown) => mockRegister(ctx),
}));

jest.mock("@/core/db/sqlite", () => ({
  getSqliteMigrationClient: (...args: unknown[]) =>
    mockGetSqliteMigrationClient(...args),
}));

import { bootRoutineDualWrite } from "../dualWriteBoot";

beforeEach(() => {
  mockRegister.mockReset();
  mockGetSqliteMigrationClient.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("bootRoutineDualWrite (mobile)", () => {
  it("registers a single context and forwards getUserId", () => {
    const teardown = jest.fn();
    mockRegister.mockReturnValue(teardown);

    const getUserId = jest.fn(() => "user-1");

    const result = bootRoutineDualWrite({ getUserId });

    expect(mockRegister).toHaveBeenCalledTimes(1);
    expect(result).toBe(teardown);

    const ctx = mockRegister.mock.calls[0][0] as {
      getUserId(): string | null;
    };
    expect(ctx.getUserId()).toBe("user-1");
    expect(getUserId).toHaveBeenCalledTimes(1);
  });

  it("Stage 8 PR #056r: registered context has no isEnabled/isFlagEnabled callback", () => {
    mockRegister.mockReturnValue(() => {});

    bootRoutineDualWrite({ getUserId: () => "u" });

    const ctx = mockRegister.mock.calls[0][0] as Record<string, unknown>;
    expect(ctx).not.toHaveProperty("isEnabled");
    expect(ctx).not.toHaveProperty("isFlagEnabled");
  });

  it("getMigrationClient resolves via getSqliteMigrationClient()", async () => {
    mockRegister.mockReturnValue(() => {});
    mockGetSqliteMigrationClient.mockResolvedValue(mockMigrationClient);

    bootRoutineDualWrite({
      getUserId: () => "u",
    });

    const ctx = mockRegister.mock.calls[0][0] as {
      getMigrationClient(): Promise<unknown>;
    };
    await expect(ctx.getMigrationClient()).resolves.toBe(mockMigrationClient);
    expect(mockGetSqliteMigrationClient).toHaveBeenCalledTimes(1);
  });

  it("getNow returns a fresh ISO timestamp", () => {
    mockRegister.mockReturnValue(() => {});
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-05-03T12:00:00.000Z"));

    bootRoutineDualWrite({
      getUserId: () => "u",
    });
    const ctx = mockRegister.mock.calls[0][0] as { getNow(): string };
    expect(ctx.getNow()).toBe("2026-05-03T12:00:00.000Z");
  });
});
