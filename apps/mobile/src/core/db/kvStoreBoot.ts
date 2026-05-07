/**
 * Bootstrap wiring for the SQLite-backed `kv_store` warm-cache (mobile).
 *
 * Stage 9 / PR #065 of `docs/planning/storage-roadmap.md`. Mobile
 * counterpart of `apps/web/src/core/db/kvStoreBoot.ts` (PR #062).
 *
 * Boot sequence (from `bootstrapMobileKvStore()`):
 *
 *   1. Resolve the expo-sqlite singleton (`initSqlite()`).
 *   2. Run the bundled `kv_store` migration via the shared
 *      `runMigrations()` runner (idempotent — second boot is a no-op).
 *   3. `SELECT key, value FROM kv_store` → populate `kvStoreBoot.warmCache`.
 *   4. If the one-time MMKV→`kv_store` migration flag
 *      (`kv_store_mmkv_migrated_v1`) is missing in the warm cache,
 *      bulk-import every MMKV key into `kv_store` (and the warm cache),
 *      then set the flag.
 *   5. Flip `kvStoreBoot.loaded = true`.
 *
 * The actual swap of `mobileKVStore` from MMKV-backed to SQLite-backed
 * lives in `apps/mobile/src/lib/storage.ts` — this module only installs
 * the bootstrap pump. Until the swap is wired, `kvStoreBoot.warmCache`
 * is populated but never read.
 *
 * Failure mode: if SQLite init throws or the migration runner fails,
 * we leave `kvStoreBoot.loaded = false`, log + Sentry-breadcrumb, and
 * the app continues with the existing MMKV-backed `mobileKVStore`.
 */

import { eq } from "drizzle-orm";
import {
  KV_STORE_CLIENT_MIGRATIONS,
  KV_STORE_MIGRATIONS_TABLE,
} from "@sergeant/db-schema/sqlite";
import { kvStore } from "@sergeant/db-schema/sqlite";
import {
  createSqliteAdapter,
  type SqliteMigrationClient,
} from "@sergeant/db-schema/migrate/sqlite";
// Mirror of the web fix: import the runner from the dedicated
// `./migrate/runner` sub-path. The umbrella `./migrate` entry
// re-exports `loadMigrationFiles` from `./files.js`, which top-level
// imports `node:fs` / `node:path`. Metro tolerates that today, but
// the umbrella is banned by the `no-restricted-imports` guard so
// every client surface stays bundler-portable.
import { runMigrations } from "@sergeant/db-schema/migrate/runner";
import type {
  KVStore,
  SqliteKVStoreBoot,
  SqliteKVStoreClient,
} from "@sergeant/shared";
import { createSqliteKVStore } from "@sergeant/shared";
import { addSentryBreadcrumb } from "../../lib/observability";
import { initSqlite, getSqliteMigrationClient } from "./sqlite.js";
import type { SqliteDb } from "./sqlite.js";

/**
 * Marker key written into `kv_store` once the one-time MMKV→`kv_store`
 * import has run. Stored in the same table so it survives a database
 * reopen but disappears if a user wipes app data entirely (a wipe also
 * drops MMKV, so re-running the import is a no-op).
 */
const MMKV_MIGRATION_FLAG_KEY = "kv_store_mmkv_migrated_v1";

/**
 * Singleton {@link SqliteKVStoreBoot} reference. Shared by-reference
 * with `createSqliteKVStore` (in `@sergeant/shared`) so the adapter
 * sees `loaded` flip from `false` to `true` atomically once
 * {@link bootstrapMobileKvStore} finishes the initial scan.
 */
export const kvStoreBoot: SqliteKVStoreBoot = {
  warmCache: new Map<string, string>(),
  loaded: false,
};

/**
 * Memoized {@link SqliteKVStoreClient} bound to the live SQLite handle.
 * Populated at the end of {@link bootstrapMobileKvStore} success.
 */
let activeSqliteClient: SqliteKVStoreClient | null = null;

/**
 * Memoized {@link KVStore} adapter built once `kvStoreBoot.loaded`
 * flips to `true`. Wraps {@link createSqliteKVStore} (from
 * `@sergeant/shared`) over the warm-cache and the SQLite write client.
 *
 * No `BroadcastChannel` on mobile — single process, no cross-tab.
 */
let activeSqliteKvStore: KVStore | null = null;

/** Test-only escape hatch — exported so unit tests can reset the singleton. */
export function __resetKvStoreBootForTests(): void {
  kvStoreBoot.warmCache.clear();
  kvStoreBoot.loaded = false;
  activeSqliteClient = null;
  activeSqliteKvStore = null;
}

/**
 * Returns the SQLite-backed {@link KVStore} adapter (warm-cache reads
 * + async write-back) once {@link bootstrapMobileKvStore} has succeeded.
 * Returns `null` while bootstrap has not yet run, has not yet finished,
 * or failed.
 *
 * `apps/mobile/src/lib/storage.ts :: resolveStore()` uses this as the
 * priority-1 branch in its two-rung ladder (PR #065):
 *
 * ```ts
 * const sqlite = getActiveSqliteKvStore();
 * if (sqlite) return makeDualWriteKvStore(sqlite, mmkvAdapter);
 * // else fall through to MMKV adapter
 * ```
 */
export function getActiveSqliteKvStore(): KVStore | null {
  return activeSqliteKvStore;
}

/**
 * Build the {@link SqliteKVStoreClient} bound to the live Drizzle
 * handle. expo-sqlite Drizzle is async (returns Promises), which the
 * `SqliteKVStoreClient` interface supports (`void | Promise<void>`).
 */
function makeSqliteKvStoreClient(db: SqliteDb): SqliteKVStoreClient {
  return {
    async upsert(row) {
      const updatedAt = new Date(row.updatedAt);
      await db
        .insert(kvStore)
        .values({
          key: row.key,
          value: row.value,
          updatedAt,
        })
        .onConflictDoUpdate({
          target: kvStore.key,
          set: { value: row.value, updatedAt },
        });
    },
    async remove(key) {
      await db.delete(kvStore).where(eq(kvStore.key, key));
    },
  };
}

/**
 * Result of {@link bootstrapMobileKvStore}.
 */
export interface BootstrapMobileKvStoreResult {
  readonly boot: SqliteKVStoreBoot;
  readonly sqlite: SqliteKVStoreClient | null;
  readonly loaded: boolean;
}

/**
 * Inputs the bootstrap helper accepts so unit tests can swap in fakes
 * without touching globals.
 */
export interface BootstrapMobileKvStoreOptions {
  readonly getDb?: () => Promise<SqliteDb>;
  readonly getMigrationClient?: () => Promise<SqliteMigrationClient>;
  /** MMKV accessor for the one-time migration. `null` to skip. */
  readonly mmkv?: MmkvMigrationSource | null;
  readonly now?: () => number;
  readonly onError?: (stage: string, error: unknown) => void;
}

/**
 * Sub-set of MMKV consumed by the MMKV→`kv_store` one-time importer.
 * Defined structurally so unit tests can pass a plain stub without
 * importing the native `react-native-mmkv` module.
 */
export interface MmkvMigrationSource {
  getAllKeys(): string[];
  getString(key: string): string | undefined;
}

/**
 * Run the SQLite warm-cache bootstrap for mobile.
 *
 * **Never throws.** Failures are reported via `opts.onError` and
 * leave `kvStoreBoot.loaded = false` so the MMKV fallback stays in
 * effect.
 *
 * Idempotent: if `bootstrapMobileKvStore` has already populated the
 * warm cache, the second call returns the existing state without
 * re-querying SQLite.
 */
export async function bootstrapMobileKvStore(
  opts: BootstrapMobileKvStoreOptions = {},
): Promise<BootstrapMobileKvStoreResult> {
  if (kvStoreBoot.loaded) {
    return {
      boot: kvStoreBoot,
      sqlite: activeSqliteClient,
      loaded: true,
    };
  }

  const onError =
    opts.onError ??
    ((stage, err) => {
      console.warn(`[kvStoreBoot:mobile] ${stage} failed`, err);
      addSentryBreadcrumb({
        category: "storage",
        level: "warning",
        message: `kvStoreBoot:mobile: ${stage} failed`,
        data: { error: err instanceof Error ? err.message : String(err) },
      });
    });

  // 1. Init expo-sqlite singleton.
  let db: SqliteDb;
  try {
    const getDb = opts.getDb ?? (async () => initSqlite());
    db = await getDb();
  } catch (err) {
    onError("sqlite-init", err);
    return { boot: kvStoreBoot, sqlite: null, loaded: false };
  }

  // 2. Run kv_store migrations.
  let migrationClient: SqliteMigrationClient;
  try {
    const getMc = opts.getMigrationClient ?? (() => getSqliteMigrationClient());
    migrationClient = await getMc();
  } catch (err) {
    onError("sqlite-migration-client", err);
    return { boot: kvStoreBoot, sqlite: null, loaded: false };
  }

  try {
    await runMigrations({
      adapter: createSqliteAdapter(migrationClient),
      files: KV_STORE_CLIENT_MIGRATIONS,
      tableName: KV_STORE_MIGRATIONS_TABLE,
    });
  } catch (err) {
    onError("kv-store-migration", err);
    return { boot: kvStoreBoot, sqlite: null, loaded: false };
  }

  // 3. Populate warm cache from a single SELECT scan.
  try {
    const rows = await db
      .select({ key: kvStore.key, value: kvStore.value })
      .from(kvStore);
    for (const row of rows) {
      kvStoreBoot.warmCache.set(row.key, row.value);
    }
  } catch (err) {
    onError("kv-store-scan", err);
    return { boot: kvStoreBoot, sqlite: null, loaded: false };
  }

  const sqliteClient = makeSqliteKvStoreClient(db);

  // 4. One-time MMKV→kv_store import. Skipped if the marker is already
  // in the warm cache (or the caller passed mmkv: null).
  if (!kvStoreBoot.warmCache.has(MMKV_MIGRATION_FLAG_KEY)) {
    const mmkv = resolveMmkv(opts.mmkv);
    if (mmkv) {
      try {
        await migrateMmkvToKvStore({
          mmkv,
          sqliteClient,
          warmCache: kvStoreBoot.warmCache,
          now: opts.now ?? Date.now,
        });
      } catch (err) {
        onError("mmkv-migration", err);
      }
    }
  }

  // 5. Flip loaded and build the KVStore adapter.
  kvStoreBoot.loaded = true;
  activeSqliteClient = sqliteClient;
  activeSqliteKvStore = createSqliteKVStore({
    sqlite: sqliteClient,
    boot: kvStoreBoot,
    onWriteError: (op, key, error) => {
      console.warn(
        `[kvStoreBoot:mobile] sqlite ${op} for "${key}" failed`,
        error,
      );
      addSentryBreadcrumb({
        category: "storage",
        level: "warning",
        message: `kvStore:mobile sqlite ${op} failed`,
        data: {
          key,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    },
    ...(opts.now ? { now: opts.now } : {}),
  });

  return {
    boot: kvStoreBoot,
    sqlite: sqliteClient,
    loaded: true,
  };
}

/**
 * Bulk-import every key currently in MMKV into `kv_store` + the warm
 * cache, then write the migration marker so a subsequent boot is a
 * no-op.
 */
async function migrateMmkvToKvStore(args: {
  readonly mmkv: MmkvMigrationSource;
  readonly sqliteClient: SqliteKVStoreClient;
  readonly warmCache: Map<string, string>;
  readonly now: () => number;
}): Promise<void> {
  const { mmkv, sqliteClient, warmCache, now } = args;

  const keys = mmkv.getAllKeys();
  for (const key of keys) {
    if (key === MMKV_MIGRATION_FLAG_KEY) continue;
    const value = mmkv.getString(key);
    if (value === undefined) continue;
    try {
      const updatedAt = now();
      await sqliteClient.upsert({ key, value, updatedAt });
      warmCache.set(key, value);
    } catch (err) {
      console.warn(
        `[kvStoreBoot:mobile] mmkv-migration: skipped key "${key}"`,
        err,
      );
    }
  }

  const markerUpdatedAt = now();
  await sqliteClient.upsert({
    key: MMKV_MIGRATION_FLAG_KEY,
    value: new Date(markerUpdatedAt).toISOString(),
    updatedAt: markerUpdatedAt,
  });
  warmCache.set(
    MMKV_MIGRATION_FLAG_KEY,
    new Date(markerUpdatedAt).toISOString(),
  );
}

/**
 * Resolve the MMKV instance for migration. `undefined` means "use the
 * live `_getMMKVInstance()`", `null` means "skip migration".
 */
function resolveMmkv(
  override: MmkvMigrationSource | null | undefined,
): MmkvMigrationSource | null {
  if (override !== undefined) return override;
  try {
    // Lazy import to avoid coupling the bootstrap to the storage module
    // at the module-evaluation level. The `_getMMKVInstance` export is
    // always available after `bootstrapEncryptedStorage()` has run.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { _getMMKVInstance } = require("../../lib/storage") as {
      _getMMKVInstance: () => MmkvMigrationSource;
    };
    return _getMMKVInstance();
  } catch {
    return null;
  }
}
