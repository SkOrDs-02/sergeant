/**
 * Shared test helper: in-memory SQLite with nutrition migrations applied.
 *
 * Wraps `better-sqlite3` in a `SqliteMigrationClient` and runs the
 * bundled nutrition migrations. The result is a freshly-migrated SQLite
 * database ready for dual-write / adapter assertions.
 *
 * Mirror of `apps/web/src/modules/fizruk/lib/dualWrite/__tests__/testSqlite.ts`.
 */

import { createRequire } from "node:module";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { migrateNutrition } from "../../clientMigrate.js";

const require = createRequire(import.meta.url);
type BetterSqliteCtor = new (filename: string) => BetterSqliteDatabase;
interface BetterSqliteDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): {
    run(...args: unknown[]): unknown;
    all(...args: unknown[]): unknown[];
    get(...args: unknown[]): unknown;
  };
  close(): unknown;
}
const Database = require("better-sqlite3") as BetterSqliteCtor;

export interface TestSqliteHandle {
  db: BetterSqliteDatabase;
  client: SqliteMigrationClient;
  close(): void;
}

/**
 * Open an in-memory SQLite engine, wrap it as a `SqliteMigrationClient`,
 * and apply the Nutrition migrations.
 */
export async function createTestSqlite(): Promise<TestSqliteHandle> {
  const db = new Database(":memory:");
  const client: SqliteMigrationClient = {
    exec(sql) {
      db.exec(sql);
    },
    run(sql, params) {
      db.prepare(sql).run(...((params ?? []) as unknown[]));
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
  await migrateNutrition(client);
  return {
    db,
    client,
    close() {
      db.close();
    },
  };
}
