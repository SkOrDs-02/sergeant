/**
 * Bootstrap wiring for the SQLite-backed `kv_store` warm-cache.
 *
 * Stage 9 / PR #062 of `docs/planning/storage-roadmap.md`. PR #060
 * landed the per-device `kv_store` SQLite table + bundled migration;
 * PR #061 landed the platform-agnostic `createSqliteKVStore` factory
 * with the warm-cache adapter pattern. This module is the web-side
 * boot wiring that sits between them — it owns the singleton
 * `kvStoreBoot` reference (`{ warmCache, loaded }`), the SQLite-bound
 * `SqliteKVStoreClient`, and the optional `BroadcastChannel('kv-store')`
 * for cross-tab parity.
 *
 * Boot sequence (from `bootstrapKvStore()`):
 *
 *   1. Resolve the lazy SQLite-WASM singleton (`getSqliteDb()`).
 *   2. Run the bundled `kv_store` migration via the shared
 *      `runMigrations()` runner (idempotent — second boot is a no-op).
 *   3. `SELECT key, value FROM kv_store` → populate `kvStoreBoot.warmCache`.
 *   4. If `kv_store` is empty AND `localStorage` has keys AND the
 *      one-time migration flag (`kv_store_migrated_v1`) is missing,
 *      bulk-import every LS key into `kv_store` (and the warm cache),
 *      then set the flag.
 *   5. Flip `kvStoreBoot.loaded = true`.
 *
 * The actual swap of `webKVStore` from LS-backed to SQLite-backed lives
 * in PR #063 — this PR only installs the bootstrap pump and leaves
 * `webKVStore` LS-backed. Until PR #063 lands, `kvStoreBoot.warmCache`
 * is populated but never read; the only user-visible side-effect is
 * the one-time LS→`kv_store` import (which is also benign since LS is
 * still the source of truth).
 *
 * Failure mode: if SQLite init throws or the migration runner fails,
 * we leave `kvStoreBoot.loaded = false`, log + Sentry-breadcrumb, and
 * the app continues with the existing LS-backed `webKVStore`. The
 * actual fallback-UI gate that PR #063 adds (`if (!boot.loaded) →
 * return webLsKv`) is what makes this safe in production.
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
import { runMigrations } from "@sergeant/db-schema/migrate";
import type {
  BroadcastChannelLike,
  KVStore,
  SqliteKVStoreBoot,
  SqliteKVStoreClient,
} from "@sergeant/shared";
import { createSqliteKVStore } from "@sergeant/shared";
import { addSentryBreadcrumb } from "../observability/sentry.js";
import { getSqliteDb, type SqliteDbHandle } from "./sqlite.js";

/**
 * Marker key written into `kv_store` once the one-time LS→`kv_store`
 * import has run. Stored in the same table so it survives a
 * `kv_store` reopen but disappears if a user wipes their browser
 * storage entirely (a wipe also drops `localStorage`, so re-running
 * the import is a no-op).
 */
const LS_MIGRATION_FLAG_KEY = "kv_store_migrated_v1";

/**
 * Channel name for cross-tab `kv_store` writes. Stable so `apps/web`
 * tabs running an older `apps/web` build still see the same
 * BroadcastChannel and observe writes from a freshly-loaded tab.
 */
export const KV_STORE_BC_NAME = "kv-store";

/**
 * Singleton {@link SqliteKVStoreBoot} reference. Shared by-reference
 * with `createSqliteKVStore` (in `@sergeant/shared`) so the adapter
 * sees `loaded` flip from `false` to `true` atomically once
 * {@link bootstrapKvStore} finishes the initial scan.
 *
 * Exported so PR #063 can wire this into `resolveStore()` —
 * `if (kvStoreBoot.loaded) return sqliteKv;` — without needing a
 * second source of truth.
 */
export const kvStoreBoot: SqliteKVStoreBoot = {
  warmCache: new Map<string, string>(),
  loaded: false,
};

/**
 * Shared {@link BroadcastChannelLike} for cross-tab `onChange`
 * propagation. `null` until {@link bootstrapKvStore} has had a chance
 * to construct it (browsers without `BroadcastChannel` — Safari
 * Private mode, very old WebViews — leave this `null`, and
 * `createSqliteKVStore` degrades to single-tab without complaint).
 *
 * Exported so PR #063 can pass it into `createSqliteKVStore({ crossTab })`
 * at adapter-construction time.
 */
let kvStoreCrossTab: BroadcastChannelLike | null = null;

/**
 * Memoized {@link SqliteKVStoreClient} bound to the live SQLite handle.
 * Populated at the end of {@link bootstrapKvStore} success and reused
 * across subsequent calls so an HMR re-run of the entry point sees the
 * same write client (and so the early-return branch can return it on
 * the second call).
 *
 * Stays `null` while bootstrap has not yet succeeded and on every
 * failure path — `getActiveSqliteKvStore()` returns `null` then,
 * which is the gate `apps/web/src/shared/lib/storage/storage.ts ::
 * resolveStore()` falls through on (PR #063 ladder).
 */
let activeSqliteClient: SqliteKVStoreClient | null = null;

/**
 * Memoized {@link KVStore} adapter built once `kvStoreBoot.loaded`
 * flips to `true`. Wraps {@link createSqliteKVStore} (from
 * `@sergeant/shared`) over the warm-cache, the SQLite write client,
 * and the cross-tab BroadcastChannel.
 *
 * Exported lookup ({@link getActiveSqliteKvStore}) returns this so
 * `apps/web/src/shared/lib/storage/storage.ts :: resolveStore()` can
 * pick it up post-boot without taking a hard import on the
 * adapter-construction call site (which would couple the LS-only test
 * suite to the SQLite-WASM module-init path).
 */
let activeSqliteKvStore: KVStore | null = null;

/** Test-only escape hatch — exported so unit tests can reset the singleton. */
export function __resetKvStoreBootForTests(): void {
  kvStoreBoot.warmCache.clear();
  kvStoreBoot.loaded = false;
  kvStoreCrossTab = null;
  activeSqliteClient = null;
  activeSqliteKvStore = null;
}

/**
 * Returns the cross-tab BroadcastChannel created during boot, or
 * `null` if {@link bootstrapKvStore} hasn't run yet, the runtime
 * lacks `BroadcastChannel`, or BC construction threw.
 */
export function getKvStoreCrossTab(): BroadcastChannelLike | null {
  return kvStoreCrossTab;
}

/**
 * Returns the SQLite-backed {@link KVStore} adapter (warm-cache reads
 * + async write-back + cross-tab BroadcastChannel) once
 * {@link bootstrapKvStore} has succeeded. Returns `null` while
 * bootstrap has not yet run, has not yet finished, or failed.
 *
 * `apps/web/src/shared/lib/storage/storage.ts :: resolveStore()` uses
 * this as the priority-1 branch in its ladder (PR #063):
 *
 * ```ts
 * const sqlite = getActiveSqliteKvStore();
 * if (sqlite) return makeDualWriteKvStore(sqlite, lsAdapter);
 * // else fall through to LS adapter or memory
 * ```
 */
export function getActiveSqliteKvStore(): KVStore | null {
  return activeSqliteKvStore;
}

/**
 * Build the {@link SqliteKVStoreClient} bound to the live SQLite
 * handle. Drizzle's `.onConflictDoUpdate` resolves the upsert in one
 * round-trip; a sync-throw or rejected promise routes through
 * `createSqliteKVStore`'s `onWriteError` hook.
 *
 * Exported so PR #063 can pass this into
 * `createSqliteKVStore({ sqlite })` at adapter-construction time.
 */
export function makeSqliteKvStoreClient(
  handle: SqliteDbHandle,
): SqliteKVStoreClient {
  return {
    async upsert(row) {
      const updatedAt = new Date(row.updatedAt);
      await handle.drizzle
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
      await handle.drizzle.delete(kvStore).where(eq(kvStore.key, key));
    },
  };
}

/**
 * Result of {@link bootstrapKvStore}. Exposed so callers (eventually
 * `apps/web/src/main.tsx` once PR #063 wires the swap) can branch on
 * whether the cold init succeeded — failures fall back to the
 * LS-backed `webKVStore` without crashing the app.
 */
export interface BootstrapKvStoreResult {
  /** Same reference as the exported {@link kvStoreBoot} singleton. */
  readonly boot: SqliteKVStoreBoot;
  /**
   * Same reference as {@link kvStoreCrossTab}. `null` when the
   * runtime lacks `BroadcastChannel` (single-tab fallback).
   */
  readonly crossTab: BroadcastChannelLike | null;
  /**
   * SQLite-bound write client passed straight to
   * `createSqliteKVStore` by PR #063. `null` when SQLite init failed
   * (in which case `boot.loaded` will also be `false`).
   */
  readonly sqlite: SqliteKVStoreClient | null;
  /**
   * `true` when SQLite init + migration + warm-cache scan all
   * completed. `false` means the app is degraded to the LS-backed
   * fallback (no SQLite write-back happens).
   */
  readonly loaded: boolean;
}

/**
 * Inputs the bootstrap helper accepts so unit tests can swap in a
 * fake SQLite handle, fake `localStorage`, and fake BroadcastChannel
 * constructor without touching globals.
 *
 * Production callers pass nothing — defaults route to {@link getSqliteDb},
 * `globalThis.localStorage`, and `globalThis.BroadcastChannel`.
 */
export interface BootstrapKvStoreOptions {
  readonly getDb?: () => Promise<SqliteDbHandle>;
  readonly localStorage?: BootstrapLocalStorage | null;
  readonly broadcastChannel?: BroadcastChannelLike | null;
  readonly now?: () => number;
  readonly onError?: (stage: string, error: unknown) => void;
}

/**
 * Sub-set of `Storage` consumed by the LS→`kv_store` one-time
 * importer. Defined structurally so unit tests can pass a plain
 * `Map`-backed fake without polyfilling the full `Storage` interface.
 */
export interface BootstrapLocalStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
}

/**
 * Run the SQLite warm-cache bootstrap.
 *
 * **Never throws.** Failures are reported via `opts.onError` and
 * leave `kvStoreBoot.loaded = false` so the LS fallback stays in
 * effect.
 *
 * Idempotent: if `bootstrapKvStore` has already populated the warm
 * cache (e.g. HMR re-runs `main.tsx`), the second call returns the
 * existing state without re-querying SQLite.
 */
export async function bootstrapKvStore(
  opts: BootstrapKvStoreOptions = {},
): Promise<BootstrapKvStoreResult> {
  if (kvStoreBoot.loaded) {
    return {
      boot: kvStoreBoot,
      crossTab: kvStoreCrossTab,
      sqlite: activeSqliteClient,
      loaded: true,
    };
  }

  const onError =
    opts.onError ??
    ((stage, err) => {
      console.warn(`[kvStoreBoot] ${stage} failed`, err);
      addSentryBreadcrumb({
        category: "storage",
        level: "warning",
        message: `kvStoreBoot: ${stage} failed`,
        data: { error: err instanceof Error ? err.message : String(err) },
      });
    });

  // Cross-tab BroadcastChannel: best-effort. Construction failure
  // (Safari Private mode, missing API) silently degrades to single-tab.
  if (kvStoreCrossTab === null) {
    kvStoreCrossTab = resolveBroadcastChannel(opts.broadcastChannel);
  }

  const getDb = opts.getDb ?? getSqliteDb;

  let handle: SqliteDbHandle;
  try {
    handle = await getDb();
  } catch (err) {
    onError("sqlite-init", err);
    return {
      boot: kvStoreBoot,
      crossTab: kvStoreCrossTab,
      sqlite: null,
      loaded: false,
    };
  }

  const migrationClient: SqliteMigrationClient = handle.migrationClient();
  try {
    await runMigrations({
      adapter: createSqliteAdapter(migrationClient),
      files: KV_STORE_CLIENT_MIGRATIONS,
      tableName: KV_STORE_MIGRATIONS_TABLE,
    });
  } catch (err) {
    onError("kv-store-migration", err);
    return {
      boot: kvStoreBoot,
      crossTab: kvStoreCrossTab,
      sqlite: null,
      loaded: false,
    };
  }

  // Populate warm cache from a single SELECT scan.
  try {
    const rows = await handle.drizzle
      .select({ key: kvStore.key, value: kvStore.value })
      .from(kvStore);
    for (const row of rows) {
      kvStoreBoot.warmCache.set(row.key, row.value);
    }
  } catch (err) {
    onError("kv-store-scan", err);
    return {
      boot: kvStoreBoot,
      crossTab: kvStoreCrossTab,
      sqlite: null,
      loaded: false,
    };
  }

  const sqliteClient = makeSqliteKvStoreClient(handle);

  // One-time LS→kv_store import. Skipped if the marker is already in
  // the warm cache (or the runtime has no localStorage at all).
  if (!kvStoreBoot.warmCache.has(LS_MIGRATION_FLAG_KEY)) {
    const ls = resolveLocalStorage(opts.localStorage);
    if (ls) {
      try {
        await migrateLocalStorageToKvStore({
          ls,
          sqliteClient,
          warmCache: kvStoreBoot.warmCache,
          now: opts.now ?? Date.now,
        });
      } catch (err) {
        // Migration failure is non-fatal — the boot continues with
        // whatever rows we did manage to import.
        onError("ls-migration", err);
      }
    }
  }

  kvStoreBoot.loaded = true;
  activeSqliteClient = sqliteClient;
  activeSqliteKvStore = createSqliteKVStore({
    sqlite: sqliteClient,
    boot: kvStoreBoot,
    ...(kvStoreCrossTab !== null ? { crossTab: kvStoreCrossTab } : {}),
    onWriteError: (op, key, error) => {
      console.warn(`[kvStoreBoot] sqlite ${op} for "${key}" failed`, error);
      addSentryBreadcrumb({
        category: "storage",
        level: "warning",
        message: `kvStore sqlite ${op} failed`,
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
    crossTab: kvStoreCrossTab,
    sqlite: sqliteClient,
    loaded: true,
  };
}

/**
 * Bulk-import every key currently in localStorage into `kv_store` +
 * the warm cache, then write the migration marker so a subsequent
 * boot is a no-op.
 *
 * Order:
 *  1. Walk `localStorage` once and snapshot every (key, value) pair.
 *     We snapshot up-front because a write-back into `kv_store`
 *     itself (when PR #063 has flipped `webKVStore` → SQLite) could
 *     mutate `localStorage` mid-walk.
 *  2. Upsert each row in turn. Failures on a single key are logged
 *     via `onWriteError`-style handling but do not abort the batch —
 *     a partial migration still makes progress.
 *  3. Stamp the migration marker.
 */
async function migrateLocalStorageToKvStore(args: {
  readonly ls: BootstrapLocalStorage;
  readonly sqliteClient: SqliteKVStoreClient;
  readonly warmCache: Map<string, string>;
  readonly now: () => number;
}): Promise<void> {
  const { ls, sqliteClient, warmCache, now } = args;

  const pairs: { key: string; value: string }[] = [];
  for (let i = 0; i < ls.length; i += 1) {
    const key = ls.key(i);
    if (key === null) continue;
    if (key === LS_MIGRATION_FLAG_KEY) continue;
    const value = ls.getItem(key);
    if (value === null) continue;
    pairs.push({ key, value });
  }

  for (const pair of pairs) {
    try {
      const updatedAt = now();
      await sqliteClient.upsert({
        key: pair.key,
        value: pair.value,
        updatedAt,
      });
      warmCache.set(pair.key, pair.value);
    } catch (err) {
      // Single-key failure: log and continue. Boot success does not
      // depend on every LS key making it across — the worst case is
      // that the next boot retries because the marker hasn't been
      // written yet.

      console.warn(
        `[kvStoreBoot] ls-migration: skipped key "${pair.key}"`,
        err,
      );
    }
  }

  const markerUpdatedAt = now();
  await sqliteClient.upsert({
    key: LS_MIGRATION_FLAG_KEY,
    value: new Date(markerUpdatedAt).toISOString(),
    updatedAt: markerUpdatedAt,
  });
  warmCache.set(LS_MIGRATION_FLAG_KEY, new Date(markerUpdatedAt).toISOString());
}

function resolveLocalStorage(
  override: BootstrapLocalStorage | null | undefined,
): BootstrapLocalStorage | null {
  if (override !== undefined) return override;
  try {
    const ls = (globalThis as { localStorage?: BootstrapLocalStorage })
      .localStorage;
    return ls ?? null;
  } catch {
    return null;
  }
}

interface BroadcastChannelCtor {
  new (name: string): BroadcastChannelLike;
}

function resolveBroadcastChannel(
  override: BroadcastChannelLike | null | undefined,
): BroadcastChannelLike | null {
  if (override !== undefined) return override;
  try {
    const Ctor = (globalThis as { BroadcastChannel?: BroadcastChannelCtor })
      .BroadcastChannel;
    if (typeof Ctor !== "function") return null;
    return new Ctor(KV_STORE_BC_NAME);
  } catch {
    return null;
  }
}
