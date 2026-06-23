import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSqliteDb = vi.fn();
const mockMigrate = vi.fn();
const mockResidual = vi.fn();
const mockRefresh = vi.fn();
const mockRecordFallback = vi.fn();
const migrationClient = { __label: "mc" };

vi.mock("../../../core/db/sqlite.js", () => ({
  getSqliteDb: () => mockGetSqliteDb(),
}));
vi.mock("./clientMigrate.js", () => ({
  migrateFizruk: (...a: unknown[]) => mockMigrate(...a),
}));
vi.mock("./residualImport.js", () => ({
  importFizrukResidualFromLs: (...a: unknown[]) => mockResidual(...a),
}));
vi.mock("./sqliteReader.js", () => ({
  refreshFizrukSqliteState: (...a: unknown[]) => mockRefresh(...a),
}));
vi.mock("../../../core/observability/dualWriteTelemetry.js", () => ({
  recordReadFallback: (...a: unknown[]) => mockRecordFallback(...a),
}));

import {
  bootFizrukSqliteReadPath,
  __resetFizrukSqliteReadBootForTests,
} from "./sqliteReadBoot";

beforeEach(() => {
  mockGetSqliteDb.mockReset();
  mockMigrate.mockReset();
  mockResidual.mockReset();
  mockRefresh.mockReset();
  mockRecordFallback.mockReset();
  __resetFizrukSqliteReadBootForTests();
  mockGetSqliteDb.mockResolvedValue({
    migrationClient: () => migrationClient,
  });
  mockMigrate.mockResolvedValue(undefined);
  mockResidual.mockResolvedValue({ imported: false, cleaned: false });
  mockRefresh.mockResolvedValue(undefined);
});

describe("bootFizrukSqliteReadPath", () => {
  it("returns false and skips work when userId is null", async () => {
    expect(await bootFizrukSqliteReadPath(null)).toBe(false);
    expect(mockGetSqliteDb).not.toHaveBeenCalled();
  });

  it("runs migrate → residual import → refresh and returns true", async () => {
    const ok = await bootFizrukSqliteReadPath("u1");
    expect(ok).toBe(true);
    expect(mockMigrate).toHaveBeenCalledWith(migrationClient);
    expect(mockResidual).toHaveBeenCalledWith(migrationClient, "u1");
    expect(mockRefresh).toHaveBeenCalledWith(migrationClient, "u1");
  });

  it("is idempotent — second call returns false", async () => {
    expect(await bootFizrukSqliteReadPath("u1")).toBe(true);
    expect(await bootFizrukSqliteReadPath("u1")).toBe(false);
    expect(mockMigrate).toHaveBeenCalledTimes(1);
  });

  it("falls back and records telemetry when boot throws", async () => {
    mockGetSqliteDb.mockRejectedValue(new Error("no wasm"));
    const ok = await bootFizrukSqliteReadPath("u1");
    expect(ok).toBe(false);
    expect(mockRecordFallback).toHaveBeenCalledWith(
      "fizruk",
      expect.stringContaining("boot-failed"),
    );
  });
});
