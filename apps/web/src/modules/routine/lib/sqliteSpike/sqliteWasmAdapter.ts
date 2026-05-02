/**
 * Adapter that wraps the sqlite-wasm `oo1.DB` instance held by the
 * web SQLite singleton (`apps/web/src/core/db/sqlite.ts`) in the
 * minimal `{exec, run, all}` interface used by the SPIKE repo and
 * migration runner.
 *
 * Why an adapter exists: `core/db/sqlite.ts` exposes a Drizzle-typed
 * client (`SqliteRemoteDatabase<Schema>`) — convenient for typed
 * queries but not a great fit for migration SQL or low-cardinality
 * raw queries. The same handle's underlying `oo1.DB` is wrapped here
 * once and reused by both the migration runner and the repo so we
 * stay consistent with what's persisted.
 *
 * The adapter awaits a `Promise<SqliteDbHandle>` so callers don't
 * need to thread `await` through every call site — they pass the
 * promise (or the resolved handle) and the adapter resolves on each
 * call. This trades a microscopic per-call promise tax for the
 * convenience of a single shared singleton.
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

/**
 * A subset of the sqlite-wasm `oo1.DB` exec API that the SPIKE needs.
 * We declare only the call shapes we actually use so jsdom-side tests
 * can pass a tiny stub without re-implementing the full sqlite-wasm
 * surface.
 */
export interface SqliteWasmExecutor {
  exec(arg: { sql: string; bind?: readonly unknown[] }): unknown;
  exec(arg: {
    sql: string;
    bind?: readonly unknown[];
    rowMode: "object";
    returnValue: "resultRows";
  }): unknown[];
}

/**
 * Wrap a sqlite-wasm `oo1.DB`-shaped object in the
 * `{exec, run, all}` `SqliteMigrationClient` contract.
 *
 * `exec` accepts multi-statement SQL strings; the SPIKE migration
 * runs `BEGIN` / migration body / `COMMIT` through this path.
 *
 * `run` is for parameterised single-statement DML; we always use
 * `bind` here so SQL values stay properly escaped.
 *
 * `all` runs SELECTs and reshapes the array-of-arrays return that
 * `oo1.DB#exec` produces in `rowMode: 'object'` into typed records.
 */
export function createSqliteWasmRawClient(
  db: SqliteWasmExecutor,
): SqliteMigrationClient {
  return {
    exec(sql) {
      db.exec({ sql });
    },
    run(sql, params) {
      db.exec({ sql, bind: params });
    },
    all(sql, params) {
      const rows = db.exec({
        sql,
        bind: params ?? [],
        rowMode: "object",
        returnValue: "resultRows",
      });
      return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
    },
  } as SqliteMigrationClient;
}
