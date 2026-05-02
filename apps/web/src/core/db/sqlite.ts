import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import * as sqliteSchema from "@sergeant/db-schema/sqlite";
import { addSentryBreadcrumb } from "../observability/sentry.js";

/**
 * Lazy-loaded SQLite-WASM client for `apps/web` (PR #015 in
 * `docs/planning/storage-roadmap.md`).
 *
 * Why this lives outside the main bundle:
 *
 * - `@sqlite.org/sqlite-wasm` is ~700 KB brotli (JS + WASM) — way more than
 *   the home-screen budget allows. The whole package is therefore loaded via
 *   `await import(...)` inside {@link getSqliteDb} so it lands in its own
 *   async chunk and only ships when a feature actually opens the DB.
 * - The first caller will be the `routine` SPIKE in PR #022. Until then,
 *   nothing in `main.tsx` references this module — see the static-analysis
 *   guard in `__tests__/sqlite.lazy.test.ts` which fails the build the
 *   moment it slips into the eager graph.
 *
 * VFS selection (best → worst):
 *
 * 1. **OPFS-SAH Pool** — persistent, durable, no COOP/COEP needed
 *    (`installOpfsSAHPoolVfs()`). Available in Chrome 86+, Firefox 111+,
 *    Safari 17+ on the main thread.
 * 2. **kvvfs (`localStorage`)** — persistent fallback for older Safari /
 *    iOS < 16.4 where `FileSystemSyncAccessHandle` is missing. Capped at
 *    ~5 MB by the browser; sufficient as a stop-gap until a true IDB-VFS
 *    lands.
 * 3. **`:memory:`** — last resort so the contract still resolves; data
 *    does not survive a reload.
 *
 * Concurrency: every caller awaits the same in-flight init promise — see
 * the dedupe logic in {@link getSqliteDb}. We never expose raw sqlite-wasm
 * globals to feature code.
 */

type SqliteWasmModule = typeof import("@sqlite.org/sqlite-wasm");
type Sqlite3Static = Awaited<ReturnType<SqliteWasmModule["default"]>>;
type Sqlite3Database = InstanceType<Sqlite3Static["oo1"]["DB"]>;
type ExecOptionsArg = Parameters<Sqlite3Database["exec"]>[0];
type ExecOptions = Exclude<ExecOptionsArg, string | readonly string[]>;
type BindArg = ExecOptions["bind"];

/** Names the runtime VFS the DB was opened against. */
export type SqliteVfs = "opfs-sahpool" | "kvvfs" | "memory";

export type SqliteSchema = typeof sqliteSchema;

export interface SqliteDbHandle {
  /** Drizzle-typed query API bound to `@sergeant/db-schema/sqlite`. */
  readonly drizzle: SqliteRemoteDatabase<SqliteSchema>;
  /** Which VFS the underlying DB was opened against. */
  readonly vfs: SqliteVfs;
  /** Whether the page met the COOP/COEP isolation requirement at init. */
  readonly crossOriginIsolated: boolean;
  /** Closes the underlying SQLite handle. */
  close(): Promise<void>;
}

let inFlight: Promise<SqliteDbHandle> | null = null;
let resolved: SqliteDbHandle | null = null;

/**
 * Resolves a singleton {@link SqliteDbHandle}. Concurrent callers receive
 * the same in-flight promise so initialisation only happens once.
 *
 * Throwing from init clears the cached promise so the next caller can
 * retry — otherwise a transient OPFS lock failure during boot would
 * permanently brick `getSqliteDb()` for the session.
 */
export function getSqliteDb(): Promise<SqliteDbHandle> {
  if (resolved) return Promise.resolve(resolved);
  if (inFlight) return inFlight;

  inFlight = initSqliteDb().then(
    (handle) => {
      resolved = handle;
      return handle;
    },
    (err: unknown) => {
      inFlight = null;
      throw err;
    },
  );
  return inFlight;
}

/**
 * Test-only escape hatch. Resets the singleton between test cases so each
 * one observes a fresh init. NOT exported from any public barrel.
 */
export function __resetSqliteDbForTests(): void {
  inFlight = null;
  resolved = null;
}

async function initSqliteDb(): Promise<SqliteDbHandle> {
  const coi = warnIfNotCrossOriginIsolated();

  // Lazy-load the heavy WASM module so it's not in the initial bundle.
  // Vite emits this as its own async chunk (see `manualChunks` in
  // `apps/web/vite.config.js`). Note: `sqlite3InitModule()` deliberately
  // takes no arguments — the upstream type definition omits the
  // Emscripten options (see sqlite-wasm PR #129).
  const sqlite3InitModule = await loadSqliteWasm();
  const sqlite3 = await sqlite3InitModule();

  const driver = await openDb(sqlite3);
  const proxy = makeProxyDriver(driver.db);
  const drizzleDb = drizzle<SqliteSchema>(proxy, { schema: sqliteSchema });

  return {
    drizzle: drizzleDb,
    vfs: driver.vfs,
    crossOriginIsolated: coi,
    async close() {
      driver.db.close();
    },
  };
}

/**
 * Detects whether the page is `crossOriginIsolated`. When it is not, the
 * plain Worker-backed OPFS VFS (which requires `SharedArrayBuffer`) is
 * unavailable. We surface this loudly in DevTools and as a Sentry
 * breadcrumb so production triage can correlate fallback usage with the
 * current header config — but we do NOT throw, since the OPFS-SAH Pool
 * VFS works without COOP/COEP and the kvvfs/memory fallbacks are always
 * available.
 *
 * COOP/COEP wiring itself is tracked separately as PR #016 in
 * `docs/planning/storage-roadmap.md`.
 */
function warnIfNotCrossOriginIsolated(): boolean {
  const isolated =
    typeof globalThis !== "undefined" &&
    typeof globalThis.crossOriginIsolated === "boolean"
      ? globalThis.crossOriginIsolated
      : false;

  if (isolated) return true;

  console.warn(
    "[sqlite] Page is not crossOriginIsolated — Cross-Origin-Opener-Policy " +
      "and Cross-Origin-Embedder-Policy headers are missing. The plain OPFS " +
      "VFS (worker-backed) cannot install without SharedArrayBuffer; falling " +
      "back to OPFS-SAH-Pool / kvvfs. See storage-roadmap PR #016 for the " +
      "header rollout.",
  );
  addSentryBreadcrumb({
    category: "storage",
    level: "warning",
    message: "sqlite: page is not crossOriginIsolated",
    data: { feature: "sqlite-wasm", missing: "COOP+COEP" },
  });

  return false;
}

async function loadSqliteWasm(): Promise<SqliteWasmModule["default"]> {
  // Dynamic import so the module ends up in its own async chunk.
  const mod: SqliteWasmModule = await import("@sqlite.org/sqlite-wasm");
  return mod.default;
}

interface OpenedDb {
  readonly db: Sqlite3Database;
  readonly vfs: SqliteVfs;
}

async function openDb(sqlite3: Sqlite3Static): Promise<OpenedDb> {
  // 1) Persistent: OPFS SyncAccessHandle Pool VFS — main-thread friendly,
  //    does not need COOP/COEP. Skip on environments without OPFS at all
  //    (jsdom, very old Safari) so we don't wait on a timeout.
  if (hasOpfsSupport()) {
    try {
      const pool = await sqlite3.installOpfsSAHPoolVfs({
        directory: "/sergeant/sqlite",
      });
      return { db: new pool.OpfsSAHPoolDb("sergeant.db"), vfs: "opfs-sahpool" };
    } catch (err) {
      console.warn("[sqlite] OPFS-SAH Pool VFS unavailable, falling back", err);
      addSentryBreadcrumb({
        category: "storage",
        level: "warning",
        message: "sqlite: opfs-sahpool init failed",
        data: { error: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  // 2) kvvfs — small (~5 MB) but persistent across reloads in non-OPFS
  //    browsers (Safari < 17 / iOS < 16.4). Worker-only contexts have no
  //    `localStorage`, so guard accordingly. The roadmap calls this slot
  //    "IDB-VFS"; sqlite-wasm doesn't ship a real IDB-backed VFS yet, so
  //    kvvfs is the closest persistent fallback.
  if (hasLocalStorage()) {
    try {
      return { db: new sqlite3.oo1.JsStorageDb("local"), vfs: "kvvfs" };
    } catch (err) {
      console.warn("[sqlite] kvvfs (localStorage) unavailable", err);
      addSentryBreadcrumb({
        category: "storage",
        level: "warning",
        message: "sqlite: kvvfs init failed",
        data: { error: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  // 3) Last resort — non-persistent. The DB still works, callers just
  //    lose data on reload.
  console.warn(
    "[sqlite] No persistent VFS available; using in-memory database. " +
      "Data will not survive a reload.",
  );
  return { db: new sqlite3.oo1.DB(":memory:", "ct"), vfs: "memory" };
}

function hasOpfsSupport(): boolean {
  if (typeof globalThis === "undefined") return false;
  const nav: Navigator | undefined = (globalThis as { navigator?: Navigator })
    .navigator;
  if (!nav) return false;
  // Need both the OPFS root AND the sync-access-handle path. The latter
  // only exists in workers on older browsers — but `installOpfsSAHPoolVfs`
  // itself spawns the worker it needs, so a positive feature-detect here
  // is sufficient as a heuristic.
  const storage: { getDirectory?: unknown } | undefined = nav.storage;
  if (!storage || typeof storage.getDirectory !== "function") return false;
  const handle: unknown = (globalThis as { FileSystemFileHandle?: unknown })
    .FileSystemFileHandle;
  return typeof handle === "function";
}

function hasLocalStorage(): boolean {
  if (typeof globalThis === "undefined") return false;
  const ls: Storage | undefined = (globalThis as { localStorage?: Storage })
    .localStorage;
  if (!ls) return false;
  try {
    const probe = "__sergeant_sqlite_probe__";
    ls.setItem(probe, "1");
    ls.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

type ProxyMethod = "run" | "all" | "values" | "get";

type ProxyCallback = (
  sql: string,
  params: unknown[],
  method: ProxyMethod,
) => Promise<{ rows: unknown[] }>;

/**
 * Adapts the synchronous sqlite-wasm `oo1.DB` API to the async
 * `drizzle-orm/sqlite-proxy` callback signature. Each call goes through
 * `Database#exec` with a row-mode that matches the requested drizzle
 * `method`:
 *
 * - `all` / `values` — `rowMode: 'array'` returns rows as arrays of
 *   column values (drizzle decodes column order from the prepared query).
 * - `get` — same as `all` but takes only the first row.
 * - `run` — `INSERT/UPDATE/DELETE` — no rows; returns an empty list.
 */
function makeProxyDriver(db: Sqlite3Database): ProxyCallback {
  return async (sql, params, method) => {
    const bind = toBind(params);
    switch (method) {
      case "run": {
        db.exec({ sql, bind });
        return { rows: [] };
      }
      case "all":
      case "values": {
        const rows = db.exec({
          sql,
          bind,
          rowMode: "array",
          returnValue: "resultRows",
        });
        return { rows: rows ?? [] };
      }
      case "get": {
        const rows = db.exec({
          sql,
          bind,
          rowMode: "array",
          returnValue: "resultRows",
        });
        return { rows: rows && rows.length > 0 ? [rows[0]] : [] };
      }
      default: {
        const exhaustive: never = method;
        throw new Error(
          `[sqlite] unsupported drizzle-proxy method: ${String(exhaustive)}`,
        );
      }
    }
  };
}

/**
 * Converts drizzle's loosely-typed `unknown[]` params into a `BindingSpec`
 * that sqlite-wasm accepts. Drizzle has already serialised JS values
 * (Date → ISO string, JSON → string, etc.) by the time they reach this
 * proxy, so we only need to forward the primitives sqlite-wasm understands.
 */
function toBind(params: unknown[]): BindArg {
  return params.map((p) => {
    if (p === null || p === undefined) return null;
    if (typeof p === "string") return p;
    if (typeof p === "number") return p;
    if (typeof p === "bigint") return p;
    if (typeof p === "boolean") return p;
    if (p instanceof Uint8Array) return p;
    if (p instanceof Int8Array) return p;
    if (p instanceof ArrayBuffer) return p;
    // Defensive: drizzle should already have stringified everything else
    // (Date / objects) — but if a custom column type slips through we
    // serialise to JSON rather than throw.
    return JSON.stringify(p);
  });
}
