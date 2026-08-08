import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSqliteDb = vi.fn();
const mockMigrate = vi.fn();
const mockRefresh = vi.fn();
const mockBootstrapBodyWeight = vi.fn();
const mockRecordFallback = vi.fn();
const mockImportDemoSeed = vi.fn();
const mockIsDemoActive = vi.fn();
const migrationClient = { __label: "mc" };

vi.mock("../../../core/db/sqlite.js", () => ({
  getSqliteDb: () => mockGetSqliteDb(),
}));
vi.mock("./clientMigrate.js", () => ({
  migrateFizruk: (...a: unknown[]) => mockMigrate(...a),
}));
vi.mock("./sqliteReader.js", () => ({
  refreshFizrukSqliteState: (...a: unknown[]) => mockRefresh(...a),
}));
vi.mock("./bodyWeightBootstrap.js", () => ({
  bootstrapBodyWeightFromBiometrics: (...a: unknown[]) =>
    mockBootstrapBodyWeight(...a),
}));
vi.mock("../../../core/observability/dualWriteTelemetry.js", () => ({
  recordReadFallback: (...a: unknown[]) => mockRecordFallback(...a),
}));
vi.mock("./demoSeedImport.js", () => ({
  importFizrukDemoSeed: (...a: unknown[]) => mockImportDemoSeed(...a),
}));
vi.mock("../../../core/onboarding/onboardingGate.js", () => ({
  isDemoActive: () => mockIsDemoActive(),
}));

import {
  bootFizrukSqliteReadPath,
  __resetFizrukSqliteReadBootForTests,
} from "./sqliteReadBoot";

beforeEach(() => {
  mockGetSqliteDb.mockReset();
  mockMigrate.mockReset();
  mockRefresh.mockReset();
  mockBootstrapBodyWeight.mockReset();
  mockRecordFallback.mockReset();
  __resetFizrukSqliteReadBootForTests();
  mockGetSqliteDb.mockResolvedValue({
    migrationClient: () => migrationClient,
  });
  mockMigrate.mockResolvedValue(undefined);
  mockRefresh.mockResolvedValue(undefined);
  mockBootstrapBodyWeight.mockResolvedValue(false);
  mockImportDemoSeed.mockReset();
  mockImportDemoSeed.mockResolvedValue(0);
  mockIsDemoActive.mockReset();
  mockIsDemoActive.mockReturnValue(false);
});

describe("демо-сід у read-boot", () => {
  // Найважливіший інваріант цієї пари файлів. Без гейта імпорт
  // воскресив би legacy-LS у СПРАВЖНІХ акаунтів — рівно те, що
  // прибрали навмисно 2026-08 разом із residual-дренажем, і що затерло
  // б їхні SQLite-дані старим знімком.
  it("НЕ ллє демо-payload, коли демо не активне", async () => {
    mockIsDemoActive.mockReturnValue(false);
    await bootFizrukSqliteReadPath("real-user-1");
    expect(mockImportDemoSeed).not.toHaveBeenCalled();
  });

  it("ллє демо-payload під демо-прапорцем — до першого читання", async () => {
    mockIsDemoActive.mockReturnValue(true);
    const order: string[] = [];
    mockImportDemoSeed.mockImplementation(async () => {
      order.push("import");
      return 3;
    });
    mockRefresh.mockImplementation(async () => {
      order.push("refresh");
    });

    await bootFizrukSqliteReadPath("demo-local");

    expect(mockImportDemoSeed).toHaveBeenCalledTimes(1);
    // Порядок — частина контракту: `refreshFizrukSqliteState` гріє кеш,
    // з якого рендериться модуль, тож імпорт мусить бути ДО нього,
    // інакше перший кадр демо все одно порожній.
    expect(order).toEqual(["import", "refresh"]);
  });

  it("падіння демо-імпорту не валить бут", async () => {
    mockIsDemoActive.mockReturnValue(true);
    mockImportDemoSeed.mockRejectedValue(new Error("boom"));
    // Імпортер сам не кидає (див. його тести), але навіть якщо колись
    // почне — бут модуля не має від цього померти.
    await expect(bootFizrukSqliteReadPath("demo-local")).resolves.toBe(false);
  });
});

describe("bootFizrukSqliteReadPath", () => {
  it("returns false and skips work when userId is null", async () => {
    expect(await bootFizrukSqliteReadPath(null)).toBe(false);
    expect(mockGetSqliteDb).not.toHaveBeenCalled();
  });

  it("runs migrate → refresh and returns true", async () => {
    const ok = await bootFizrukSqliteReadPath("u1");
    expect(ok).toBe(true);
    expect(mockMigrate).toHaveBeenCalledWith(migrationClient);
    expect(mockRefresh).toHaveBeenCalledWith(migrationClient, "u1");
    expect(mockBootstrapBodyWeight).toHaveBeenCalledWith(migrationClient, "u1");
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
