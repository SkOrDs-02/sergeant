// @vitest-environment jsdom
/**
 * Last validated: 2026-08-08
 * Status: Active
 * Unit tests for the nutrition SQLite read-path boot wiring.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSqliteDb = vi.fn();
const migrateNutrition = vi.fn();
const refreshState = vi.fn();
const recordReadFallback = vi.fn();
const loggerWarn = vi.fn();
const loggerDebug = vi.fn();
const mockImportDemoSeed = vi.fn();
const mockIsDemoActive = vi.fn();

vi.mock("@shared/lib", () => ({
  logger: {
    warn: (...a: unknown[]) => loggerWarn(...a),
    debug: (...a: unknown[]) => loggerDebug(...a),
  },
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
vi.mock("./sqliteReader.js", () => ({
  refreshNutritionSqliteState: (...a: unknown[]) => refreshState(...a),
}));
vi.mock("./demoSeedImport.js", () => ({
  importNutritionDemoSeed: (...a: unknown[]) => mockImportDemoSeed(...a),
}));
vi.mock("../../../core/onboarding/onboardingGate.js", () => ({
  isDemoActive: () => mockIsDemoActive(),
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
  refreshState.mockReset().mockResolvedValue(undefined);
  recordReadFallback.mockReset();
  loggerWarn.mockReset();
  loggerDebug.mockReset();
  mockImportDemoSeed.mockReset().mockResolvedValue(0);
  mockIsDemoActive.mockReset().mockReturnValue(false);
});

afterEach(() => {
  __resetNutritionSqliteReadBootForTests();
  vi.clearAllMocks();
});

describe("демо-сід у read-boot", () => {
  // Найважливіший інваріант цієї пари файлів. Без гейта імпорт
  // воскресив би legacy-LS у СПРАВЖНІХ акаунтів — рівно те, що
  // прибрали навмисно 2026-08 разом із residual-дренажем, і що затерло
  // б їхні SQLite-дані старим знімком.
  it("НЕ ллє демо-payload, коли демо не активне", async () => {
    mockIsDemoActive.mockReturnValue(false);
    await bootNutritionSqliteReadPath("real-user-1");
    expect(mockImportDemoSeed).not.toHaveBeenCalled();
  });

  it("ллє демо-payload під демо-прапорцем — до першого читання", async () => {
    mockIsDemoActive.mockReturnValue(true);
    const order: string[] = [];
    mockImportDemoSeed.mockImplementation(async () => {
      order.push("import");
      return 3;
    });
    refreshState.mockImplementation(async () => {
      order.push("refresh");
    });

    await bootNutritionSqliteReadPath("demo-local");

    expect(mockImportDemoSeed).toHaveBeenCalledTimes(1);
    // Порядок — частина контракту: `refreshNutritionSqliteState` гріє
    // кеш, з якого рендериться модуль, тож імпорт мусить бути ДО нього,
    // інакше перший кадр демо все одно порожній.
    expect(order).toEqual(["import", "refresh"]);
  });

  it("падіння демо-імпорту не валить бут", async () => {
    mockIsDemoActive.mockReturnValue(true);
    mockImportDemoSeed.mockRejectedValue(new Error("boom"));
    // Імпортер сам не кидає (див. його тести), але навіть якщо колись
    // почне — бут модуля не має від цього померти.
    await expect(bootNutritionSqliteReadPath("demo-local")).resolves.toBe(
      false,
    );
  });
});

describe("bootNutritionSqliteReadPath", () => {
  it("skips when userId is null", async () => {
    expect(await bootNutritionSqliteReadPath(null)).toBe(false);
    expect(getSqliteDb).not.toHaveBeenCalled();
  });

  it("boots the read path: migrate → refresh", async () => {
    const ok = await bootNutritionSqliteReadPath("user-1");
    expect(ok).toBe(true);
    expect(migrateNutrition).toHaveBeenCalledWith(migrationClient);
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
