// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetSqliteDbForTests,
  getSqliteDb,
  setSqliteUser,
  wipeSqliteDb,
} from "../sqlite";
import { createdOpfsFilenames, opfsUnlinkMock } from "./sqlite-wasm-fake";

/**
 * Per-user partitioning + wipe-on-logout (page-audit-10 F17).
 *
 * Two accounts signing in on the same device must never share one OPFS DB
 * file, and logging out must delete the signed-out user's local DB. We drive
 * the same JSDOM OPFS-SAH fake the init test uses and assert on the filenames
 * the pool is asked to open / unlink.
 */

vi.mock("@sqlite.org/sqlite-wasm", () => import("./sqlite-wasm-fake"));
vi.mock("../../observability/sentry.js", () => ({
  addSentryBreadcrumb: vi.fn(),
}));

describe("getSqliteDb — per-user partitioning", () => {
  beforeEach(() => {
    __resetSqliteDbForTests();
    createdOpfsFilenames.length = 0;
    opfsUnlinkMock.mockClear();
    Object.defineProperty(globalThis.navigator, "storage", {
      value: { getDirectory: () => Promise.resolve({}) },
      configurable: true,
    });
    Object.defineProperty(globalThis, "FileSystemFileHandle", {
      value: function FileSystemFileHandle() {},
      configurable: true,
    });
    Object.defineProperty(globalThis, "crossOriginIsolated", {
      value: true,
      configurable: true,
    });
  });

  afterEach(() => {
    __resetSqliteDbForTests();
    vi.restoreAllMocks();
  });

  it("defaults to the anon partition before a user is set", async () => {
    await getSqliteDb();
    expect(createdOpfsFilenames).toEqual(["sergeant-anon.db"]);
  });

  it("opens a per-user DB file named sergeant-<userId>.db", async () => {
    setSqliteUser("user_ABC123");
    await getSqliteDb();
    expect(createdOpfsFilenames).toEqual(["sergeant-user_ABC123.db"]);
  });

  it("sanitizes unsafe characters out of the filename", async () => {
    setSqliteUser("a/../b@x");
    await getSqliteDb();
    expect(createdOpfsFilenames).toEqual(["sergeant-abx.db"]);
  });

  it("reopens a fresh handle + different file when the user switches", async () => {
    setSqliteUser("alice");
    const a = await getSqliteDb();
    setSqliteUser("bob");
    const b = await getSqliteDb();

    expect(a).not.toBe(b);
    expect(createdOpfsFilenames).toEqual([
      "sergeant-alice.db",
      "sergeant-bob.db",
    ]);
  });

  it("dedupes concurrent calls for the same user into one init", async () => {
    setSqliteUser("carol");
    const [a, b, c] = await Promise.all([
      getSqliteDb(),
      getSqliteDb(),
      getSqliteDb(),
    ]);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(createdOpfsFilenames).toEqual(["sergeant-carol.db"]);
  });

  it("wipeSqliteDb deletes the active user's file and resets the singleton", async () => {
    setSqliteUser("dave");
    await getSqliteDb();

    await wipeSqliteDb();
    expect(opfsUnlinkMock).toHaveBeenCalledWith("sergeant-dave.db");

    // Singleton was reset → the next call re-initialises (same key, so it
    // re-opens dave's now-empty file).
    await getSqliteDb();
    expect(createdOpfsFilenames).toEqual([
      "sergeant-dave.db",
      "sergeant-dave.db",
    ]);
  });
});
