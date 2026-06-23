import { describe, it, expect, beforeEach, vi } from "vitest";

const migrateFinyk = vi.fn(async (..._a: unknown[]) => {});
const refreshFinykMonoMirrorState = vi.fn(async (..._a: unknown[]) => {});
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

import {
  bootFinykMonoMirror,
  __resetFinykMonoMirrorBootForTests,
} from "./monoMirrorBoot";

beforeEach(() => {
  vi.clearAllMocks();
  __resetFinykMonoMirrorBootForTests();
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
