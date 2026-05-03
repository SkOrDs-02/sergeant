/**
 * Tests for the mobile Fizruk SQLite read-boot wiring (PR #029a).
 *
 * Mirrors the web vitest at `apps/web/src/modules/fizruk/lib/`. Boot is
 * called outside React, so it reads the flag value directly from the
 * MMKV-backed flag map (`@hub_flags_v1`). We mock the SQLite client +
 * the migration / refresh helpers so this test stays fast and stays
 * focused on the boot contract: skip when flag is off, run + return
 * `true` when flag is on, fail soft on errors.
 */
import { _getMMKVInstance } from "@/lib/storage";
import { FLAGS_KEY } from "@/core/lib/featureFlags";

const mockGetSqliteMigrationClient = jest.fn();
const mockMigrateFizruk = jest.fn();
const mockRefreshFizrukSqliteState = jest.fn();

jest.mock("@/core/db/sqlite", () => ({
  getSqliteMigrationClient: (...args: unknown[]) =>
    mockGetSqliteMigrationClient(...args),
}));

jest.mock("../clientMigrate", () => ({
  migrateFizruk: (...args: unknown[]) => mockMigrateFizruk(...args),
}));

jest.mock("../sqliteReader", () => ({
  refreshFizrukSqliteState: (...args: unknown[]) =>
    mockRefreshFizrukSqliteState(...args),
}));

import { bootFizrukSqliteReadPath } from "../sqliteReadBoot";

const FLAG_ID = "feature.fizruk.sqlite_v2.read_sqlite";

function setFlag(value: boolean): void {
  _getMMKVInstance().set(FLAGS_KEY, JSON.stringify({ [FLAG_ID]: value }));
}

beforeEach(() => {
  _getMMKVInstance().clearAll();
  mockGetSqliteMigrationClient.mockReset();
  mockMigrateFizruk.mockReset();
  mockRefreshFizrukSqliteState.mockReset();
});

describe("bootFizrukSqliteReadPath", () => {
  it("returns false when userId is missing (pre-auth)", async () => {
    setFlag(true);
    await expect(bootFizrukSqliteReadPath(null)).resolves.toBe(false);
    await expect(bootFizrukSqliteReadPath(undefined)).resolves.toBe(false);
    await expect(bootFizrukSqliteReadPath("")).resolves.toBe(false);
    expect(mockGetSqliteMigrationClient).not.toHaveBeenCalled();
    expect(mockMigrateFizruk).not.toHaveBeenCalled();
    expect(mockRefreshFizrukSqliteState).not.toHaveBeenCalled();
  });

  it("returns false when the flag is off (default)", async () => {
    // No write to FLAGS_KEY → falls back to registered defaultValue,
    // which is `false` for the new flag.
    await expect(bootFizrukSqliteReadPath("user-1")).resolves.toBe(false);
    expect(mockGetSqliteMigrationClient).not.toHaveBeenCalled();
    expect(mockMigrateFizruk).not.toHaveBeenCalled();
    expect(mockRefreshFizrukSqliteState).not.toHaveBeenCalled();
  });

  it("returns false when the flag is explicitly off in MMKV", async () => {
    setFlag(false);
    await expect(bootFizrukSqliteReadPath("user-1")).resolves.toBe(false);
    expect(mockGetSqliteMigrationClient).not.toHaveBeenCalled();
  });

  it("runs migrations + refresh and returns true when flag is on", async () => {
    setFlag(true);
    const fakeClient = { __label: "client" };
    mockGetSqliteMigrationClient.mockResolvedValue(fakeClient);
    mockMigrateFizruk.mockResolvedValue(undefined);
    mockRefreshFizrukSqliteState.mockResolvedValue(undefined);

    await expect(bootFizrukSqliteReadPath("user-1")).resolves.toBe(true);

    expect(mockGetSqliteMigrationClient).toHaveBeenCalledTimes(1);
    expect(mockMigrateFizruk).toHaveBeenCalledWith(fakeClient);
    expect(mockRefreshFizrukSqliteState).toHaveBeenCalledWith(
      fakeClient,
      "user-1",
    );
  });

  it("fails soft (returns false, no throw) when getSqliteMigrationClient throws", async () => {
    setFlag(true);
    mockGetSqliteMigrationClient.mockRejectedValue(new Error("no client"));
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    await expect(bootFizrukSqliteReadPath("user-1")).resolves.toBe(false);

    expect(warnSpy).toHaveBeenCalled();
    expect(mockMigrateFizruk).not.toHaveBeenCalled();
    expect(mockRefreshFizrukSqliteState).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("fails soft when migrateFizruk throws", async () => {
    setFlag(true);
    mockGetSqliteMigrationClient.mockResolvedValue({});
    mockMigrateFizruk.mockRejectedValue(new Error("migration failed"));
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    await expect(bootFizrukSqliteReadPath("user-1")).resolves.toBe(false);

    expect(warnSpy).toHaveBeenCalled();
    expect(mockRefreshFizrukSqliteState).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("fails soft when refreshFizrukSqliteState throws", async () => {
    setFlag(true);
    mockGetSqliteMigrationClient.mockResolvedValue({});
    mockMigrateFizruk.mockResolvedValue(undefined);
    mockRefreshFizrukSqliteState.mockRejectedValue(new Error("read failed"));
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    await expect(bootFizrukSqliteReadPath("user-1")).resolves.toBe(false);

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
