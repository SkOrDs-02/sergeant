/**
 * Mobile SQLite client — expo-sqlite v15 + Drizzle ORM adapter.
 *
 * This module owns the on-device SQLite database for the mobile app.
 * Callers must NEVER touch `expo-sqlite` directly; instead they go
 * through the typed Drizzle client returned by `initSqlite()` /
 * `getSqliteDb()` so SQL stays on a single source of truth
 * (`@sergeant/db-schema/sqlite`).
 *
 * Lifecycle expectations (PR #018 of the storage roadmap):
 *
 * - **Lazy.** Importing this module does NOT open the database. Nothing
 *   here runs at app startup. The first `initSqlite()` / `getSqliteDb()`
 *   call (planned: routine SPIKE in PR #022) opens the file under
 *   expo-sqlite's default location (the app's documents directory's
 *   `SQLite/` subfolder, equivalent to
 *   `${FileSystem.documentDirectory}SQLite/${DATABASE_NAME}`).
 * - **Idempotent.** Concurrent callers race on the same `Promise`, so
 *   the underlying `expo-sqlite.openDatabaseAsync(...)` runs exactly
 *   once even when several features awake simultaneously.
 * - **Typed.** `getSqliteDb()` returns `ExpoSQLiteDatabase<typeof
 *   schema>` so caller-side queries get full table-shape inference.
 *
 * Schema migration is intentionally OUT OF SCOPE here. PR #019 ships
 * the cross-platform runner; until then this module just opens the
 * database and hands back a Drizzle client that points at it. Anyone
 * importing `getSqliteDb()` before migrations exist must guard against
 * missing tables themselves — this is fine because the first real
 * caller (PR #022) lands strictly after PR #019.
 */
import { drizzle, type ExpoSQLiteDatabase } from "drizzle-orm/expo-sqlite";
import * as ExpoSQLite from "expo-sqlite";
import * as schema from "@sergeant/db-schema/sqlite";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import {
  createExpoSqliteRawClient,
  type ExpoSqliteAsyncHandle,
} from "./expoSqliteAdapter.js";

/**
 * Filename of the on-device SQLite database. expo-sqlite stores it at
 * `${FileSystem.documentDirectory}SQLite/${DATABASE_NAME}` by default,
 * which is the iOS / Android documents sandbox — durable across
 * relaunches, excluded from app-bundle backup unless explicitly opted
 * in via the platform-specific `excludeFromBackup` config.
 */
export const DATABASE_NAME = "sergeant.db";

/**
 * Re-exported schema bag so callers can do
 *   `import { schema } from "@/core/db/sqlite"`
 * and reach `schema.moduleData` etc. without a second import line.
 */
export { schema };

/** Drizzle client typed against the SQLite dialect of `@sergeant/db-schema`. */
export type SqliteDb = ExpoSQLiteDatabase<typeof schema>;

/**
 * Drizzle's `transaction` callback receives a transaction-scoped client
 * with the same query API as the parent. We re-export the inferred
 * parameter type so callers can annotate their `withTransaction` work
 * functions with a stable name.
 */
export type SqliteTx = Parameters<Parameters<SqliteDb["transaction"]>[0]>[0];

/**
 * Active singleton. `null` until `initSqlite()` resolves the first
 * time. Held across the whole JS lifetime — expo-sqlite owns the
 * native handle, so closing/reopening on every call would be wasteful.
 */
let dbInstance: SqliteDb | null = null;

/**
 * Native expo-sqlite handle held alongside the Drizzle wrapper so we
 * can hand out a `SqliteMigrationClient` (the `{exec, run, all}`
 * shape used by the routine SPIKE library + the Stage 4 PR #024
 * dual-write adapter) without re-opening the file.
 *
 * Re-opening would force expo-sqlite to acquire a second handle on
 * the same DB, which deadlocks under WAL on iOS — see
 * `apps/mobile/src/core/db/expoSqliteAdapter.ts` for the wrapper
 * that turns this handle into the raw-SQL client.
 */
let nativeInstance: ExpoSQLite.SQLiteDatabase | null = null;

/**
 * In-flight initialization promise. While `initSqlite()` is running,
 * concurrent callers await this same promise so the underlying
 * `openDatabaseAsync` call is deduped to one open per process.
 */
let initPromise: Promise<SqliteDb> | null = null;

/**
 * Idempotently open the on-device SQLite database and return a typed
 * Drizzle client.
 *
 * - Multiple concurrent callers receive the same Promise (no double
 *   open).
 * - Subsequent calls after resolution return the cached instance
 *   synchronously through the Promise.
 * - Errors during open clear the in-flight promise so a later retry
 *   gets a fresh attempt instead of latching onto a rejected Promise.
 */
export async function initSqlite(): Promise<SqliteDb> {
  if (dbInstance) return dbInstance;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const native = await ExpoSQLite.openDatabaseAsync(DATABASE_NAME);
      const db = drizzle(native, { schema });
      dbInstance = db;
      nativeInstance = native;
      return db;
    } catch (err) {
      // Drop the failed promise so the next caller can retry instead
      // of awaiting a rejection forever.
      initPromise = null;
      throw err;
    }
  })();
  return initPromise;
}

/**
 * Resolves a `SqliteMigrationClient` (`{exec, run, all}`) backed by
 * the same native handle the singleton's Drizzle client uses.
 *
 * Use cases:
 *  - Stage 4 PR #024 routine dual-write adapter — keeps the SQL
 *    surface identical between web (sqlite-wasm) and mobile
 *    (expo-sqlite) so a single adapter implementation serves both.
 *  - Unit-tests that need raw `{exec, run, all}` against a real
 *    expo-sqlite instance (rare — most mobile tests inject a fake
 *    handle through `createExpoSqliteRawClient` directly).
 *
 * Awaits `initSqlite()` first, so callers do not need to ensure the
 * singleton is hot.
 */
export async function getSqliteMigrationClient(): Promise<SqliteMigrationClient> {
  await initSqlite();
  if (!nativeInstance) {
    throw new Error(
      "[sqlite] getSqliteMigrationClient(): native handle missing after initSqlite()",
    );
  }
  // expo-sqlite's `SQLiteDatabase` declares `runAsync` / `getAllAsync`
  // as overload sets, which structurally do not unify with our minimal
  // `ExpoSqliteAsyncHandle`. Cherry-pick the methods so the adapter
  // sees the simple `(sql, params) => Promise<…>` shape it expects,
  // without bypassing the type system.
  const native = nativeInstance;
  const handle: ExpoSqliteAsyncHandle = {
    execAsync: (sql) => native.execAsync(sql),
    runAsync: (sql, params) => native.runAsync(sql, params as never[]),
    getAllAsync: <R>(sql: string, params: readonly unknown[]) =>
      native.getAllAsync<R>(sql, params as never[]),
  };
  return createExpoSqliteRawClient(handle);
}

/**
 * Synchronous accessor for code paths that have already awaited
 * `initSqlite()` at least once. Throws if called before init — this
 * is intentional: it forces feature modules to declare their intent
 * to use SQLite up front, instead of silently opening the database
 * from arbitrary call sites.
 */
export function getSqliteDb(): SqliteDb {
  if (!dbInstance) {
    throw new Error(
      "[sqlite] getSqliteDb() called before initSqlite() resolved. " +
        "Await initSqlite() once at the entry point of any feature " +
        "that needs on-device SQLite (planned: routine SPIKE in PR #022).",
    );
  }
  return dbInstance;
}

/**
 * Run `work` inside a Drizzle transaction. Commits on resolved return
 * value; rolls back on a thrown error and re-throws.
 *
 * The expo-sqlite Drizzle adapter uses the **synchronous** SQLite
 * transaction API under the hood (`begin` / `commit` / `rollback`
 * issued via `runSync`). We expose `withTransaction` as async so
 * callers can do async I/O surrounding the SQLite work — but the work
 * function itself must be synchronous, matching Drizzle's contract:
 * ```ts
 * await withTransaction((tx) => {
 *   tx.insert(schema.moduleData).values({ ... }).run();
 *   const rows = tx.select().from(schema.moduleData).all();
 *   return rows;
 * });
 * ```
 *
 * The helper resolves `initSqlite()` first, so callers do not need to
 * await it separately.
 */
export async function withTransaction<T>(
  work: (tx: SqliteTx) => T,
): Promise<T> {
  const db = await initSqlite();
  return db.transaction(work);
}

/**
 * Test-only reset hook. Drops the cached singleton and the in-flight
 * promise so a subsequent `initSqlite()` re-opens the underlying
 * native database. Production code MUST NOT call this — it is wired
 * exclusively for Jest's `beforeEach` to keep tests independent.
 *
 * Exposed under a `_resetForTests` name (not stripped by the bundler)
 * because the existing mobile testing pattern (see
 * `react-native-mmkv` mock in `jest.setup.js` and `MMKV.__resetForTests`)
 * already follows the same convention for native-module shims.
 */
export function _resetSqliteForTests(): void {
  dbInstance = null;
  nativeInstance = null;
  initPromise = null;
}
