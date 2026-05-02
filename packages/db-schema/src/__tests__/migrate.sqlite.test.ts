import { describe, expect, it, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import { runMigrations, MigrationFailedError } from "../migrate/runner.js";
import {
  createSqliteAdapter,
  type SqliteMigrationClient,
} from "../migrate/adapters/sqlite.js";
import type { MigrationFile } from "../migrate/types.js";

/**
 * End-to-end tests for the SQLite adapter. We use `better-sqlite3`
 * here because it ships a synchronous in-process SQLite engine
 * (already a devDependency on `apps/mobile`) and because the adapter
 * intentionally accepts both sync and async clients via the same
 * surface — wrapping a sync engine in awaited promises is exactly the
 * shape `expo-sqlite` and the sqlite-wasm proxy expose at runtime.
 */

function syncClient(db: BetterSqliteDatabase): SqliteMigrationClient {
  return {
    exec(sql) {
      db.exec(sql);
    },
    run(sql, params) {
      db.prepare(sql).run(...(params as unknown[]));
    },
    all<R extends Record<string, unknown>>(
      sql: string,
      params?: readonly unknown[],
    ): R[] {
      const stmt = db.prepare(sql);
      const result = params ? stmt.all(...(params as unknown[])) : stmt.all();
      return result as R[];
    },
  };
}

const FILES: MigrationFile[] = [
  {
    name: "001_create_alpha.sql",
    sql: "CREATE TABLE alpha (id INTEGER PRIMARY KEY, label TEXT NOT NULL);",
  },
  {
    name: "002_create_beta.sql",
    sql: "CREATE TABLE beta (id INTEGER PRIMARY KEY, alpha_id INTEGER);",
  },
  {
    name: "003_seed_alpha.sql",
    sql: "INSERT INTO alpha (id, label) VALUES (1, 'first'), (2, 'second');",
  },
];

describe("runMigrations × sqlite adapter (better-sqlite3)", () => {
  let db: BetterSqliteDatabase;
  let client: SqliteMigrationClient;

  beforeEach(() => {
    db = new Database(":memory:");
    client = syncClient(db);
  });

  afterEach(() => {
    db.close();
  });

  it("rolls forward: applies all files and populates the ledger + schema", async () => {
    const result = await runMigrations({
      adapter: createSqliteAdapter(client),
      files: FILES,
    });
    expect(result.applied).toEqual(FILES.map((f) => f.name));
    expect(result.skipped).toEqual([]);

    const ledger = db
      .prepare('SELECT name FROM "__migrations" ORDER BY id ASC')
      .all() as { name: string }[];
    expect(ledger.map((r) => r.name)).toEqual(FILES.map((f) => f.name));

    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as { name: string }[];
    expect(tables.map((r) => r.name)).toEqual([
      "__migrations",
      "alpha",
      "beta",
    ]);

    const alpha = db
      .prepare("SELECT label FROM alpha ORDER BY id ASC")
      .all() as { label: string }[];
    expect(alpha.map((r) => r.label)).toEqual(["first", "second"]);
  });

  it("re-running over an already-migrated db inserts no rows and runs no migration SQL", async () => {
    const adapter = createSqliteAdapter(client);
    await runMigrations({ adapter, files: FILES });

    const before = db.prepare("SELECT count(*) AS c FROM alpha").get() as {
      c: number;
    };
    expect(before.c).toBe(2);

    const second = await runMigrations({ adapter, files: FILES });
    expect(second.applied).toEqual([]);
    expect(second.skipped).toEqual(FILES.map((f) => f.name));

    const after = db.prepare("SELECT count(*) AS c FROM alpha").get() as {
      c: number;
    };
    expect(after.c).toBe(2);

    const ledger = db
      .prepare('SELECT name FROM "__migrations" ORDER BY id ASC')
      .all() as { name: string }[];
    expect(ledger.map((r) => r.name)).toEqual(FILES.map((f) => f.name));
  });

  it("aborts on a broken migration and resumes on retry once the file is fixed", async () => {
    const adapter = createSqliteAdapter(client);
    const broken: MigrationFile = {
      name: "002_create_beta.sql",
      sql: "CREATE TABLE beta (id INTEGER PRIMARY KEY); SYNTAX ERROR HERE;",
    };
    const firstBatch: MigrationFile[] = [FILES[0]!, broken, FILES[2]!];

    await expect(
      runMigrations({ adapter, files: firstBatch }),
    ).rejects.toBeInstanceOf(MigrationFailedError);

    const ledgerAfterFail = db
      .prepare('SELECT name FROM "__migrations" ORDER BY id ASC')
      .all() as { name: string }[];
    expect(ledgerAfterFail.map((r) => r.name)).toEqual([
      "001_create_alpha.sql",
    ]);

    // Critically: SQLite can leave a half-applied DDL hanging open if
    // the adapter forgot to issue ROLLBACK. Verify `beta` does NOT
    // exist after the failure.
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as { name: string }[];
    expect(tables.map((r) => r.name)).toEqual(["__migrations", "alpha"]);

    // Retry with the file fixed.
    const second = await runMigrations({ adapter, files: FILES });
    expect(second.applied).toEqual([
      "002_create_beta.sql",
      "003_seed_alpha.sql",
    ]);
    expect(second.skipped).toEqual(["001_create_alpha.sql"]);

    const ledgerAfterFix = db
      .prepare('SELECT name FROM "__migrations" ORDER BY id ASC')
      .all() as { name: string }[];
    expect(ledgerAfterFix.map((r) => r.name)).toEqual(FILES.map((f) => f.name));
  });

  it("works when the client surface is asynchronous (Promise-returning)", async () => {
    // Mirror the expo-sqlite / sqlite-proxy contract by wrapping the
    // synchronous engine in awaited promises. The adapter must not
    // care.
    const asyncClient: SqliteMigrationClient = {
      async exec(sql) {
        await Promise.resolve();
        db.exec(sql);
      },
      async run(sql, params) {
        await Promise.resolve();
        db.prepare(sql).run(...(params as unknown[]));
      },
      async all<R extends Record<string, unknown>>(
        sql: string,
        params?: readonly unknown[],
      ): Promise<R[]> {
        await Promise.resolve();
        const stmt = db.prepare(sql);
        const result = params ? stmt.all(...(params as unknown[])) : stmt.all();
        return result as R[];
      },
    };

    const result = await runMigrations({
      adapter: createSqliteAdapter(asyncClient),
      files: FILES,
    });
    expect(result.applied).toEqual(FILES.map((f) => f.name));
  });
});
