/**
 * Tiny shared helper for SPIKE-library unit tests.
 *
 * Wraps an in-process `better-sqlite3` engine in the same
 * `SqliteMigrationClient` (`{exec, run, all}`) interface that the
 * SPIKE library accepts at runtime, then runs the bundled SPIKE
 * migrations on it. The result is a freshly-migrated SQLite database
 * ready for repo / sync-engine assertions — no jsdom, no sqlite-wasm,
 * no async timing surprises.
 *
 * `better-sqlite3` is resolvable from `apps/web` through the hoisted
 * workspace node_modules (it's a devDep of `@sergeant/db-schema`).
 * The require is therefore safe in Node-side vitest runs and never
 * lands in the production bundle since this file lives under
 * `__tests__/`.
 */

import { createRequire } from "node:module";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { migrateRoutineSpike } from "../clientMigrate.js";

// Resolve via createRequire so the test file stays ESM-friendly.
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
 * and apply the SPIKE migrations. Callers invoke `close()` from
 * `afterEach` so each test sees a fresh DB.
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
  await migrateRoutineSpike(client);
  return {
    db,
    client,
    close() {
      db.close();
    },
  };
}
