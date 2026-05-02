import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

/**
 * Adapter that wraps an `expo-sqlite` v15 database handle in the
 * minimal `{exec, run, all}` interface used by the SPIKE library and
 * the migration runner.
 *
 * Maps:
 *
 *  - `exec(sql)`             → `db.execAsync(sql)` — multi-statement DDL.
 *  - `run(sql, params)`      → `db.runAsync(sql, params)` — single DML.
 *  - `all<R>(sql, params)`   → `db.getAllAsync<R>(sql, params)` — SELECT.
 *
 * Why an adapter exists: the mobile SQLite singleton in
 * `apps/mobile/src/core/db/sqlite.ts` exposes a Drizzle-typed client
 * for production callers, but the routine SPIKE deliberately keeps
 * its repo on raw SQL so the same code unit-tests against
 * `better-sqlite3` (see `apps/web/src/modules/routine/lib/sqliteSpike/__tests__`).
 * This adapter is the smallest possible bridge.
 *
 * The handle interface is declared structurally to keep the file
 * jest-friendly: tests can pass a hand-rolled fake without importing
 * the native expo-sqlite module.
 */

export interface ExpoSqliteAsyncHandle {
  execAsync(sql: string): Promise<unknown>;
  runAsync(sql: string, params: readonly unknown[]): Promise<unknown>;
  getAllAsync<R>(sql: string, params: readonly unknown[]): Promise<R[]>;
}

export function createExpoSqliteRawClient(
  handle: ExpoSqliteAsyncHandle,
): SqliteMigrationClient {
  return {
    async exec(sql) {
      await handle.execAsync(sql);
    },
    async run(sql, params) {
      await handle.runAsync(sql, (params ?? []) as readonly unknown[]);
    },
    async all<R extends Record<string, unknown>>(
      sql: string,
      params?: readonly unknown[],
    ): Promise<R[]> {
      return handle.getAllAsync<R>(sql, params ?? []);
    },
  };
}
