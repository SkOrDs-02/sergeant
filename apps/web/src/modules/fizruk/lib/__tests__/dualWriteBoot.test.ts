/**
 * Boot-wiring unit tests for the web Fizruk dual-write context.
 *
 * Mirror of `apps/web/src/modules/routine/lib/__tests__/dualWriteBoot.test.ts`.
 * See that file for the rationale.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRegister = vi.fn();
const mockGetSqliteDb = vi.fn();
const mockMigrationClient = { __label: "migration-client" };

vi.mock("../dualWrite/index.js", () => ({
  registerFizrukDualWriteContext: (ctx: unknown) => mockRegister(ctx),
}));

vi.mock("../../../../core/db/sqlite.js", () => ({
  getSqliteDb: () => mockGetSqliteDb(),
}));

import { bootFizrukDualWrite } from "../dualWriteBoot.js";

beforeEach(() => {
  mockRegister.mockReset();
  mockGetSqliteDb.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("bootFizrukDualWrite (web)", () => {
  it("registers a single context and forwards getUserId", () => {
    const teardown = vi.fn();
    mockRegister.mockReturnValue(teardown);

    const getUserId = vi.fn(() => "user-1");

    const result = bootFizrukDualWrite({ getUserId });

    expect(mockRegister).toHaveBeenCalledTimes(1);
    expect(result).toBe(teardown);

    const ctx = mockRegister.mock.calls[0]![0] as {
      getUserId(): string | null;
    };
    expect(ctx.getUserId()).toBe("user-1");
    expect(getUserId).toHaveBeenCalledTimes(1);
  });

  it("Stage 8 PR #056f drop: registered context exposes no isEnabled gate", () => {
    mockRegister.mockReturnValue(() => {});
    bootFizrukDualWrite({ getUserId: () => "u" });
    const ctx = mockRegister.mock.calls[0]![0] as Record<string, unknown>;
    expect("isEnabled" in ctx).toBe(false);
  });

  it("getMigrationClient resolves via getSqliteDb().migrationClient()", async () => {
    mockRegister.mockReturnValue(() => {});
    mockGetSqliteDb.mockResolvedValue({
      migrationClient: () => mockMigrationClient,
    });

    bootFizrukDualWrite({ getUserId: () => "u" });

    const ctx = mockRegister.mock.calls[0]![0] as {
      getMigrationClient(): Promise<unknown>;
    };
    await expect(ctx.getMigrationClient()).resolves.toBe(mockMigrationClient);
    expect(mockGetSqliteDb).toHaveBeenCalledTimes(1);
  });

  it("getNow returns a fresh ISO timestamp", () => {
    mockRegister.mockReturnValue(() => {});
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-03T12:00:00.000Z"));

    bootFizrukDualWrite({ getUserId: () => "u" });
    const ctx = mockRegister.mock.calls[0]![0] as { getNow(): string };
    expect(ctx.getNow()).toBe("2026-05-03T12:00:00.000Z");
  });
});
