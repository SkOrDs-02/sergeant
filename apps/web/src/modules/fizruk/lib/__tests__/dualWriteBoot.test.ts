/**
 * Boot-wiring unit tests for the web Fizruk dual-write context.
 *
 * Mirror of `apps/web/src/modules/routine/lib/__tests__/dualWriteBoot.test.ts`.
 * See that file for the rationale.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRegister = vi.fn();
const mockGetSqliteDb = vi.fn();
const mockMigrate = vi.fn(async (..._args: unknown[]) => undefined);
const mockMigrationClient = { __label: "migration-client" };

vi.mock("../sqliteWriter/index.js", () => ({
  registerFizrukDualWriteContext: (ctx: unknown) => mockRegister(ctx),
}));

vi.mock("../../../../core/db/sqlite.js", () => ({
  getSqliteDb: () => mockGetSqliteDb(),
}));

vi.mock("../clientMigrate.js", () => ({
  migrateFizruk: (...args: unknown[]) => mockMigrate(...args),
}));

import {
  bootFizrukDualWrite,
  __resetFizrukDualWriteBootForTests,
} from "../dualWriteBoot.js";

beforeEach(() => {
  mockRegister.mockReset();
  mockGetSqliteDb.mockReset();
  mockMigrate.mockClear();
  __resetFizrukDualWriteBootForTests();
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

  // Раніше тест перевіряв лише, що клієнт доїжджає з `getSqliteDb()`. Клієнт —
  // це З'ЄДНАННЯ, а не готова схема: таблиці створює асинхронний read-boot, і
  // на базі в OPFS перший запис може його випередити (`no such table`). У
  // `routine` це вже коштувало тихої втрати щойно створеної звички; тут те
  // саме місце, тож гейт теж на порядок, а не на факт.
  it("прогонить міграції ПЕРЕД тим, як віддати клієнта на перший запис", async () => {
    mockRegister.mockReturnValue(() => {});
    mockGetSqliteDb.mockResolvedValue({
      migrationClient: () => mockMigrationClient,
    });

    bootFizrukDualWrite({ getUserId: () => "u" });

    const ctx = mockRegister.mock.calls[0]![0] as {
      getMigrationClient(): Promise<unknown>;
    };
    await expect(ctx.getMigrationClient()).resolves.toBe(mockMigrationClient);
    expect(mockMigrate).toHaveBeenCalledWith(mockMigrationClient);
    expect(mockGetSqliteDb).toHaveBeenCalledTimes(1);
  });

  it("прогонить міграції рівно раз на кілька записів", async () => {
    mockRegister.mockReturnValue(() => {});
    mockGetSqliteDb.mockResolvedValue({
      migrationClient: () => mockMigrationClient,
    });

    bootFizrukDualWrite({ getUserId: () => "u" });
    const ctx = mockRegister.mock.calls[0]![0] as {
      getMigrationClient(): Promise<unknown>;
    };
    await ctx.getMigrationClient();
    await ctx.getMigrationClient();

    expect(mockMigrate).toHaveBeenCalledTimes(1);
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
