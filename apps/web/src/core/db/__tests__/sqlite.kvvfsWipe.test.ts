// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetSqliteDbForTests,
  getSqliteDb,
  setSqliteUser,
  wipeSqliteDb,
} from "../sqlite";

/**
 * Regression for the "Відомий залишковий ризик" in
 * `docs/90-work/planning/specs/anonymous-local-first-persistence.md`:
 * on the `kvvfs` fallback (Safari < 17 / iOS < 16.4) every partition on
 * the device shares ONE physical `localStorage`-backed store (no
 * per-user filename, unlike OPFS). `wipeSqliteDb()` on logout used to
 * call `db.clearStorage()` unconditionally, wiping the anonymous
 * visitor's rows (and any other account's) along with the signed-out
 * user's own data.
 *
 * Drives the REAL `@sqlite.org/sqlite-wasm` package (not the light fake
 * `sqlite-wasm-fake.ts`, which doesn't model row storage) against a
 * hidden-OPFS environment so `openDb()` falls through to kvvfs, exactly
 * like `sqlite.roundtrip.test.ts` does for the in-memory branch.
 */

const USER_TABLE = "routine_habits";

describe("wipeSqliteDb — kvvfs row-level scope", () => {
  beforeEach(() => {
    __resetSqliteDbForTests();
    // Hide OPFS so `openDb()` falls through to the kvvfs branch; leave
    // `localStorage` in place (jsdom ships a real, synchronous shim).
    Object.defineProperty(globalThis.navigator, "storage", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(globalThis, "FileSystemFileHandle", {
      value: undefined,
      configurable: true,
    });
    localStorage.clear();
  });

  afterEach(async () => {
    __resetSqliteDbForTests();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("deletes only the signed-out user's rows, leaving other partitions on the shared kvvfs store intact", async () => {
    setSqliteUser("user-a");
    const handle = await getSqliteDb();
    expect(handle.vfs).toBe("kvvfs");
    const client = handle.migrationClient();

    client.exec(
      `CREATE TABLE IF NOT EXISTS ${USER_TABLE} (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT)`,
    );
    await client.run(
      `INSERT INTO ${USER_TABLE} (id, user_id, name) VALUES (?, ?, ?)`,
      ["h-a", "user-a", "Run"],
    );
    await client.run(
      `INSERT INTO ${USER_TABLE} (id, user_id, name) VALUES (?, ?, ?)`,
      ["h-b", "user-b", "Swim"],
    );
    await client.run(
      `INSERT INTO ${USER_TABLE} (id, user_id, name) VALUES (?, ?, ?)`,
      ["h-anon", "local-anon", "Stretch"],
    );

    // Signs out "user-a" — the active partition at the moment of the call.
    await wipeSqliteDb();
    setSqliteUser(null);

    // Re-resolve a fresh handle onto the SAME physical kvvfs store and
    // confirm only user-a's row is gone.
    const reopened = await getSqliteDb();
    const reopenedClient = reopened.migrationClient();
    const selected = await reopenedClient.all<{ user_id: string }>(
      `SELECT user_id FROM ${USER_TABLE}`,
    );
    const rows = selected.map((r) => r.user_id).sort();

    expect(rows).toEqual(["local-anon", "user-b"]);
  });

  it("does not touch the shared store when there is no real userId to scope by (defensive — this call site never fires today)", async () => {
    setSqliteUser("local-anon");
    const handle = await getSqliteDb();
    const client = handle.migrationClient();

    client.exec(
      `CREATE TABLE IF NOT EXISTS ${USER_TABLE} (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT)`,
    );
    await client.run(
      `INSERT INTO ${USER_TABLE} (id, user_id, name) VALUES (?, ?, ?)`,
      ["h-anon", "local-anon", "Stretch"],
    );

    await wipeSqliteDb();

    setSqliteUser("local-anon");
    const reopened = await getSqliteDb();
    const rows = await reopened
      .migrationClient()
      .all<{ user_id: string }>(`SELECT user_id FROM ${USER_TABLE}`);
    expect(rows).toEqual([{ user_id: "local-anon" }]);
  });
});
