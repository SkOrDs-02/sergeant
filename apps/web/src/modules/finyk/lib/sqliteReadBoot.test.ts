import { describe, it, expect, beforeEach, vi } from "vitest";

const migrateFinyk = vi.fn(async (..._a: unknown[]) => {});
const importFinykResidualFromLs = vi.fn(async (..._a: unknown[]) => ({
  imported: false,
  cleaned: false,
}));
const refreshFinykSqliteState = vi.fn(async (..._a: unknown[]) => {});
const recordReadFallback = vi.fn();
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
vi.mock("./residualImport.js", () => ({
  importFinykResidualFromLs: (...a: unknown[]) =>
    importFinykResidualFromLs(...a),
}));
vi.mock("./sqliteReader.js", () => ({
  refreshFinykSqliteState: (...a: unknown[]) => refreshFinykSqliteState(...a),
}));
vi.mock("../../../core/observability/dualWriteTelemetry.js", () => ({
  recordReadFallback: (...a: unknown[]) => recordReadFallback(...a),
}));

import {
  bootFinykSqliteReadPath,
  __resetFinykSqliteReadBootForTests,
} from "./sqliteReadBoot";

beforeEach(() => {
  vi.clearAllMocks();
  __resetFinykSqliteReadBootForTests();
});

describe("bootFinykSqliteReadPath", () => {
  it("returns false and skips when userId is null", async () => {
    const ok = await bootFinykSqliteReadPath(null);
    expect(ok).toBe(false);
    expect(getSqliteDb).not.toHaveBeenCalled();
  });

  it("migrates, drains LS residuals, warms the cache and returns true", async () => {
    const ok = await bootFinykSqliteReadPath("u1");
    expect(ok).toBe(true);
    expect(migrateFinyk).toHaveBeenCalledWith(migrationClient);
    expect(importFinykResidualFromLs).toHaveBeenCalledWith(
      migrationClient,
      "u1",
    );
    expect(refreshFinykSqliteState).toHaveBeenCalledWith(migrationClient, "u1");
  });

  it("is idempotent — a second call no-ops after a successful boot", async () => {
    await bootFinykSqliteReadPath("u1");
    migrateFinyk.mockClear();
    const second = await bootFinykSqliteReadPath("u1");
    expect(second).toBe(false);
    expect(migrateFinyk).not.toHaveBeenCalled();
  });

  it("falls back to LS and records telemetry when boot throws", async () => {
    refreshFinykSqliteState.mockRejectedValueOnce(new Error("db gone"));
    const ok = await bootFinykSqliteReadPath("u1");
    expect(ok).toBe(false);
    expect(recordReadFallback).toHaveBeenCalledWith(
      "finyk",
      expect.stringContaining("boot-failed"),
    );
  });
});
