import { afterEach, beforeEach, expect, it } from "vitest";
import Database from "better-sqlite3";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import { createSqliteAdapter } from "@sergeant/db-schema/migrate/sqlite";
import { ROUTINE_CLIENT_MIGRATIONS } from "@sergeant/db-schema/sqlite";
import { runMigrations } from "@sergeant/db-schema/migrate/runner";
import { applyPullOp, __resetApplyPullOpCachesForTests } from "./applyPullOp";

const USER = "concurrent-pull-owner";
const OLD = "2026-10-17T10:00:00.000Z";
const REMOTE = "2026-10-17T11:00:00.000Z";
const LOCAL = "2026-10-17T12:00:00.000Z";
let db: Database.Database;
let client: SqliteMigrationClient;

beforeEach(async () => {
  __resetApplyPullOpCachesForTests();
  db = new Database(":memory:");
  client = {
    exec(sql) {
      db.exec(sql);
    },
    run(sql, params = []) {
      db.prepare(sql).run(...params);
    },
    all<T extends Record<string, unknown>>(
      sql: string,
      params: readonly unknown[] = [],
    ) {
      return db.prepare(sql).all(...params) as T[];
    },
  };
  await runMigrations({
    adapter: createSqliteAdapter(client),
    files: ROUTINE_CLIENT_MIGRATIONS,
    tableName: "__routine_migrations",
  });
});
afterEach(() => db.close());

for (const table of ["routine_habits", "routine_entries"] as const) {
  for (const kind of ["insert", "delete"] as const) {
    it(`${table}: newer local edit survives an older pull ${kind} between read and write`, async () => {
      db.prepare(
        `INSERT INTO ${table} (id, user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      ).run("h1", USER, "old", OLD, OLD);
      let interleaved = false;
      const racing: SqliteMigrationClient = {
        ...client,
        async all<T extends Record<string, unknown>>(
          sql: string,
          params: readonly unknown[] = [],
        ) {
          const rows = await client.all<T>(sql, params);
          if (
            !interleaved &&
            sql.startsWith("SELECT updated_at") &&
            sql.includes(table)
          ) {
            interleaved = true;
            db.prepare(
              `UPDATE ${table} SET name = ?, updated_at = ? WHERE id = ?`,
            ).run("new local", LOCAL, "h1");
          }
          return rows;
        },
      };
      const outcome = await applyPullOp(
        racing,
        {
          id: 1,
          table,
          op: kind,
          row: {
            id: "h1",
            user_id: USER,
            name: "older remote",
            created_at: OLD,
          },
          client_ts: REMOTE,
          server_ts: REMOTE,
          origin_device_id: "peer",
        },
        USER,
        "this-device",
      );
      expect(interleaved).toBe(true);
      expect(outcome).toBe("skipped");
      expect(
        db.prepare(`SELECT name, updated_at, deleted_at FROM ${table}`).get(),
      ).toEqual({ name: "new local", updated_at: LOCAL, deleted_at: null });
    });
  }
}
