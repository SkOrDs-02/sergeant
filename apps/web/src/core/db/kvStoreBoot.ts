/**
 * Bootstrap wiring for the SQLite-backed `kv_store` warm-cache.
 *
 * Stage 9 / PR #062 of `https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/planning/archive/storage-roadmap.md`. PR #060
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
 *   4. Flip `kvStoreBoot.loaded = true`.
 *
 * PR #064 removed the one-time LS→`kv_store` migration (the 4-week
 * canary has passed without incidents) and the dual-write mirror in
 * `storage.ts`. `webKVStore` is now strictly SQLite-backed with an
 * LS-only fallback on bootstrap failure.
 *
 * Failure mode: if SQLite init throws or the migration runner fails,
 * we leave `kvStoreBoot.loaded = false`, log + Sentry-breadcrumb, and
 * the app continues with the LS-backed fallback in `resolveStore()`.
 */

// AI-DANGER: усі DB-залежності тут — ЛИШЕ `import type`.
// Значення підвантажуються через `loadDbDeps()` нижче. Мета: прибрати
// рантайм drizzle-orm (69 kB brotli, chunk `vendor-sqlite`) з eager-графа.
// Раніше тут стояли статичні імпорти `drizzle-orm`, `@sergeant/db-schema/sqlite`,
// `@sergeant/db-schema/migrate/{runner,sqlite}` і `./sqlite.js` — саме вони
// робили увесь drizzle-стек критичним шляхом, бо `main.tsx` статично
// імпортує `bootstrapKvStore` з цього файлу.
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import type {
  BroadcastChannelLike,
  KVStore,
  SqliteKVStore,
  SqliteKVStoreBoot,
  SqliteKVStoreClient,
} from "@sergeant/shared";
import { createSqliteKVStore } from "@sergeant/shared";
import { addSentryBreadcrumb } from "../observability/sentry.js";
import { logger } from "@shared/lib";
import type { SqliteDbHandle } from "./sqlite.js";

interface KvStoreDbDeps {
  readonly eq: typeof import("drizzle-orm").eq;
  readonly kvStore: typeof import("@sergeant/db-schema/sqlite").kvStore;
  readonly KV_STORE_CLIENT_MIGRATIONS: typeof import("@sergeant/db-schema/sqlite").KV_STORE_CLIENT_MIGRATIONS;
  readonly KV_STORE_MIGRATIONS_TABLE: typeof import("@sergeant/db-schema/sqlite").KV_STORE_MIGRATIONS_TABLE;
  readonly createSqliteAdapter: typeof import("@sergeant/db-schema/migrate/sqlite").createSqliteAdapter;
  readonly runMigrations: typeof import("@sergeant/db-schema/migrate/runner").runMigrations;
  readonly getSqliteDb: typeof import("./sqlite.js").getSqliteDb;
}

let dbDepsPromise: Promise<KvStoreDbDeps> | null = null;

/**
 * Lazily resolve every drizzle / db-schema value this module needs.
 *
 * The runner comes from the dedicated `./migrate/runner` sub-path rather
 * than `./migrate`: the umbrella entry re-exports `loadMigrationFiles`
 * from `./files.js`, which top-level imports `node:fs` / `node:path` and
 * breaks Vite's browser bundle (white screen on boot). The runner itself
 * is dialect- and platform-free. See routine/lib/clientMigrate.ts for the
 * same pattern.
 */
function loadDbDeps(): Promise<KvStoreDbDeps> {
  dbDepsPromise ??= (async () => {
    const [drizzleOrm, schema, migrateSqlite, migrateRunner, sqliteModule] =
      await Promise.all([
        import("drizzle-orm"),
        import("@sergeant/db-schema/sqlite"),
        import("@sergeant/db-schema/migrate/sqlite"),
        import("@sergeant/db-schema/migrate/runner"),
        import("./sqlite.js"),
      ]);
    return {
      eq: drizzleOrm.eq,
      kvStore: schema.kvStore,
      KV_STORE_CLIENT_MIGRATIONS: schema.KV_STORE_CLIENT_MIGRATIONS,
      KV_STORE_MIGRATIONS_TABLE: schema.KV_STORE_MIGRATIONS_TABLE,
      createSqliteAdapter: migrateSqlite.createSqliteAdapter,
      runMigrations: migrateRunner.runMigrations,
      getSqliteDb: sqliteModule.getSqliteDb,
    };
  })();
  return dbDepsPromise;
}

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
let activeSqliteKvStore: SqliteKVStore | null = null;

/**
 * Handle, з якого заповнено поточний warm-cache. Бут стартує ще на
 * анонімному розділі (сесія невідома), тож після входу
 * {@link refreshKvWarmCache} порівнює з ним живий handle і перечитує кеш,
 * лише якщо розділ справді інший.
 */
let scannedHandle: SqliteDbHandle | null = null;

/**
 * Ключі, записані, поки активним був анонімний розділ. Такий запис лягає в
 * `anon`, тож при перемиканні на акаунт його треба донести в розділ
 * користувача, інакше перечитаний кеш його затре. Стартуємо з `true`, бо бут
 * завжди на `anon`. Прапорець гаситься лише в момент застосування
 * перечитаного кешу: запис між перемиканням і сканом інакше загубився б.
 *
 * ponytail: множина росте, поки людина не увійде; стеля - кількість різних
 * KV-ключів застосунку.
 */
let anonPartitionActive = true;
const anonWrites = new Set<string>();

/** Лічильник перемикань: перечитування, яке наздогнав новий світч, не застосовується. */
let partitionGeneration = 0;
let refreshQueue: Promise<void> = Promise.resolve();
let bootInFlight: Promise<unknown> = Promise.resolve();
let bootSource: BootstrapKvStoreOptions = {};

function noteKvWrite(key: string): void {
  if (anonPartitionActive) anonWrites.add(key);
}

/**
 * Drop the in-memory SQLite warm-cache and unbind the active adapter.
 *
 * The warm cache is a process-lifetime `Map` populated once at boot from the
 * signed-in user's `kv_store` table. Wiping the on-disk SQLite DB on logout
 * (`wipeSqliteDb`) and purging the LS fallback does **not** touch this Map, so
 * without this reset a second user signing in on the same device *within the
 * same page session* (SPA logout → login, no reload) would still read the
 * previous user's values through `webKVStore`. Calling this on logout flips
 * `loaded` back to `false`, so `getActiveSqliteKvStore()` returns `null` and
 * `resolveStore()` falls through to the (also-purged) LS adapter until the next
 * full boot re-bootstraps for the new user. The cross-tab channel is kept so a
 * re-bootstrap reuses it.
 */
export function resetKvStoreBoot(): void {
  kvStoreBoot.warmCache.clear();
  kvStoreBoot.loaded = false;
  activeSqliteClient = null;
  activeSqliteKvStore = null;
  scannedHandle = null;
  anonWrites.clear();
}

/** Test-only escape hatch — exported so unit tests can reset the singleton. */
export function __resetKvStoreBootForTests(): void {
  resetKvStoreBoot();
  kvStoreCrossTab = null;
  anonPartitionActive = true;
  partitionGeneration = 0;
  refreshQueue = Promise.resolve();
  bootInFlight = Promise.resolve();
  bootSource = {};
}

/**
 * Синхронна позначка «активний тепер анонімний розділ». Кличеться з
 * `switchSqliteUser` одразу при зміні ключа, до закриття старого handle:
 * записи з цієї миті вже летять в `anon`.
 */
export function markKvAnonPartition(): void {
  partitionGeneration += 1;
  anonPartitionActive = true;
}

/**
 * Перечитує warm-cache з активного розділу після перемикання на акаунт.
 * Ніколи не кидає. Черга серіалізує перечитування, тож швидкі світчі
 * застосовуються по порядку.
 */
export function refreshKvWarmCache(): Promise<void> {
  partitionGeneration += 1;
  const generation = partitionGeneration;
  refreshQueue = refreshQueue.then(() =>
    refreshFromActivePartition(generation),
  );
  return refreshQueue;
}

async function refreshFromActivePartition(generation: number): Promise<void> {
  // Світч може прийти, поки перший скан буту ще летить: без цього очікування
  // бут дописав би в кеш анонімні рядки вже після перечитування.
  await bootInFlight;
  const store = activeSqliteKvStore;
  const client = activeSqliteClient;
  if (!kvStoreBoot.loaded || !store || !client) {
    anonPartitionActive = false;
    anonWrites.clear();
    return;
  }
  let handle: SqliteDbHandle;
  let rows: readonly { key: string; value: string }[] | null = null;
  try {
    const deps = await loadDbDeps();
    handle = await (bootSource.getDb ?? deps.getSqliteDb)();
    if (handle !== scannedHandle) {
      await deps.runMigrations({
        adapter: deps.createSqliteAdapter(handle.migrationClient()),
        files: deps.KV_STORE_CLIENT_MIGRATIONS,
        tableName: deps.KV_STORE_MIGRATIONS_TABLE,
      });
      rows = await handle.drizzle
        .select({ key: deps.kvStore.key, value: deps.kvStore.value })
        .from(deps.kvStore);
    }
  } catch (err) {
    reportKvStoreError("kv-store-refresh", err);
    return;
  }
  if (generation !== partitionGeneration || store !== activeSqliteKvStore) {
    return;
  }
  anonPartitionActive = false;
  if (rows === null) {
    anonWrites.clear();
    return;
  }

  const next = new Map(rows.map((row) => [row.key, row.value]));
  seedFromLocalStorage(next, resolveSeedStorage(bootSource.localStorage));
  // Ранній запис зроблено в цьому сеансі сторінки, тож він новіший за
  // збережене в розділі користувача і перемагає його.
  const carried = Array.from(anonWrites, (key) => ({
    key,
    value: kvStoreBoot.warmCache.get(key),
  }));
  anonWrites.clear();
  for (const { key, value } of carried) {
    if (value === undefined) next.delete(key);
    else next.set(key, value);
  }
  scannedHandle = handle;
  store.replaceCache(next);
  for (const { key, value } of carried) {
    void Promise.resolve()
      .then(() =>
        value === undefined
          ? client.remove(key)
          : client.upsert({ key, value, updatedAt: Date.now() }),
      )
      .catch((err: unknown) => reportKvStoreError("kv-store-carry", err));
  }
}

function reportKvStoreError(stage: string, err: unknown): void {
  logger.warn(`[kvStoreBoot] ${stage} failed`, err);
  addSentryBreadcrumb({
    category: "storage",
    level: "warning",
    message: `kvStoreBoot: ${stage} failed`,
    data: { error: err instanceof Error ? err.message : String(err) },
  });
}

function resolveSeedStorage(
  override: Storage | null | undefined,
): Storage | null {
  return override !== undefined
    ? override
    : ((globalThis as { localStorage?: Storage }).localStorage ?? null);
}

function seedFromLocalStorage(
  cache: Map<string, string>,
  ls: Storage | null,
): void {
  if (ls === null) return;
  try {
    for (let i = 0; i < ls.length; i++) {
      const key = ls.key(i);
      if (key !== null && !cache.has(key)) {
        const value = ls.getItem(key);
        if (value !== null) cache.set(key, value);
      }
    }
  } catch {
    /* localStorage не перелічується: пропускаємо */
  }
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
 * this as the priority-1 branch in its two-rung ladder (PR #064):
 *
 * ```ts
 * const sqlite = getActiveSqliteKvStore();
 * if (sqlite) return sqlite;
 * // else fall through to LS adapter or memory
 * ```
 */
export function getActiveSqliteKvStore(): KVStore | null {
  return activeSqliteKvStore;
}

/**
 * Build the {@link SqliteKVStoreClient} over the live SQLite handle.
 * Drizzle's `.onConflictDoUpdate` resolves the upsert in one
 * round-trip; a sync-throw or rejected promise routes through
 * `createSqliteKVStore`'s `onWriteError` hook.
 *
 * The handle is re-resolved through `getDb` on EVERY write, not
 * captured once. `AuthContext` перемикає SQLite-партицію на кожен
 * sign-in/sign-up (`setSqliteUser` → закриває старий handle), а цей
 * клієнт живе довше за партицію: клієнт, привʼязаний до знімка handle,
 * після логіну сипав «DB has been closed» на КОЖЕН upsert аж до hard
 * reload — губились analytics ring-buffer, quick-stats і диміси
 * банерів (аудит 2026-08-04, знахідка 2). Свіжий handle нової партиції
 * ще не бачив kv-міграцій (їх ганяє лише bootstrap), тож перед першим
 * записом у новий handle вони проганяються тут — idempotent, один раз
 * на handle.
 *
 * Exported so PR #063 can pass this into
 * `createSqliteKVStore({ sqlite })` at adapter-construction time.
 */
export function makeSqliteKvStoreClient(
  handle: SqliteDbHandle,
  getDb?: () => Promise<SqliteDbHandle>,
): SqliteKVStoreClient {
  let current = handle;
  // The boot-time handle already ran KV migrations inside bootstrapKvStore.
  const migrated = new WeakSet<SqliteDbHandle>([handle]);
  const resolveHandle = async (
    deps: KvStoreDbDeps,
  ): Promise<SqliteDbHandle> => {
    const live = await (getDb ?? deps.getSqliteDb)();
    if (live !== current) {
      if (!migrated.has(live)) {
        await deps.runMigrations({
          adapter: deps.createSqliteAdapter(live.migrationClient()),
          files: deps.KV_STORE_CLIENT_MIGRATIONS,
          tableName: deps.KV_STORE_MIGRATIONS_TABLE,
        });
        migrated.add(live);
      }
      current = live;
    }
    return current;
  };
  return {
    async upsert(row) {
      noteKvWrite(row.key);
      const deps = await loadDbDeps();
      const { kvStore } = deps;
      const db = await resolveHandle(deps);
      const updatedAt = new Date(row.updatedAt);
      await db.drizzle
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
      noteKvWrite(key);
      const deps = await loadDbDeps();
      const { kvStore, eq } = deps;
      const db = await resolveHandle(deps);
      await db.drizzle.delete(kvStore).where(eq(kvStore.key, key));
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
 * fake SQLite handle and fake BroadcastChannel constructor without
 * touching globals.
 *
 * Production callers pass nothing — defaults route to {@link getSqliteDb}
 * and `globalThis.BroadcastChannel`.
 */
export interface BootstrapKvStoreOptions {
  readonly getDb?: () => Promise<SqliteDbHandle>;
  readonly broadcastChannel?: BroadcastChannelLike | null;
  readonly now?: () => number;
  readonly onError?: (stage: string, error: unknown) => void;
  /**
   * Override the `localStorage` object used for the LS→warm-cache seed
   * step. Pass `null` to disable seeding (e.g. in unit tests that
   * assert an exact warm-cache size against an empty SQLite DB).
   * Defaults to `globalThis.localStorage`.
   */
  readonly localStorage?: Storage | null;
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
export function bootstrapKvStore(
  opts: BootstrapKvStoreOptions = {},
): Promise<BootstrapKvStoreResult> {
  const run = runBootstrap(opts);
  bootInFlight = run;
  return run;
}

async function runBootstrap(
  opts: BootstrapKvStoreOptions,
): Promise<BootstrapKvStoreResult> {
  if (kvStoreBoot.loaded) {
    return {
      boot: kvStoreBoot,
      crossTab: kvStoreCrossTab,
      sqlite: activeSqliteClient,
      loaded: true,
    };
  }

  const onError = opts.onError ?? reportKvStoreError;

  // Cross-tab BroadcastChannel: best-effort. Construction failure
  // (Safari Private mode, missing API) silently degrades to single-tab.
  if (kvStoreCrossTab === null) {
    kvStoreCrossTab = resolveBroadcastChannel(opts.broadcastChannel);
  }

  let deps: KvStoreDbDeps;
  let handle: SqliteDbHandle;
  try {
    // The lazy chunk resolves before the DB handle so a module-load
    // failure lands on the same `sqlite-init` fallback path as an
    // OPFS/WASM init failure — both leave `loaded = false` + LS fallback.
    deps = await loadDbDeps();
    handle = await (opts.getDb ?? deps.getSqliteDb)();
  } catch (err) {
    onError("sqlite-init", err);
    return {
      boot: kvStoreBoot,
      crossTab: kvStoreCrossTab,
      sqlite: null,
      loaded: false,
    };
  }
  const { kvStore } = deps;
  const getDb = opts.getDb;

  const migrationClient: SqliteMigrationClient = handle.migrationClient();
  try {
    await deps.runMigrations({
      adapter: deps.createSqliteAdapter(migrationClient),
      files: deps.KV_STORE_CLIENT_MIGRATIONS,
      tableName: deps.KV_STORE_MIGRATIONS_TABLE,
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

  // Seed warm cache from localStorage for any keys absent from SQLite.
  // This covers two scenarios without re-introducing the full LS→SQLite
  // DB write migration (removed in PR #064):
  //   1. Smoke/E2E tests (vite preview, no COOP/COEP → SQLite is
  //      memory-only) where `addInitScript` seeds LS before page load.
  //   2. Edge-case users whose SQLite DB is empty but LS still has data
  //      (e.g. after a failed migration run).
  // We only populate the in-memory warm cache — no SQLite DB writes here.
  // Pass `opts.localStorage = null` to disable (e.g. in unit tests).
  seedFromLocalStorage(
    kvStoreBoot.warmCache,
    resolveSeedStorage(opts.localStorage),
  );

  const sqliteClient = makeSqliteKvStoreClient(handle, getDb);

  scannedHandle = handle;
  bootSource = opts;
  kvStoreBoot.loaded = true;
  activeSqliteClient = sqliteClient;
  activeSqliteKvStore = createSqliteKVStore({
    sqlite: sqliteClient,
    boot: kvStoreBoot,
    ...(kvStoreCrossTab !== null ? { crossTab: kvStoreCrossTab } : {}),
    onWriteError: (op, key, error) => {
      logger.warn(`[kvStoreBoot] sqlite ${op} for "${key}" failed`, error);
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
