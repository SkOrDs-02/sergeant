/**
 * Tests for the mobile Fizruk SQLite read-boot wiring.
 *
 * Stage 8 PR #057f-flag: the `feature.fizruk.sqlite_v2.read_sqlite`
 * flag has graduated — boot is now unconditional once `userId` is
 * available. The MMKV flag-map probe was removed. We mock the SQLite
 * client + the migration / refresh helpers so this test stays fast
 * and focused on the boot contract: skip when `userId` is missing,
 * run + return `true` whenever it's provided, fail soft on errors.
 */
import { _getMMKVInstance } from "@/lib/storage";

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

beforeEach(() => {
  _getMMKVInstance().clearAll();
  mockGetSqliteMigrationClient.mockReset();
  mockMigrateFizruk.mockReset();
  mockRefreshFizrukSqliteState.mockReset();
});

describe("bootFizrukSqliteReadPath", () => {
  it("returns false when userId is missing (pre-auth)", async () => {
    await expect(bootFizrukSqliteReadPath(null)).resolves.toBe(false);
    await expect(bootFizrukSqliteReadPath(undefined)).resolves.toBe(false);
    await expect(bootFizrukSqliteReadPath("")).resolves.toBe(false);
    expect(mockGetSqliteMigrationClient).not.toHaveBeenCalled();
    expect(mockMigrateFizruk).not.toHaveBeenCalled();
    expect(mockRefreshFizrukSqliteState).not.toHaveBeenCalled();
  });

  it("runs migrations + refresh and returns true when userId is provided", async () => {
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
    mockGetSqliteMigrationClient.mockRejectedValue(new Error("no client"));
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    await expect(bootFizrukSqliteReadPath("user-1")).resolves.toBe(false);

    expect(warnSpy).toHaveBeenCalled();
    expect(mockMigrateFizruk).not.toHaveBeenCalled();
    expect(mockRefreshFizrukSqliteState).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("fails soft when migrateFizruk throws", async () => {
    mockGetSqliteMigrationClient.mockResolvedValue({});
    mockMigrateFizruk.mockRejectedValue(new Error("migration failed"));
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    await expect(bootFizrukSqliteReadPath("user-1")).resolves.toBe(false);

    expect(warnSpy).toHaveBeenCalled();
    expect(mockRefreshFizrukSqliteState).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("fails soft when refreshFizrukSqliteState throws", async () => {
    mockGetSqliteMigrationClient.mockResolvedValue({});
    mockMigrateFizruk.mockResolvedValue(undefined);
    mockRefreshFizrukSqliteState.mockRejectedValue(new Error("read failed"));
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    await expect(bootFizrukSqliteReadPath("user-1")).resolves.toBe(false);

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
