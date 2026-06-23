import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSqliteDbMock,
  migrateMock,
  residualMock,
  refreshCompletionsMock,
  refreshStateMock,
  recordReadFallbackMock,
  warnMock,
} = vi.hoisted(() => ({
  getSqliteDbMock: vi.fn(),
  migrateMock: vi.fn(),
  residualMock: vi.fn(),
  refreshCompletionsMock: vi.fn(),
  refreshStateMock: vi.fn(),
  recordReadFallbackMock: vi.fn(),
  warnMock: vi.fn(),
}));

vi.mock("@shared/lib", () => ({ logger: { warn: warnMock } }));
vi.mock("../../../core/observability/dualWriteTelemetry.js", () => ({
  recordReadFallback: recordReadFallbackMock,
}));
vi.mock("../../../core/db/sqlite.js", () => ({ getSqliteDb: getSqliteDbMock }));
vi.mock("./clientMigrate.js", () => ({ migrateRoutine: migrateMock }));
vi.mock("./residualImport.js", () => ({
  importRoutineResidualFromLs: residualMock,
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
    residualMock.mockResolvedValue({ imported: false, cleaned: false });
    refreshCompletionsMock.mockResolvedValue(undefined);
    refreshStateMock.mockResolvedValue(undefined);
  });

  it("skips when userId is null", async () => {
    expect(await bootSqliteReadPath(null)).toBe(false);
    expect(getSqliteDbMock).not.toHaveBeenCalled();
  });

  it("boots the read path and warms both caches", async () => {
    expect(await bootSqliteReadPath("u1")).toBe(true);
    expect(migrateMock).toHaveBeenCalled();
    expect(residualMock).toHaveBeenCalledWith({ id: "client" }, "u1");
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
