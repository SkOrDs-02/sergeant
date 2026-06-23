// @vitest-environment jsdom
/**
 * Last validated: 2026-06-23
 * Status: Active
 * Unit tests for the nutrition SQLite read-path boot wiring.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSqliteDb = vi.fn();
const migrateNutrition = vi.fn();
const importResidual = vi.fn();
const refreshState = vi.fn();
const recordReadFallback = vi.fn();
const loggerWarn = vi.fn();

vi.mock("@shared/lib", () => ({
  logger: { warn: (...a: unknown[]) => loggerWarn(...a) },
}));
vi.mock("../../../core/observability/dualWriteTelemetry.js", () => ({
  recordReadFallback: (...a: unknown[]) => recordReadFallback(...a),
}));
vi.mock("../../../core/db/sqlite.js", () => ({
  getSqliteDb: () => getSqliteDb(),
}));
vi.mock("./clientMigrate.js", () => ({
  migrateNutrition: (...a: unknown[]) => migrateNutrition(...a),
}));
vi.mock("./residualImport.js", () => ({
  importNutritionResidualFromLs: (...a: unknown[]) => importResidual(...a),
}));
vi.mock("./sqliteReader.js", () => ({
  refreshNutritionSqliteState: (...a: unknown[]) => refreshState(...a),
}));

import {
  __resetNutritionSqliteReadBootForTests,
  bootNutritionSqliteReadPath,
} from "./sqliteReadBoot";

const migrationClient = {};
const handle = { migrationClient: () => migrationClient };

beforeEach(() => {
  __resetNutritionSqliteReadBootForTests();
  getSqliteDb.mockReset().mockResolvedValue(handle);
  migrateNutrition.mockReset().mockResolvedValue(undefined);
  importResidual
    .mockReset()
    .mockResolvedValue({ imported: false, cleaned: false });
  refreshState.mockReset().mockResolvedValue(undefined);
  recordReadFallback.mockReset();
  loggerWarn.mockReset();
});

afterEach(() => {
  __resetNutritionSqliteReadBootForTests();
  vi.clearAllMocks();
});

describe("bootNutritionSqliteReadPath", () => {
  it("skips when userId is null", async () => {
    expect(await bootNutritionSqliteReadPath(null)).toBe(false);
    expect(getSqliteDb).not.toHaveBeenCalled();
  });

  it("boots the read path: migrate → residual import → refresh", async () => {
    const ok = await bootNutritionSqliteReadPath("user-1");
    expect(ok).toBe(true);
    expect(migrateNutrition).toHaveBeenCalledWith(migrationClient);
    expect(importResidual).toHaveBeenCalledWith(migrationClient, "user-1");
    expect(refreshState).toHaveBeenCalledWith(migrationClient, "user-1");
  });

  it("latches: a second call no-ops", async () => {
    expect(await bootNutritionSqliteReadPath("user-1")).toBe(true);
    expect(await bootNutritionSqliteReadPath("user-1")).toBe(false);
    expect(getSqliteDb).toHaveBeenCalledTimes(1);
  });

  it("falls back and records telemetry on failure", async () => {
    getSqliteDb.mockRejectedValue(new Error("no wasm"));
    const ok = await bootNutritionSqliteReadPath("user-1");
    expect(ok).toBe(false);
    expect(loggerWarn).toHaveBeenCalled();
    expect(recordReadFallback).toHaveBeenCalledWith(
      "nutrition",
      expect.stringContaining("boot-failed"),
    );
  });

  it("can retry after a failed boot (not latched on failure)", async () => {
    getSqliteDb.mockRejectedValueOnce(new Error("transient"));
    expect(await bootNutritionSqliteReadPath("user-1")).toBe(false);
    // Next call succeeds because `booted` was never set.
    expect(await bootNutritionSqliteReadPath("user-1")).toBe(true);
  });
});
