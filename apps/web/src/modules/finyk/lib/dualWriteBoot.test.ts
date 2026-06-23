import { describe, it, expect, beforeEach, vi } from "vitest";

const migrateFinyk = vi.fn(async (..._a: unknown[]) => {});
const registerFinykDualWriteContext = vi.fn((..._a: unknown[]) => () => {});
const migrationClient = { run: vi.fn() };
const getSqliteDb = vi.fn(async () => ({
  migrationClient: () => migrationClient,
}));

vi.mock("../../../core/db/sqlite.js", () => ({
  getSqliteDb: () => getSqliteDb(),
}));
vi.mock("./clientMigrate.js", () => ({
  migrateFinyk: (...a: unknown[]) => migrateFinyk(...a),
}));
vi.mock("./dualWrite/index.js", () => ({
  registerFinykDualWriteContext: (...a: unknown[]) =>
    registerFinykDualWriteContext(...a),
}));

import {
  bootFinykDualWrite,
  __resetFinykDualWriteBootForTests,
} from "./dualWriteBoot";

beforeEach(() => {
  vi.clearAllMocks();
  __resetFinykDualWriteBootForTests();
});

describe("bootFinykDualWrite", () => {
  it("registers a context and returns the teardown fn", () => {
    const teardown = bootFinykDualWrite({ getUserId: () => "u1" });
    expect(registerFinykDualWriteContext).toHaveBeenCalledTimes(1);
    expect(typeof teardown).toBe("function");
  });

  it("wires a context whose getUserId proxies the input", () => {
    bootFinykDualWrite({ getUserId: () => "abc" });
    const ctx = registerFinykDualWriteContext.mock.calls[0]![0] as {
      getUserId: () => string | null;
      getNow: () => string;
    };
    expect(ctx.getUserId()).toBe("abc");
    expect(typeof ctx.getNow()).toBe("string");
  });

  it("applies migrations only once across getMigrationClient calls", async () => {
    bootFinykDualWrite({ getUserId: () => "u1" });
    const ctx = registerFinykDualWriteContext.mock.calls[0]![0] as {
      getMigrationClient: () => Promise<unknown>;
    };
    await ctx.getMigrationClient();
    await ctx.getMigrationClient();
    expect(migrateFinyk).toHaveBeenCalledTimes(1);
  });
});
