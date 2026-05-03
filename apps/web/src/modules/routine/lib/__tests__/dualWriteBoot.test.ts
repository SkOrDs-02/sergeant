/**
 * Boot-wiring unit tests for the web routine dual-write context.
 *
 * Covers PR #024 follow-up: `bootRoutineDualWrite()` is supposed to
 * be called from `RoutineApp` (via `useRoutineDualWriteBoot`) and
 * install a context whose resolvers read live values from the React
 * layer. The integration test under `dualWrite/__tests__/integration.test.ts`
 * already exercises the orchestrator end-to-end with a real test
 * SQLite — these tests focus on the boot helper's contract:
 *
 *  - `bootRoutineDualWrite` calls `registerRoutineDualWriteContext`
 *    exactly once with a context that proxies through to the input
 *    callbacks;
 *  - `getMigrationClient` resolves via `getSqliteDb()` and returns the
 *    singleton's `migrationClient()`;
 *  - `getNow()` returns an ISO timestamp;
 *  - the teardown function returned by the helper is the same one the
 *    register call returned (i.e. unregistering happens on teardown).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRegister = vi.fn();
const mockGetSqliteDb = vi.fn();
const mockMigrationClient = { __label: "migration-client" };

vi.mock("../dualWrite/index.js", () => ({
  registerRoutineDualWriteContext: (ctx: unknown) => mockRegister(ctx),
}));

vi.mock("../../../../core/db/sqlite.js", () => ({
  getSqliteDb: () => mockGetSqliteDb(),
}));

import { bootRoutineDualWrite } from "../dualWriteBoot.js";

beforeEach(() => {
  mockRegister.mockReset();
  mockGetSqliteDb.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("bootRoutineDualWrite (web)", () => {
  it("registers a single context and forwards getUserId/isFlagEnabled", () => {
    const teardown = vi.fn();
    mockRegister.mockReturnValue(teardown);

    const getUserId = vi.fn(() => "user-1");
    const isFlagEnabled = vi.fn(() => true);

    const result = bootRoutineDualWrite({ getUserId, isFlagEnabled });

    expect(mockRegister).toHaveBeenCalledTimes(1);
    expect(result).toBe(teardown);

    const ctx = mockRegister.mock.calls[0][0] as {
      isEnabled(): boolean;
      getUserId(): string | null;
      getNow(): string;
    };
    expect(ctx.isEnabled()).toBe(true);
    expect(isFlagEnabled).toHaveBeenCalledTimes(1);
    expect(ctx.getUserId()).toBe("user-1");
    expect(getUserId).toHaveBeenCalledTimes(1);
  });

  it("reads the live flag value on every isEnabled() call (no caching)", () => {
    mockRegister.mockReturnValue(() => {});
    let live = false;
    bootRoutineDualWrite({
      getUserId: () => "u",
      isFlagEnabled: () => live,
    });
    const ctx = mockRegister.mock.calls[0][0] as { isEnabled(): boolean };
    expect(ctx.isEnabled()).toBe(false);
    live = true;
    expect(ctx.isEnabled()).toBe(true);
  });

  it("getMigrationClient resolves via getSqliteDb().migrationClient()", async () => {
    mockRegister.mockReturnValue(() => {});
    mockGetSqliteDb.mockResolvedValue({
      migrationClient: () => mockMigrationClient,
    });

    bootRoutineDualWrite({
      getUserId: () => "u",
      isFlagEnabled: () => true,
    });

    const ctx = mockRegister.mock.calls[0][0] as {
      getMigrationClient(): Promise<unknown>;
    };
    await expect(ctx.getMigrationClient()).resolves.toBe(mockMigrationClient);
    expect(mockGetSqliteDb).toHaveBeenCalledTimes(1);
  });

  it("getNow returns a fresh ISO timestamp", () => {
    mockRegister.mockReturnValue(() => {});
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-03T12:00:00.000Z"));

    bootRoutineDualWrite({
      getUserId: () => "u",
      isFlagEnabled: () => true,
    });
    const ctx = mockRegister.mock.calls[0][0] as { getNow(): string };
    expect(ctx.getNow()).toBe("2026-05-03T12:00:00.000Z");
  });

  it("does NOT define a logger (default warn-to-console fallback applies)", () => {
    mockRegister.mockReturnValue(() => {});
    bootRoutineDualWrite({
      getUserId: () => "u",
      isFlagEnabled: () => true,
    });
    const ctx = mockRegister.mock.calls[0][0] as { logger?: unknown };
    expect(ctx.logger).toBeUndefined();
  });
});
