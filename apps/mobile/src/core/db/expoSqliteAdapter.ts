import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

/**
 * Adapter that wraps an `expo-sqlite` v15 database handle in the
 * minimal `{exec, run, all}` interface used by the migration runner
 * and the routine dual-write adapter.
 *
 * Maps:
 *
 *  - `exec(sql)`             → `db.execAsync(sql)` — multi-statement DDL.
 *  - `run(sql, params)`      → `db.runAsync(sql, params)` — single DML.
 *  - `all<R>(sql, params)`   → `db.getAllAsync<R>(sql, params)` — SELECT.
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
