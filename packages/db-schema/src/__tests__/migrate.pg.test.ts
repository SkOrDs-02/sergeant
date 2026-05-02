import { describe, expect, it, beforeEach } from "vitest";
import { newDb, type IMemoryDb } from "pg-mem";
import { runMigrations, MigrationFailedError } from "../migrate/runner.js";
import { createPgAdapter, type PgQueryClient } from "../migrate/adapters/pg.js";
import type { MigrationFile } from "../migrate/types.js";

/**
 * End-to-end tests against a real Postgres surface via `pg-mem`. We
 * deliberately use pg-mem rather than testcontainers here so the suite
 * stays fast (~hundreds of ms) and runs in environments without
 * Docker. The wider rollback-sanity guard for the server's actual
 * SQL files lives in `apps/server/src/migrations/__tests__/rollback-sanity.test.ts`
 * — that one needs real Postgres because it exercises FK + check
 * constraint syntax pg-mem ignores.
 */

interface PgMemHarness {
  db: IMemoryDb;
  client: PgQueryClient;
}

function harness(): PgMemHarness {
  // `noAstCoverageCheck` works around a pg-mem strictness check that
  // trips on `CREATE TABLE IF NOT EXISTS` re-runs against an existing
  // table whose default expression includes `NOW()`. The check is a
  // pg-mem-internal warning, not a real Postgres incompatibility — the
  // SQL is valid Postgres and runs fine in production. See pg-mem's
  // `MemoryDbOptions.noAstCoverageCheck` doc for the upstream advice.
  const db = newDb({ noAstCoverageCheck: true });
  const adapters = db.adapters.createPg();
  const pool = new adapters.Pool();
  const client: PgQueryClient = {
    query: async (sql: string, params?: unknown[]) => {
      const result = await pool.query(sql, params ?? []);
      return { rows: result.rows as Array<Record<string, unknown>> };
    },
  };
  return { db, client };
}

function rowsToString(
  rows: ReadonlyArray<Record<string, unknown>>,
  key: string,
): string[] {
  return rows.map((r) => {
    const value = r[key];
    if (typeof value !== "string") {
      throw new Error(
        `Expected string at "${key}", got ${JSON.stringify(value)}`,
      );
    }
    return value;
  });
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

describe("runMigrations × pg adapter (pg-mem)", () => {
  let h: PgMemHarness;
  beforeEach(() => {
    h = harness();
  });

  it("rolls forward: applies all files and populates the ledger + schema", async () => {
    const result = await runMigrations({
      adapter: createPgAdapter(h.client),
      files: FILES,
    });
    expect(result.applied).toEqual(FILES.map((f) => f.name));
    expect(result.skipped).toEqual([]);

    // Ledger populated with one row per file, in insertion order.
    const ledger = await h.client.query(
      'SELECT name FROM "__migrations" ORDER BY id ASC',
    );
    expect(rowsToString(ledger.rows, "name")).toEqual(FILES.map((f) => f.name));

    // Schema actually exists.
    const tables = await h.client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' ORDER BY table_name`,
    );
    expect(rowsToString(tables.rows, "table_name")).toEqual([
      "__migrations",
      "alpha",
      "beta",
    ]);

    // Seed migration ran — verify rows exist in `alpha`.
    const alpha = await h.client.query(
      "SELECT label FROM alpha ORDER BY id ASC",
    );
    expect(rowsToString(alpha.rows, "label")).toEqual(["first", "second"]);
  });

  it("re-running over an already-migrated db inserts no rows and runs no migration SQL", async () => {
    const adapter = createPgAdapter(h.client);
    await runMigrations({ adapter, files: FILES });

    // Snapshot the alpha contents — the seed migration must NOT
    // re-run, otherwise we'd see 4 rows instead of 2.
    const before = await h.client.query("SELECT count(*) AS count FROM alpha");
    expect(Number(before.rows[0]!["count"])).toBe(2);

    const second = await runMigrations({ adapter, files: FILES });
    expect(second.applied).toEqual([]);
    expect(second.skipped).toEqual(FILES.map((f) => f.name));

    const after = await h.client.query("SELECT count(*) AS count FROM alpha");
    expect(Number(after.rows[0]!["count"])).toBe(2);

    const ledger = await h.client.query(
      'SELECT name FROM "__migrations" ORDER BY id ASC',
    );
    expect(rowsToString(ledger.rows, "name")).toEqual(FILES.map((f) => f.name));
  });

  it("aborts on a broken migration and resumes on retry once the file is fixed", async () => {
    const adapter = createPgAdapter(h.client);
    const broken: MigrationFile = {
      name: "002_create_beta.sql",
      sql: "CREATE TABLE beta (id INTEGER PRIMARY KEY); SYNTAX ERROR HERE;",
    };
    const firstBatch: MigrationFile[] = [FILES[0]!, broken, FILES[2]!];

    await expect(
      runMigrations({ adapter, files: firstBatch }),
    ).rejects.toBeInstanceOf(MigrationFailedError);

    // Ledger keeps the first migration; the broken one is NOT recorded
    // and the third one was never attempted.
    const ledgerAfterFail = await h.client.query(
      'SELECT name FROM "__migrations" ORDER BY id ASC',
    );
    expect(rowsToString(ledgerAfterFail.rows, "name")).toEqual([
      "001_create_alpha.sql",
    ]);

    // The schema reflects the first migration only. Beta was rolled
    // back atomically by the adapter's BEGIN/ROLLBACK pair.
    const tables = await h.client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' ORDER BY table_name`,
    );
    expect(rowsToString(tables.rows, "table_name")).toEqual([
      "__migrations",
      "alpha",
    ]);

    // Retry with the file fixed — runner resumes from the broken file.
    const second = await runMigrations({ adapter, files: FILES });
    expect(second.applied).toEqual([
      "002_create_beta.sql",
      "003_seed_alpha.sql",
    ]);
    expect(second.skipped).toEqual(["001_create_alpha.sql"]);

    const ledgerAfterFix = await h.client.query(
      'SELECT name FROM "__migrations" ORDER BY id ASC',
    );
    expect(rowsToString(ledgerAfterFix.rows, "name")).toEqual(
      FILES.map((f) => f.name),
    );
  });

  it("respects a custom ledger table name", async () => {
    const adapter = createPgAdapter(h.client);
    const result = await runMigrations({
      adapter,
      files: FILES,
      tableName: "schema_migrations",
    });
    expect(result.tableName).toBe("schema_migrations");
    const rows = await h.client.query(
      'SELECT name FROM "schema_migrations" ORDER BY id ASC',
    );
    expect(rowsToString(rows.rows, "name")).toEqual(FILES.map((f) => f.name));
  });
});
