/**
 * Boot-wiring unit tests for the mobile Fizruk dual-write context.
 *
 * Mirror of `apps/mobile/src/modules/routine/lib/__tests__/dualWriteBoot.test.ts`.
 */

const mockRegister = jest.fn();
const mockGetSqliteMigrationClient = jest.fn();
const mockMigrationClient = { __label: "migration-client" };

jest.mock("../dualWrite", () => ({
  registerFizrukDualWriteContext: (ctx: unknown) => mockRegister(ctx),
}));

jest.mock("@/core/db/sqlite", () => ({
  getSqliteMigrationClient: (...args: unknown[]) =>
    mockGetSqliteMigrationClient(...args),
}));

import { bootFizrukDualWrite } from "../dualWriteBoot";

beforeEach(() => {
  mockRegister.mockReset();
  mockGetSqliteMigrationClient.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("bootFizrukDualWrite (mobile)", () => {
  it("registers a single context and forwards getUserId", () => {
    const teardown = jest.fn();
    mockRegister.mockReturnValue(teardown);

    const getUserId = jest.fn(() => "user-1");

    const result = bootFizrukDualWrite({ getUserId });

    expect(mockRegister).toHaveBeenCalledTimes(1);
    expect(result).toBe(teardown);

    const ctx = mockRegister.mock.calls[0][0] as {
      getUserId(): string | null;
    };
    expect(ctx.getUserId()).toBe("user-1");
    expect(getUserId).toHaveBeenCalledTimes(1);
  });

  it("Stage 8 PR #056f drop: registered context exposes no isEnabled gate", () => {
    mockRegister.mockReturnValue(() => {});
    bootFizrukDualWrite({ getUserId: () => "u" });
    const ctx = mockRegister.mock.calls[0][0] as Record<string, unknown>;
    expect("isEnabled" in ctx).toBe(false);
  });

  it("getMigrationClient resolves via getSqliteMigrationClient()", async () => {
    mockRegister.mockReturnValue(() => {});
    mockGetSqliteMigrationClient.mockResolvedValue(mockMigrationClient);

    bootFizrukDualWrite({ getUserId: () => "u" });

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

    bootFizrukDualWrite({ getUserId: () => "u" });
    const ctx = mockRegister.mock.calls[0][0] as { getNow(): string };
    expect(ctx.getNow()).toBe("2026-05-03T12:00:00.000Z");
  });
});
