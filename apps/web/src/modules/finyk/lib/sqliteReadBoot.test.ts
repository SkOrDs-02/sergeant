import { describe, it, expect, beforeEach, vi } from "vitest";

const migrateFinyk = vi.fn(async (..._a: unknown[]) => {});
const refreshFinykSqliteState = vi.fn(async (..._a: unknown[]) => {});
const recordReadFallback = vi.fn();
const importFinykDemoSeed = vi.fn();
const isDemoActive = vi.fn();
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
vi.mock("./sqliteReader.js", () => ({
  refreshFinykSqliteState: (...a: unknown[]) => refreshFinykSqliteState(...a),
}));
vi.mock("../../../core/observability/dualWriteTelemetry.js", () => ({
  recordReadFallback: (...a: unknown[]) => recordReadFallback(...a),
}));
vi.mock("./demoSeedImport.js", () => ({
  importFinykDemoSeed: (...a: unknown[]) => importFinykDemoSeed(...a),
}));
vi.mock("../../../core/onboarding/onboardingGate.js", () => ({
  isDemoActive: () => isDemoActive(),
}));

import {
  bootFinykSqliteReadPath,
  __resetFinykSqliteReadBootForTests,
} from "./sqliteReadBoot";

beforeEach(() => {
  vi.clearAllMocks();
  __resetFinykSqliteReadBootForTests();
  importFinykDemoSeed.mockResolvedValue(0);
  isDemoActive.mockReturnValue(false);
});

describe("bootFinykSqliteReadPath", () => {
  it("returns false and skips when userId is null", async () => {
    const ok = await bootFinykSqliteReadPath(null);
    expect(ok).toBe(false);
    expect(getSqliteDb).not.toHaveBeenCalled();
  });

  it("migrates, warms the cache and returns true", async () => {
    const ok = await bootFinykSqliteReadPath("u1");
    expect(ok).toBe(true);
    expect(migrateFinyk).toHaveBeenCalledWith(migrationClient);
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

describe("демо-сід у read-boot", () => {
  // Найважливіший інваріант цієї пари файлів. Без гейта імпорт
  // воскресив би legacy-LS у СПРАВЖНІХ акаунтів — рівно те, що
  // прибрали навмисно 2026-08 разом із residual-дренажем, і що затерло
  // б їхні SQLite-дані старим знімком.
  it("НЕ ллє демо-payload, коли демо не активне", async () => {
    isDemoActive.mockReturnValue(false);
    await bootFinykSqliteReadPath("real-user-1");
    expect(importFinykDemoSeed).not.toHaveBeenCalled();
  });

  it("ллє демо-payload під демо-прапорцем — до першого читання", async () => {
    isDemoActive.mockReturnValue(true);
    const order: string[] = [];
    importFinykDemoSeed.mockImplementation(async () => {
      order.push("import");
      return 3;
    });
    refreshFinykSqliteState.mockImplementation(async () => {
      order.push("refresh");
    });

    await bootFinykSqliteReadPath("demo-local");

    expect(importFinykDemoSeed).toHaveBeenCalledTimes(1);
    // Порядок — частина контракту: `refreshFinykSqliteState` гріє кеш,
    // з якого рендериться модуль, тож імпорт мусить бути ДО нього,
    // інакше перший кадр демо все одно порожній.
    expect(order).toEqual(["import", "refresh"]);
  });

  it("падіння демо-імпорту не валить бут", async () => {
    isDemoActive.mockReturnValue(true);
    importFinykDemoSeed.mockRejectedValue(new Error("boom"));
    // Імпортер сам не кидає (див. його тести), але навіть якщо колись
    // почне — бут модуля не має від цього померти.
    await expect(bootFinykSqliteReadPath("demo-local")).resolves.toBe(false);
  });
});
