import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSqliteDbMock,
  migrateMock,
  refreshCompletionsMock,
  refreshStateMock,
  recordReadFallbackMock,
  warnMock,
  debugMock,
  importDemoSeedMock,
  isDemoActiveMock,
} = vi.hoisted(() => ({
  getSqliteDbMock: vi.fn(),
  migrateMock: vi.fn(),
  refreshCompletionsMock: vi.fn(),
  refreshStateMock: vi.fn(),
  recordReadFallbackMock: vi.fn(),
  warnMock: vi.fn(),
  debugMock: vi.fn(),
  importDemoSeedMock: vi.fn(),
  isDemoActiveMock: vi.fn(),
}));

vi.mock("@shared/lib", () => ({
  logger: { warn: warnMock, debug: debugMock },
}));
vi.mock("../../../core/observability/dualWriteTelemetry.js", () => ({
  recordReadFallback: recordReadFallbackMock,
}));
vi.mock("../../../core/db/sqlite.js", () => ({ getSqliteDb: getSqliteDbMock }));
vi.mock("../../../core/onboarding/onboardingGate.js", () => ({
  isDemoActive: isDemoActiveMock,
}));
vi.mock("./clientMigrate.js", () => ({ migrateRoutine: migrateMock }));
vi.mock("./demoSeedImport.js", () => ({
  importRoutineDemoSeed: importDemoSeedMock,
}));
vi.mock("./sqliteReader.js", () => ({
  refreshSqliteCompletions: refreshCompletionsMock,
  refreshSqliteRoutineState: refreshStateMock,
}));

import {
  __resetSqliteReadBootForTests,
  bootSqliteReadPath,
} from "./sqliteReadBoot";

describe("bootSqliteReadPath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetSqliteReadBootForTests();
    const client = { id: "client" };
    getSqliteDbMock.mockResolvedValue({ migrationClient: () => client });
    migrateMock.mockResolvedValue(undefined);
    refreshCompletionsMock.mockResolvedValue(undefined);
    refreshStateMock.mockResolvedValue(undefined);
    isDemoActiveMock.mockReturnValue(false);
    importDemoSeedMock.mockResolvedValue(0);
  });

  it("skips when userId is null", async () => {
    expect(await bootSqliteReadPath(null)).toBe(false);
    expect(getSqliteDbMock).not.toHaveBeenCalled();
  });

  it("boots the read path and warms both caches", async () => {
    expect(await bootSqliteReadPath("u1")).toBe(true);
    expect(migrateMock).toHaveBeenCalled();
    expect(refreshCompletionsMock).toHaveBeenCalledWith({ id: "client" }, "u1");
    expect(refreshStateMock).toHaveBeenCalledWith({ id: "client" }, "u1");
  });

  it("is idempotent — a second call no-ops", async () => {
    await bootSqliteReadPath("u1");
    getSqliteDbMock.mockClear();
    expect(await bootSqliteReadPath("u1")).toBe(false);
    expect(getSqliteDbMock).not.toHaveBeenCalled();
  });

  it("falls back and records telemetry when boot throws", async () => {
    getSqliteDbMock.mockRejectedValue(new Error("no-wasm"));
    expect(await bootSqliteReadPath("u1")).toBe(false);
    expect(warnMock).toHaveBeenCalled();
    expect(recordReadFallbackMock).toHaveBeenCalledWith(
      "routine",
      "boot-failed: no-wasm",
    );
  });
});

describe("демо-сід у read-boot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetSqliteReadBootForTests();
    const client = { id: "client" };
    getSqliteDbMock.mockResolvedValue({ migrationClient: () => client });
    migrateMock.mockResolvedValue(undefined);
    refreshCompletionsMock.mockResolvedValue(undefined);
    refreshStateMock.mockResolvedValue(undefined);
    isDemoActiveMock.mockReturnValue(false);
    importDemoSeedMock.mockResolvedValue(0);
  });

  // Найважливіший інваріант цієї пари файлів. Без гейта імпорт
  // воскресив би legacy-LS у СПРАВЖНІХ акаунтів — рівно те, що
  // прибрали навмисно 2026-08 разом із residual-дренажем, і що затерло
  // б їхні SQLite-дані старим знімком.
  it("НЕ ллє демо-payload, коли демо не активне", async () => {
    isDemoActiveMock.mockReturnValue(false);
    await bootSqliteReadPath("real-user-1");
    expect(importDemoSeedMock).not.toHaveBeenCalled();
  });

  it("ллє демо-payload під демо-прапорцем — до першого читання", async () => {
    isDemoActiveMock.mockReturnValue(true);
    const order: string[] = [];
    importDemoSeedMock.mockImplementation(async () => {
      order.push("import");
      return 3;
    });
    refreshCompletionsMock.mockImplementation(async () => {
      order.push("refresh-completions");
    });
    refreshStateMock.mockImplementation(async () => {
      order.push("refresh-state");
    });

    await bootSqliteReadPath("demo-local");

    expect(importDemoSeedMock).toHaveBeenCalledTimes(1);
    // Порядок — частина контракту: `refreshSqliteCompletions` /
    // `refreshSqliteRoutineState` гріють кеш, з якого рендериться
    // модуль, тож імпорт мусить бути ДО них, інакше перший кадр демо
    // все одно порожній.
    expect(order).toEqual(["import", "refresh-completions", "refresh-state"]);
  });

  it("падіння демо-імпорту не валить бут", async () => {
    isDemoActiveMock.mockReturnValue(true);
    importDemoSeedMock.mockRejectedValue(new Error("boom"));
    // Імпортер сам не кидає (див. його тести), але навіть якщо колись
    // почне — бут модуля не має від цього померти.
    await expect(bootSqliteReadPath("demo-local")).resolves.toBe(false);
  });
});
