/**
 * Jest tests for `apps/mobile/src/core/db/sqlite.ts`.
 *
 * The module mocks `expo-sqlite` with a hand-rolled adapter backed by
 * `better-sqlite3` (an in-process SQLite engine that runs under Node).
 * The shim translates the synchronous methods that the
 * `drizzle-orm/expo-sqlite` driver actually invokes — `prepareSync`,
 * `runSync`, `executeSync`, `getAllSync`, `getFirstSync`,
 * `executeForRawResultSync`, `finalizeSync` — onto better-sqlite3's
 * own sync API. With the shim in place, the Drizzle client behaves
 * exactly like it would on a real device, so we can test:
 *
 *   - `initSqlite()` opens the underlying database exactly once even
 *     when several callers race the first init concurrently.
 *   - Round-trip insert / select on a real Drizzle schema works.
 *   - `withTransaction` rolls back when the inner work throws and
 *     re-raises the original error.
 */
import Database from "better-sqlite3";
import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";
import { eq } from "drizzle-orm";

// Variable name MUST start with `mock` so Jest's babel transform
// allows the `jest.mock` factory below to reference it (otherwise the
// hoisted factory rejects out-of-scope identifiers as a precaution
// against uninitialized mocks).
const mockOpenDatabaseAsync = jest.fn();

jest.mock("expo-sqlite", () => {
  return {
    __esModule: true,
    openDatabaseAsync: (name: string) => mockOpenDatabaseAsync(name),
  };
});

import {
  _resetSqliteForTests,
  DATABASE_NAME,
  initSqlite,
  withTransaction,
} from "../sqlite";

/**
 * Tiny smoke schema used purely for the round-trip / rollback tests.
 * Lives inline in the test file because production code in PR #018
 * does not own any tables yet — table ownership lives in
 * `@sergeant/db-schema/sqlite/*` and per-feature migration PRs.
 */
const smokeNotes = sqliteTable("__smoke_notes", {
  id: integer().primaryKey({ autoIncrement: true }),
  body: text().notNull(),
});

/**
 * Build an `expo-sqlite`-shaped object backed by a fresh
 * better-sqlite3 in-memory database. Everything the
 * `drizzle-orm/expo-sqlite` driver calls is implemented; everything
 * else throws so test failures point at the missing shim instead of
 * silently passing through to better-sqlite3.
 */
function makeFakeExpoSqliteDb(): {
  db: Database.Database;
  fake: Record<string, unknown>;
} {
  const db = new Database(":memory:");
  // The driver issues `begin` / `commit` / `rollback` (and savepoint
  // variants for nested transactions) as raw SQL through `runSync`.
  // better-sqlite3's `prepare(...).run()` is the equivalent.
  function runSync(
    source: string,
    params: unknown[] = [],
  ): { changes: number; lastInsertRowId: number } {
    const stmt = db.prepare(source);
    const info = stmt.run(...(params as never[]));
    return {
      changes: info.changes,
      lastInsertRowId: Number(info.lastInsertRowid),
    };
  }
  // Statements are returned by `prepareSync` and consumed by the
  // Drizzle session via `executeSync` / `executeForRawResultSync`.
  // We model the result as an object that exposes `getAllSync` /
  // `getFirstSync` so the driver's iteration patterns work.
  function prepareSync(source: string): Record<string, unknown> {
    let stmt = db.prepare(source);
    let lastResult: {
      changes: number;
      lastInsertRowId: number;
      rows: unknown[];
      rawRows: unknown[][];
    } | null = null;

    function execute(params: unknown[]): {
      changes: number;
      lastInsertRowId: number;
      getAllSync: () => unknown[];
      getFirstSync: () => unknown;
    } {
      // better-sqlite3 distinguishes statements that return rows vs.
      // statements that don't. `reader === true` means SELECT-shape
      // results; otherwise we use `run` and treat the result set as
      // empty so SELECT-vs-mutation paths don't cross-contaminate.
      if (stmt.reader) {
        const rows = stmt.all(...(params as never[]));
        const rawRows = rows.map((row) => Object.values(row as object));
        lastResult = {
          changes: 0,
          lastInsertRowId: 0,
          rows,
          rawRows,
        };
      } else {
        const info = stmt.run(...(params as never[]));
        lastResult = {
          changes: info.changes,
          lastInsertRowId: Number(info.lastInsertRowid),
          rows: [],
          rawRows: [],
        };
      }
      return {
        changes: lastResult.changes,
        lastInsertRowId: lastResult.lastInsertRowId,
        getAllSync: () => lastResult?.rows ?? [],
        getFirstSync: () => lastResult?.rows[0] ?? null,
      };
    }

    return {
      executeSync(params: unknown[] = []): unknown {
        return execute(params);
      },
      executeForRawResultSync(params: unknown[] = []): unknown {
        const result = execute(params);
        return {
          ...result,
          getAllSync: () => lastResult?.rawRows ?? [],
        };
      },
      finalizeSync(): void {
        // better-sqlite3 statements are GC-managed. The `stmt`
        // reference is dropped here so callers cannot reuse it after
        // finalization, mirroring expo-sqlite's contract.
        stmt = null as unknown as Database.Statement;
      },
    };
  }

  const fake: Record<string, unknown> = {
    runSync,
    prepareSync,
    execSync: (source: string): void => {
      db.exec(source);
    },
    closeSync: (): void => {
      db.close();
    },
  };
  return { db, fake };
}

beforeEach(() => {
  _resetSqliteForTests();
  mockOpenDatabaseAsync.mockReset();
});

describe("initSqlite — concurrent dedup", () => {
  it("opens the underlying database exactly once across concurrent callers", async () => {
    const { fake } = makeFakeExpoSqliteDb();
    // Resolve on the next macrotask so multiple concurrent callers
    // genuinely race the in-flight promise instead of all reading
    // the cached instance from the very first await.
    mockOpenDatabaseAsync.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(fake), 0)),
    );

    const [a, b, c, d] = await Promise.all([
      initSqlite(),
      initSqlite(),
      initSqlite(),
      initSqlite(),
    ]);

    expect(mockOpenDatabaseAsync).toHaveBeenCalledTimes(1);
    expect(mockOpenDatabaseAsync).toHaveBeenCalledWith(DATABASE_NAME);
    // Same Drizzle client instance handed back to every caller.
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(c).toBe(d);
  });

  it("returns the cached client on subsequent calls without reopening", async () => {
    const { fake } = makeFakeExpoSqliteDb();
    mockOpenDatabaseAsync.mockResolvedValue(fake);

    const first = await initSqlite();
    const second = await initSqlite();
    const third = await initSqlite();

    expect(first).toBe(second);
    expect(second).toBe(third);
    expect(mockOpenDatabaseAsync).toHaveBeenCalledTimes(1);
  });

  it("clears the in-flight promise on open failure so retries can succeed", async () => {
    const { fake } = makeFakeExpoSqliteDb();
    mockOpenDatabaseAsync
      .mockRejectedValueOnce(new Error("disk full"))
      .mockResolvedValueOnce(fake);

    await expect(initSqlite()).rejects.toThrow("disk full");
    const recovered = await initSqlite();

    expect(recovered).toBeDefined();
    expect(mockOpenDatabaseAsync).toHaveBeenCalledTimes(2);
  });
});

describe("Drizzle round-trip — insert + select", () => {
  it("persists a row through the typed Drizzle client and reads it back", async () => {
    const { db, fake } = makeFakeExpoSqliteDb();
    db.exec(
      "CREATE TABLE __smoke_notes (id INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT NOT NULL)",
    );
    mockOpenDatabaseAsync.mockResolvedValue(fake);

    const client = await initSqlite();
    client.insert(smokeNotes).values({ body: "hello" }).run();
    client.insert(smokeNotes).values({ body: "world" }).run();

    const rows = client
      .select()
      .from(smokeNotes)
      .all()
      .map((r) => r.body);

    expect(rows).toEqual(["hello", "world"]);
  });
});

describe("withTransaction — rollback on thrown error", () => {
  it("rolls back inserts when the inner work throws and re-raises", async () => {
    const { db, fake } = makeFakeExpoSqliteDb();
    db.exec(
      "CREATE TABLE __smoke_notes (id INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT NOT NULL)",
    );
    mockOpenDatabaseAsync.mockResolvedValue(fake);

    const client = await initSqlite();
    client.insert(smokeNotes).values({ body: "before-tx" }).run();

    const boom = new Error("boom");
    await expect(
      withTransaction((tx) => {
        tx.insert(smokeNotes).values({ body: "inside-tx" }).run();
        throw boom;
      }),
    ).rejects.toBe(boom);

    const remaining = client
      .select()
      .from(smokeNotes)
      .all()
      .map((r) => r.body);
    expect(remaining).toEqual(["before-tx"]);
  });

  it("commits when the inner work returns normally and yields its return value", async () => {
    const { db, fake } = makeFakeExpoSqliteDb();
    db.exec(
      "CREATE TABLE __smoke_notes (id INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT NOT NULL)",
    );
    mockOpenDatabaseAsync.mockResolvedValue(fake);

    const client = await initSqlite();

    const inserted = await withTransaction((tx) => {
      tx.insert(smokeNotes).values({ body: "committed" }).run();
      return tx
        .select()
        .from(smokeNotes)
        .where(eq(smokeNotes.body, "committed"))
        .all();
    });

    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.body).toBe("committed");

    const persisted = client
      .select()
      .from(smokeNotes)
      .all()
      .map((r) => r.body);
    expect(persisted).toEqual(["committed"]);
  });
});
