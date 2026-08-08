import { describe, it, expect, beforeEach, vi } from "vitest";

const migrateFinyk = vi.fn(async (..._a: unknown[]) => {});
const refreshFinykMonoMirrorState = vi.fn(async (..._a: unknown[]) => {});
const importFinykDemoMonoTransactions = vi.fn();
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
vi.mock("./monoMirrorReader.js", () => ({
  refreshFinykMonoMirrorState: (...a: unknown[]) =>
    refreshFinykMonoMirrorState(...a),
}));
vi.mock("./demoSeedImport.js", () => ({
  importFinykDemoMonoTransactions: (...a: unknown[]) =>
    importFinykDemoMonoTransactions(...a),
}));
vi.mock("../../../core/onboarding/onboardingGate.js", () => ({
  isDemoActive: () => isDemoActive(),
}));

import {
  bootFinykMonoMirror,
  __resetFinykMonoMirrorBootForTests,
} from "./monoMirrorBoot";

beforeEach(() => {
  vi.clearAllMocks();
  __resetFinykMonoMirrorBootForTests();
  importFinykDemoMonoTransactions.mockResolvedValue(0);
  isDemoActive.mockReturnValue(false);
});

describe("bootFinykMonoMirror", () => {
  it("skips when userId is null", async () => {
    expect(await bootFinykMonoMirror(null)).toBe(false);
    expect(getSqliteDb).not.toHaveBeenCalled();
  });

  it("migrates + warms the mirror cache and returns true", async () => {
    expect(await bootFinykMonoMirror("u1")).toBe(true);
    expect(migrateFinyk).toHaveBeenCalledWith(migrationClient);
    expect(refreshFinykMonoMirrorState).toHaveBeenCalledWith(
      migrationClient,
      "u1",
    );
  });

  it("is idempotent after a successful boot", async () => {
    await bootFinykMonoMirror("u1");
    migrateFinyk.mockClear();
    expect(await bootFinykMonoMirror("u1")).toBe(false);
    expect(migrateFinyk).not.toHaveBeenCalled();
  });

  it("returns false and logs on failure", async () => {
    refreshFinykMonoMirrorState.mockRejectedValueOnce(new Error("nope"));
    expect(await bootFinykMonoMirror("u1")).toBe(false);
  });
});

describe("демо-сід у mono-mirror boot", () => {
  // Найважливіший інваріант цієї пари файлів (дзеркалить
  // sqliteReadBoot.test.ts). Без гейта імпорт воскресив би legacy-LS у
  // СПРАВЖНІХ акаунтів — рівно те, що прибрали навмисно, і що затерло
  // б їхні SQLite-дані старим знімком.
  it("НЕ ллє демо-транзакції, коли демо не активне", async () => {
    isDemoActive.mockReturnValue(false);
    await bootFinykMonoMirror("real-user-1");
    expect(importFinykDemoMonoTransactions).not.toHaveBeenCalled();
  });

  it("ллє демо-транзакції під демо-прапорцем — до першого читання мірора", async () => {
    isDemoActive.mockReturnValue(true);
    const order: string[] = [];
    importFinykDemoMonoTransactions.mockImplementation(async () => {
      order.push("import");
      return 23;
    });
    refreshFinykMonoMirrorState.mockImplementation(async () => {
      order.push("refresh");
    });

    await bootFinykMonoMirror("demo-local");

    expect(importFinykDemoMonoTransactions).toHaveBeenCalledTimes(1);
    // Порядок — частина контракту: `refreshFinykMonoMirrorState` гріє
    // кеш, з якого рендериться банківський стрім, тож імпорт мусить
    // бути ДО нього, інакше перший кадр демо все одно порожній.
    expect(order).toEqual(["import", "refresh"]);
  });

  it("падіння демо-імпорту не валить бут", async () => {
    isDemoActive.mockReturnValue(true);
    importFinykDemoMonoTransactions.mockRejectedValue(new Error("boom"));
    // Імпортер сам не кидає (див. його тести), але навіть якщо колись
    // почне — бут модуля не має від цього померти.
    await expect(bootFinykMonoMirror("demo-local")).resolves.toBe(false);
  });
});
