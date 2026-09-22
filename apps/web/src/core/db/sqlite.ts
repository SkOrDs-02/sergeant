import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import * as sqliteSchema from "@sergeant/db-schema/sqlite";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import { addSentryBreadcrumb, setSentryTag } from "../observability/sentry.js";
import {
  isChunkLoadError,
  reloadOnceForChunkError,
} from "../lib/chunkReload.js";
import { logger } from "@shared/lib";
import { isSyncableUserId } from "../syncEngine/syncableUserId.js";
import { CLIENT_PULL_SUPPORTED_TABLES } from "../syncEngine/applyPullOp.js";
import {
  noteActiveSqliteVfs,
  noteSqliteVfsFallbackReason,
} from "./storageBackendState.js";
import { isHandoffDone } from "./kvvfsHandoff.js";
import {
  makeLocalConnection,
  type SqliteConnection,
} from "./sqliteConnection.js";

/**
 * Lazy-loaded SQLite-WASM client for `apps/web` (PR #015 in
 * `https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/planning/archive/storage-roadmap.md`).
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
 * 1. **OPFS-SAH Pool у ВОРКЕРІ** ({@link openWorkerBackedDb}) — основний
 *    шлях від стадії 3 спеки `sqlite-opfs-worker.md`. Файл на акаунт,
 *    стеля — частка вільного місця пристрою.
 * 2. **OPFS-SAH Pool на головному потоці** — історична гілка, яка на
 *    практиці не спрацьовує НІКОЛИ: `installOpfsSAHPoolVfs()` вимагає
 *    `FileSystemSyncAccessHandle`, доступний лише у воркері, тож виклик
 *    кидає `Missing required OPFS APIs`. Саме через це kvvfs-фолбек
 *    «для старого iOS» був основним шляхом для всіх до стадії 1.
 *    Лишена свідомо: вона нічого не коштує, поки воркер живий, і є
 *    останнім шансом на OPFS, якщо воркер не піднявся.
 * 3. **kvvfs (`localStorage`)** — фолбек, коли воркер не піднявся.
 *    Стеля ~5 МБ; продукт на такому пристрої лишається робочим, але
 *    переростає її так само, як переріс до переїзду.
 * 4. **`:memory:`** — last resort so the contract still resolves; data
 *    does not survive a reload.
 *
 * Concurrency: every caller awaits the same in-flight init promise — see
 * the dedupe logic in {@link getSqliteDb}. We never expose raw sqlite-wasm
 * globals to feature code.
 */

type SqliteWasmModule = typeof import("@sqlite.org/sqlite-wasm");
type Sqlite3Static = Awaited<ReturnType<SqliteWasmModule["default"]>>;

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
  /**
   * Returns a `{exec, run, all}` migration-runner client backed by the
   * same `oo1.DB` instance the Drizzle handle uses.
   *
   * SPIKE-only escape hatch (PR #022 of the storage roadmap): the
   * routine SQLite SPIKE library is written against raw SQL so the
   * same source unit-tests against `better-sqlite3`. Sharing the
   * singleton's connection avoids opening a second OPFS handle on the
   * same origin. Production module code should keep using
   * {@link SqliteDbHandle.drizzle}.
   */
  migrationClient(): SqliteMigrationClient;
  /** Closes the underlying SQLite handle. */
  close(): Promise<void>;
}

/**
 * Per-user partition key folded into the OPFS DB filename so two accounts
 * signing in on the same device never share one `sergeant.db`
 * (page-audit-10 F17). Mirrors the Service-Worker cache partition
 * (`swSetActiveUser`, Audit 03 / Decision #2 C): defaults to `anon` and is
 * overwritten by {@link setSqliteUser} once `AuthContext` resolves the user.
 *
 * Note: only the OPFS-SAH VFS keys by filename. The `kvvfs` (localStorage)
 * fallback uses one wholesale store and the in-memory VFS is ephemeral —
 * for those two, {@link wipeSqliteDb} on logout is the isolation guarantee.
 */
const ANON_USER_KEY = "anon";

let inFlight: Promise<SqliteDbHandle> | null = null;
let inFlightKey: string | null = null;
let resolved: SqliteDbHandle | null = null;
let resolvedKey: string | null = null;
/** The currently-open low-level DB, retained so {@link wipeSqliteDb} can
 *  delete the right per-user persistent storage. */
let currentOpen: OpenedDb | null = null;
let activeUserKey = ANON_USER_KEY;
/**
 * Raw (unsanitized) id behind {@link activeUserKey}, or `null` for the
 * anonymous/default partition. Kept alongside the filename-safe key
 * because the kvvfs wipe path (see {@link wipeSqliteDb}) needs the exact
 * `user_id` column value to scope its row-level `DELETE`s — the sanitized
 * key is filename-safe but not guaranteed byte-identical to what write
 * paths stored.
 */
let activeUserId: string | null = null;

/** Filesystem-safe partition key. User ids are cuid/uuid-ish; strip anything
 *  that could escape the OPFS-SAH pool filename, and fall back to `anon`. */
function sanitizeUserKey(userId: string | null | undefined): string {
  if (!userId) return ANON_USER_KEY;
  const safe = userId.replace(/[^a-zA-Z0-9_-]/g, "");
  return safe.length > 0 ? safe : ANON_USER_KEY;
}

/**
 * Point the SQLite singleton at a given user's partition. Called by
 * `AuthContext` on login (and reset to `anon` on logout). When the key
 * actually changes we drop the cached singleton so the next
 * {@link getSqliteDb} opens that user's own DB file, closing the previous
 * handle in the background. Cheap + synchronous — safe to call from a render
 * effect; it never loads the WASM module.
 */
export function setSqliteUser(userId: string | null | undefined): void {
  void switchSqliteUser(userId).catch((err) => {
    logger.warn("[sqlite] closing stale per-user handle failed", err);
  });
}

/**
 * Awaitable partition switch for workflows that must never overlap two
 * SQLite handles (notably the anonymous-data migration).
 */
export async function switchSqliteUser(
  userId: string | null | undefined,
): Promise<void> {
  const key = sanitizeUserKey(userId);
  if (key === activeUserKey) return;
  // Forensic trace of the storage-layer partition switch (page-audit-10 F17,
  // rec #3). Redacted to anon/user — never the raw id — so we don't regress
  // the "hash userId before logging" hardening (L10).
  addSentryBreadcrumb({
    category: "storage",
    level: "info",
    message: "sqlite: active user partition changed",
    data: {
      from: activeUserKey === ANON_USER_KEY ? "anon" : "user",
      to: key === ANON_USER_KEY ? "anon" : "user",
    },
  });
  activeUserKey = key;
  activeUserId = key === ANON_USER_KEY ? null : (userId ?? null);
  const stale = resolved;
  resolved = null;
  resolvedKey = null;
  inFlight = null;
  inFlightKey = null;
  currentOpen = null;
  if (stale) {
    await stale.close();
  }
}

/**
 * Tear down and DELETE the current user's persistent SQLite storage, then
 * reset the singleton. Called from `AuthContext.logout` so user B never reads
 * user A's rows on a shared device (page-audit-10 F17). Best-effort: storage
 * removal failures are logged, not thrown, so logout always completes.
 *
 * On OPFS this is a full-file delete — the just-signed-out user already has
 * their own `sergeant-<id>.db`, so nothing else lives in that file. On the
 * `kvvfs` fallback (Safari < 17 / iOS < 16.4) there is only ONE physical
 * store shared by every partition on the device (`JsStorageDb`, keyed by a
 * fixed `"local"` name, not per-user), so a wholesale `clearStorage()` used
 * to also erase the anonymous visitor's own rows (and any other account's,
 * on a shared device) — see
 * `docs/work/specs/anonymous-local-first-persistence.md`
 * § «Відомий залишковий ризик». {@link OpenedDb.wipe} is therefore handed
 * the raw id of the user being logged out and, on kvvfs, scopes its
 * teardown to that id's rows only (row-level `DELETE ... WHERE user_id = ?`
 * across every user-scoped table) instead of nuking the whole store.
 */
export async function wipeSqliteDb(): Promise<void> {
  // Snapshot + reset synchronously so any concurrent getSqliteDb() re-opens a
  // fresh DB instead of reusing the one being wiped.
  const open = currentOpen;
  const stale = resolved;
  const userIdBeingWiped = activeUserId;
  resolved = null;
  resolvedKey = null;
  inFlight = null;
  inFlightKey = null;
  currentOpen = null;

  // Ordering is VFS-dependent and NOT interchangeable:
  //   - kvvfs's row-level `DELETE` (see `OpenedDb.wipe`) needs the
  //     connection still open, so it must run BEFORE `close()`.
  //   - OPFS-SAH's `unlink` is the opposite — the pool's own contract
  //     leaves the result undefined if the file is still open for access,
  //     so it must run AFTER `close()` releases the sync-access-handle lock.
  if (open && open.vfs === "kvvfs") {
    try {
      await open.wipe(userIdBeingWiped);
    } catch (err) {
      logger.warn("[sqlite] storage wipe failed", err);
    }
  }

  if (stale) {
    try {
      await stale.close();
    } catch (err) {
      logger.warn("[sqlite] close during wipe failed", err);
    }
  }

  if (open && open.vfs !== "kvvfs") {
    try {
      await open.wipe(userIdBeingWiped);
    } catch (err) {
      logger.warn("[sqlite] storage wipe failed", err);
    }
  }
}

/**
 * Resolves a singleton {@link SqliteDbHandle} for the active user. Concurrent
 * callers for the same user receive the same in-flight promise so
 * initialisation only happens once.
 *
 * Throwing from init clears the cached promise so the next caller can
 * retry — otherwise a transient OPFS lock failure during boot would
 * permanently brick `getSqliteDb()` for the session.
 */
export function getSqliteDb(): Promise<SqliteDbHandle> {
  const key = activeUserKey;
  if (resolved && resolvedKey === key) return Promise.resolve(resolved);
  if (inFlight && inFlightKey === key) return inFlight;

  inFlightKey = key;
  const pending = initSqliteDb(key).then(
    ({ handle, open }) => {
      // A user switch (setSqliteUser / wipeSqliteDb) may have landed while we
      // were initialising. Only publish the handle if its key is still active;
      // otherwise it's orphaned — close it so we don't leak an OPFS lock.
      if (activeUserKey === key) {
        resolved = handle;
        resolvedKey = key;
        currentOpen = open;
      } else {
        void handle.close().catch(() => {});
      }
      if (inFlight === pending) inFlight = null;
      return handle;
    },
    (err: unknown) => {
      if (inFlight === pending) {
        inFlight = null;
        inFlightKey = null;
      }
      throw err;
    },
  );
  inFlight = pending;
  return pending;
}

/**
 * Test-only escape hatch. Resets the singleton between test cases so each
 * one observes a fresh init. NOT exported from any public barrel.
 */
export function __resetSqliteDbForTests(): void {
  inFlight = null;
  inFlightKey = null;
  resolved = null;
  resolvedKey = null;
  currentOpen = null;
  activeUserKey = ANON_USER_KEY;
  activeUserId = null;
}

async function initSqliteDb(
  userKey: string,
): Promise<{ handle: SqliteDbHandle; open: OpenedDb }> {
  const coi = warnIfNotCrossOriginIsolated();

  // Lazy-load the heavy WASM module so it's not in the initial bundle.
  // Vite emits this as its own async chunk (see `manualChunks` in
  // `apps/web/vite.config.js`). Note: `sqlite3InitModule()` deliberately
  // takes no arguments — the upstream type definition omits the
  // Emscripten options (see sqlite-wasm PR #129).
  // Спершу воркер, і лише потім головний потік: під увімкненим прапорцем
  // важкий модуль на головному потоці не потрібен узагалі, тож і не
  // вантажиться. Фолбек тут тихий і повний — якщо воркер не піднявся,
  // застосунок працює рівно як до стадії 1.
  const driver =
    (await openWorkerBackedDb(userKey)) ?? (await openMainThreadDb(userKey));
  const proxy = makeProxyDriver(driver.conn);
  const drizzleDb = drizzle<SqliteSchema>(proxy, { schema: sqliteSchema });

  // AI-DANGER: рівно ОДИН клієнт на хендл, а не новий на кожен виклик.
  // Адаптер міграцій серіалізує `applyMigration` через `WeakMap` по
  // обʼєкту клієнта, тож свіжий обʼєкт на кожен виклик робив би ту чергу
  // порожньою — чотири модульні мігратори (fizruk / routine / finyk /
  // nutrition) ділять цей `oo1.DB` і без спільного ключа знову
  // перетинали б `BEGIN`, валячи бут із «cannot start a transaction
  // within a transaction».
  const sharedMigrationClient = makeMigrationClient(driver.conn);

  // Який VFS реально дістався пристрою — тег на всю сесію.
  //
  // AI-CONTEXT: без цього тега цілий клас прод-питань нерозвʼязний. У
  // `kvvfs` (фолбек для старого iOS Safari) УСІ партиції користувачів
  // лежать в одному сховищі, тоді як `opfs-sahpool` тримає файл на
  // акаунт (`sergeant-<id>.db`). Тобто гіпотези виду «два акаунти на
  // одному пристрої переплутали дані» перевіряються рівно цим полем — а
  // воно не потрапляло в жодну подію. Саме через це `SERGEANT-API-X`
  // (`fk_violation` на `fizruk_measurements.insert`, 3 користувачі) досі
  // без діагнозу: id виміру випадковий (`m_<ts>_<uuid>`), тож збіг між
  // акаунтами неможливий — лишається спільне сховище, але підтвердити
  // це нічим. Той самий тег розділяє `SQLITE_CORRUPT` (`API-P` / `API-Q`)
  // за бекендом зберігання.
  lastVfs = driver.vfs;
  noteActiveSqliteVfs(driver.vfs);
  setSentryTag("sqlite.vfs", driver.vfs);

  const handle: SqliteDbHandle = {
    drizzle: drizzleDb,
    migrationClient: () => sharedMigrationClient,
    vfs: driver.vfs,
    crossOriginIsolated: coi,
    async close() {
      await driver.conn.close();
    },
  };
  return { handle, open: driver };
}

/**
 * Відкриває базу у фоновому воркері, або віддає `null`, якщо не судилось.
 *
 * `null`, а не виняток: рішення «куди падати» ухвалюється тут, вище по
 * стеку про існування воркера знати не треба. Будь-яка невдача — відсутній
 * `Worker`, OPFS, що не піднявся, впале перелиття — веде в наявний
 * головнопотоковий шлях.
 *
 * AI-DANGER: під цим прапорцем база ІНША — окремий файл в OPFS, а не
 * спільний localStorage-блоб. Від стадії 2 дані переїжджають разом із
 * двигуном: при першому відкритті стара база копіюється сюди цілком
 * (`kvvfsHandoff`). Старе сховище при цьому НЕ чіпається, тому вимикання
 * прапорця повертає все як було — але записи, зроблені під увімкненим,
 * лишаються тут.
 *
 * Від стадії 3 це БЕЗУМОВНИЙ основний шлях: прапорця більше немає.
 *
 * AI-DANGER: не повертай сюди тумблер. Його прибрано за рішенням власника
 * саме тому, що ручне вимикання розщеплює дані — записи, зроблені в OPFS,
 * у старе сховище не повертаються, і людина лишається з двома половинами
 * історії, не знаючи про це. Відкат тепер один і чесний: ревертнути
 * коміт. Автоматичний фолбек від цього не постраждав — він нижче і
 * спрацьовує на будь-якій невдачі воркера.
 */
async function openWorkerBackedDb(userKey: string): Promise<OpenedDb | null> {
  try {
    const { openSqliteInWorker } = await import("./sqliteWorkerClient.js");
    const handoff = await import("./kvvfsHandoff.js");
    const dbName = `sergeant-${userKey}.db`;
    // Стадія 2: перелиття старої бази. Байти читаються ЛИШЕ доки немає
    // позначки — після переїзду цей шлях більше не виконується і важкий
    // модуль на головний потік не потрапляє.
    const needsHandoff = !handoff.isHandoffDone(userKey);
    const importBytes = needsHandoff
      ? await handoff.readKvvfsSnapshotBytes()
      : null;
    const conn = await openSqliteInWorker(dbName, {
      directory: SAH_POOL_DIRECTORY,
      initialCapacity: SAH_POOL_INITIAL_CAPACITY,
      minFreeSlots: SAH_POOL_MIN_FREE_SLOTS,
      importBytes,
    });
    if (needsHandoff) {
      // Підчищаємо ЗАВЖДИ, а не лише після свіжого імпорту: попередня
      // спроба могла впасти саме між імпортом і підчищанням, і тоді файл
      // уже існує, але містить чужі партиції. На чистій базі це no-op.
      const prunedTables = await handoff.pruneForeignPartitionRows(
        conn,
        activeUserId,
      );
      // Позначка ставиться ОСТАННЬОЮ. Доки її немає, перелиття вважається
      // таким, що не відбулось, і наступний запуск доробить його.
      handoff.markHandoffDone(userKey);
      addSentryBreadcrumb({
        category: "storage",
        level: "info",
        message: "sqlite: kvvfs handoff completed",
        data: { imported: conn.imported, prunedTables },
      });
    }
    lastWorkerDiagnostics = await conn.diagnostics();
    addSentryBreadcrumb({
      category: "storage",
      level: "info",
      message: "sqlite: opened in worker",
      data: { grewBy: conn.grewBy, ...lastWorkerDiagnostics },
    });
    return {
      conn,
      vfs: "opfs-sahpool",
      dbName,
      // Файл на акаунт — видаляється цілком, як і в головнопотоковій
      // OPFS-гілці. `userId` тут не потрібен: чужих рядків у файлі немає.
      wipe: () => conn.wipe(),
    };
  } catch (err) {
    if (isChunkLoadError(err)) reloadOnceForChunkError();
    const busy = isPoolHeldElsewhere(err);
    if (busy) noteSqliteVfsFallbackReason("pool-busy");
    addSentryBreadcrumb({
      category: "storage",
      level: "warning",
      message: "sqlite: worker backend unavailable, falling back",
      data: {
        error: err instanceof Error ? err.message : String(err),
        poolBusy: busy,
      },
    });
    return null;
  }
}

/**
 * Чи впав пул саме тому, що його каталог тримає інша вкладка.
 *
 * Пул бере sync-хендли на ВЕСЬ каталог одразу, тож другий претендент
 * дістає `NoModificationAllowedError` (Chromium) або той самий текст про
 * зайнятий access-handle. Відрізняти це від «пристрій не вміє OPFS»
 * обовʼязково: перше людина усуває сама, друге — ні.
 */
function isPoolHeldElsewhere(err: unknown): boolean {
  const name = err instanceof Error ? err.name : "";
  const text = err instanceof Error ? err.message : String(err);
  return (
    name === "NoModificationAllowedError" ||
    /another open Access Handle|NoModificationAllowedError/i.test(text)
  );
}

/**
 * Наявний шлях: WASM і база на головному потоці.
 *
 * Stale-deploy recovery. Обидва кроки нижче тягнуть версійовані асети:
 * `loadSqliteWasm()` — JS-чанк, `sqlite3InitModule()` — сам `sqlite3.wasm`
 * власним `fetch()` усередині emscripten-glue. Після деплою старий
 * `index.html` у відкритій вкладці посилається на хеші, яких уже немає, і
 * другий крок падає `RuntimeError: Aborted(...)`. Глобальні слухачі в
 * `installChunkLoadRecover` сюди не дістають: помилка ловиться вище по
 * стеку storage-бутом і йде в Sentry як `handled`, тож вкладка лишається
 * живою, але без локальної БД. Ловимо на місці й віддаємо у той самий
 * one-shot-reload, що й решта чанків (guard-и cooldown/лічильника — там).
 *
 * Той самий one-shot-reload стоїть і на динамічному імпорті клієнта
 * воркера: його чанк версійований так само.
 */
async function openMainThreadDb(userKey: string): Promise<OpenedDb> {
  let sqlite3: Sqlite3Static;
  try {
    const sqlite3InitModule = await loadSqliteWasm();
    sqlite3 = await sqlite3InitModule();
  } catch (err) {
    if (isChunkLoadError(err)) reloadOnceForChunkError();
    throw err;
  }
  return openDb(sqlite3, userKey);
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
 * `https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/planning/archive/storage-roadmap.md`.
 */
function warnIfNotCrossOriginIsolated(): boolean {
  const isolated =
    typeof globalThis !== "undefined" &&
    typeof globalThis.crossOriginIsolated === "boolean"
      ? globalThis.crossOriginIsolated
      : false;

  if (isolated) return true;

  // debug, не warn: очікуваний фолбек у dev/preview без COOP/COEP —
  // шумів на кожному boot (design-audit P3); Sentry-breadcrumb лишається.
  logger.debug(
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

/**
 * Wrap an `oo1.DB` so it satisfies the cross-platform
 * {@link SqliteMigrationClient} contract — the same `{exec, run, all}`
 * surface the migration runner and the routine SPIKE repo are written
 * against. Від стадії 1 спеки `sqlite-opfs-worker.md` методи асинхронні
 * (контракт це допускав завжди: `void | Promise<void>` / `R[] | Promise<R[]>`),
 * бо та сама поверхня обслуговує і базу на головному потоці, і базу у воркері.
 */
function makeMigrationClient(conn: SqliteConnection): SqliteMigrationClient {
  return {
    exec(sql) {
      return conn.exec(sql);
    },
    run(sql, params) {
      return conn.run(sql, params ?? []);
    },
    async all<R extends Record<string, unknown> = Record<string, unknown>>(
      sql: string,
      params?: readonly unknown[],
    ): Promise<R[]> {
      const rows = await conn.all(sql, params ?? [], "object");
      return rows as R[];
    },
  };
}

async function loadSqliteWasm(): Promise<SqliteWasmModule["default"]> {
  // Dynamic import so the module ends up in its own async chunk.
  const mod: SqliteWasmModule = await import("@sqlite.org/sqlite-wasm");
  return mod.default;
}

interface OpenedDb {
  readonly conn: SqliteConnection;
  readonly vfs: SqliteVfs;
  /** Name of the underlying store (OPFS filename / kvvfs slot / `:memory:`). */
  readonly dbName: string;
  /**
   * Removes this DB's persistent storage. Call only after {@link close}.
   *
   * @param userId Raw id of the user being wiped, or `null` when there is
   *   none to scope by. On OPFS this is unused (the file itself already
   *   belongs to exactly one user). On `kvvfs` — a single physical store
   *   shared by every partition on the device — this scopes the teardown to
   *   a row-level `DELETE ... WHERE user_id = ?` instead of clearing the
   *   whole store, so other partitions (notably the anonymous visitor's own
   *   rows) survive. See {@link wipeSqliteDb}.
   */
  wipe(userId: string | null): Promise<void>;
}

/**
 * Скільки слотів пул тримає під файли.
 *
 * AI-DANGER: раніше `initialCapacity` не передавали взагалі, тобто діяв
 * дефолт бібліотеки — **6**. Її власна документація каже про цей дефолт
 * дослівно: «The default capacity is only large enough for one or two
 * databases and their associated temp files». А Sergeant тримає МІНІМУМ дві
 * бази (`sergeant-anon.db` і `sergeant-<userId>.db`, розведені навмисно —
 * page-audit-10 F17), і кожен акаунт, що колись входив на цьому пристрої,
 * лишає по файлу назавжди. Плюс SQLite сам створює rollback-журнал і
 * тимчасові файли, і кожен із них ТЕЖ займає слот пулу.
 *
 * Пул не росте сам. `xOpen` у VFS робить рівно це:
 *
 *     if (pool.getFileCount() < pool.getCapacity()) { …взяти слот… }
 *     else toss("SAH pool is full. Cannot create file", path)
 *
 * Тобто на переповненні будь-яке створення файлу падає, і sqlite віддає це
 * як `SQLITE_IOERR: disk I/O error` — без жодного натяку на справжню
 * причину. Саме це й ловив звіт власника 2026-09-14: перенос анонімних
 * даних відкриває ОБИДВІ бази й жене транзакцію на 1356 рядків, тобто
 * впирається рівно в ту межу «одна-дві бази з темпами», про яку попереджає
 * документація.
 */
const SAH_POOL_INITIAL_CAPACITY = 24;

/**
 * Скільки вільних слотів лишати про запас під журнали й темпи SQLite.
 *
 * Одного `initialCapacity` замало: він діє лише на ПЕРШІЙ ініціалізації
 * пулу в цьому origin. У людини, яка вже користувалась застосунком, пул
 * створено зі старою ємністю, і він таким і лишиться — саме тому окремо
 * доростаємо на місці. Це ж покриває пристрій, де входили кілька акаунтів:
 * файлів там більше, ніж передбачав будь-який статичний дефолт.
 */
const SAH_POOL_MIN_FREE_SLOTS = 8;

/** Тека пулу в OPFS. Однакова для обох бекендів — файли ті самі. */
const SAH_POOL_DIRECTORY = "/sergeant/sqlite";

/**
 * Прапорець стадії 1: тримати базу у фоновому воркері.
 *
 * Це рішення ПРИСТРОЮ, а не деплою, тому живе в користувацькому реєстрі —
 * власник вмикає його в Налаштуваннях на своєму айфоні й одразу бачить
 * результат, а відкат не потребує редеплою. Дефолт — вимкнено: стадія 1
 * має зливатись без зміни поведінки.
 */

/**
 * Заповненість пулу, як її повідомив воркер на відкритті.
 *
 * `readSqliteStorageDiagnostics()` синхронний (його кличе рядок діагностики
 * збою переносу), а воркер відповідає лише промісом. Тому тримаємо останнє
 * відоме значення: на момент відкриття воно точне, далі — орієнтир.
 */
let lastWorkerDiagnostics: SqliteStorageDiagnostics | null = null;

/**
 * Останній встановлений SAH-пул — лише для діагностики.
 *
 * Тримаємо посилання, бо пул ставиться один раз на origin, а прочитати
 * його заповненість потрібно ЗВІДТИ, де стається збій (перенос анонімних
 * даних). Без цих двох чисел `SQLITE_IOERR` не відрізнити від будь-якої
 * іншої дискової біди: код помилки в sqlite один на всі випадки.
 */
let lastSahPool: SahPoolLike | null = null;

export interface SqliteStorageDiagnostics {
  /** Скільки слотів має пул. */
  readonly capacity: number;
  /** Скільки з них зайнято файлами. */
  readonly fileCount: number;
}

/**
 * VFS, на якому реально відкрилась база.
 *
 * AI-CONTEXT: до 2026-09-14 це знання жило тільки в Sentry-тезі, а на
 * екрані збою його не було — і відсутність `pool=` у діагностиці довелось
 * ТЛУМАЧИТИ як «пул не встановився». Тлумачення виявилось правильним, але
 * покладатись на відсутність поля — поганий інструмент. Тепер VFS
 * називається прямо.
 */
let lastVfs: SqliteVfs | null = null;

/** Який VFS обслуговує базу, або `null` доки її не відкривали. */
export function readActiveSqliteVfs(): SqliteVfs | null {
  return lastVfs;
}

/**
 * Заповненість SAH-пулу, або `null` поза OPFS-гілкою (kvvfs, memory, тести).
 * Ніколи не кидає: це діагностика, а не робочий шлях.
 */
export function readSqliteStorageDiagnostics(): SqliteStorageDiagnostics | null {
  if (!lastSahPool) return lastWorkerDiagnostics;
  try {
    return {
      capacity: lastSahPool.getCapacity(),
      fileCount: lastSahPool.getFileCount(),
    };
  } catch {
    return null;
  }
}

interface SahPoolLike {
  getCapacity: () => number;
  getFileCount: () => number;
  addCapacity: (n: number) => Promise<unknown>;
}

async function ensureSahPoolHeadroom(pool: SahPoolLike): Promise<void> {
  try {
    const free = pool.getCapacity() - pool.getFileCount();
    if (free >= SAH_POOL_MIN_FREE_SLOTS) return;
    const grewBy = SAH_POOL_MIN_FREE_SLOTS - free;
    await pool.addCapacity(grewBy);
    addSentryBreadcrumb({
      category: "storage",
      level: "info",
      message: "sqlite: opfs-sahpool capacity grown",
      data: { grewBy, capacity: pool.getCapacity() },
    });
  } catch (err) {
    // Не фатально: база могла відкритись і на наявних слотах. Ковтаємо, щоб
    // не перетворити оптимізацію на новий шлях відмови, але лишаємо слід —
    // якщо `SQLITE_IOERR` повернеться, ця крихта скаже, що запасу не було.
    addSentryBreadcrumb({
      category: "storage",
      level: "warning",
      message: "sqlite: opfs-sahpool addCapacity failed",
      data: { error: err instanceof Error ? err.message : String(err) },
    });
  }
}

async function openDb(
  sqlite3: Sqlite3Static,
  userKey: string,
): Promise<OpenedDb> {
  // 1) Persistent: OPFS SyncAccessHandle Pool VFS — main-thread friendly,
  //    does not need COOP/COEP. Skip on environments without OPFS at all
  //    (jsdom, very old Safari) so we don't wait on a timeout.
  if (hasOpfsSupport()) {
    try {
      const pool = await sqlite3.installOpfsSAHPoolVfs({
        directory: SAH_POOL_DIRECTORY,
        initialCapacity: SAH_POOL_INITIAL_CAPACITY,
      });
      lastSahPool = pool;
      await ensureSahPoolHeadroom(pool);
      // Per-user filename so two accounts on one device never share a DB
      // (page-audit-10 F17).
      const dbName = `sergeant-${userKey}.db`;
      return {
        conn: makeLocalConnection(new pool.OpfsSAHPoolDb(dbName)),
        vfs: "opfs-sahpool",
        dbName,
        async wipe() {
          // Per-user file — nothing else lives here, so a full unlink is
          // always correct regardless of which userId is passed in.
          pool.unlink(dbName);
        },
      };
    } catch (err) {
      logger.debug("[sqlite] OPFS-SAH Pool VFS unavailable, falling back", err);
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
  //    kvvfs is the closest persistent fallback. kvvfs is a single wholesale
  //    store (no per-user filename), so cross-user isolation here relies on
  //    `wipe()` clearing it on logout rather than on the filename key.
  //
  // AI-DANGER: після перелиття (стадія 2) цей шлях ЗАБОРОНЕНИЙ. Старе
  // сховище навмисно не чистять (див. `kvvfsHandoff.ts`), тож воно живе на
  // пристрої як знімок бази на момент переїзду. Відкрити його після
  // позначки означає показати людині старі дані замість її власних і
  // прийняти нові записи в мертвий стор, звідки їх ніхто не забере. Саме
  // так помирали дані анонімної сесії: OPFS-пул бере хендли на ВЕСЬ
  // каталог, тому друга вкладка того самого профілю пулу не дістає, падала
  // сюди — і тихо відкривала торішній знімок поруч із живою базою першої
  // вкладки. Заміряно на Xiaomi Pad 6 2026-09-22: одна вкладка — OPFS і
  // нуль росту `kvvfs-local-*`; щойно відкривається друга — +1 ключ і
  // +4.4 kB у тому самому localStorage.
  if (hasLocalStorage() && !isHandoffDone(userKey)) {
    try {
      const conn = makeLocalConnection(new sqlite3.oo1.JsStorageDb("local"));
      return {
        conn,
        vfs: "kvvfs",
        dbName: "local",
        async wipe(userId) {
          // Row-level scope instead of `db.clearStorage()` — see the
          // `OpenedDb.wipe` doc comment and
          // `docs/work/specs/anonymous-local-first-persistence.md`
          // § «Відомий залишковий ризик». A `null`/synthetic-local userId
          // (anon / demo) means there is nothing safe to scope by, so we
          // leave the shared store untouched rather than risk erasing every
          // partition on the device — this call site (`wipeSqliteDb` from
          // `AuthContext.logout`) only ever wipes a real authenticated user.
          if (userId !== null && isSyncableUserId(userId)) {
            await wipeKvvfsUserRows(conn, userId);
          }
        },
      };
    } catch (err) {
      logger.warn("[sqlite] kvvfs (localStorage) unavailable", err);
      addSentryBreadcrumb({
        category: "storage",
        level: "warning",
        message: "sqlite: kvvfs init failed",
        data: { error: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  // 3) Last resort — non-persistent. The DB still works, callers just
  //    lose data on reload. Nothing to wipe — it never touches disk.
  logger.warn(
    "[sqlite] No persistent VFS available; using in-memory database. " +
      "Data will not survive a reload.",
  );
  return {
    conn: makeLocalConnection(new sqlite3.oo1.DB(":memory:", "ct")),
    vfs: "memory",
    dbName: ":memory:",
    wipe: async () => {},
  };
}

/**
 * Row-level teardown for the shared `kvvfs` store: deletes `userId`'s own
 * rows from every user-scoped table, leaving every other partition (other
 * accounts, `local-anon`, `demo-local`) on the same physical store intact.
 *
 * Iterates {@link CLIENT_PULL_SUPPORTED_TABLES} — the same registry the
 * anonymous-data migration uses to snapshot user-scoped rows — rather than
 * `sqlite_master`, so a stray non-user-scoped table (migrations bookkeeping,
 * etc.) is never touched. Each table's `DELETE` is wrapped individually: a
 * table that hasn't been created yet on this device (e.g. a module the user
 * never opened) must not abort the sweep for the rest.
 */
async function wipeKvvfsUserRows(
  conn: SqliteConnection,
  userId: string,
): Promise<void> {
  for (const table of CLIENT_PULL_SUPPORTED_TABLES) {
    try {
      await conn.run(`DELETE FROM ${table} WHERE user_id = ?`, [userId]);
    } catch (err) {
      // Most common cause: table doesn't exist yet on this device. Any
      // other failure is logged but must not stop the remaining tables —
      // partial cleanup beats none.
      logger.debug(`[sqlite] kvvfs row-wipe skipped for ${table}`, err);
    }
  }
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
function makeProxyDriver(conn: SqliteConnection): ProxyCallback {
  return async (sql, params, method) => {
    const bind = toBind(params);
    switch (method) {
      case "run": {
        await conn.run(sql, bind);
        return { rows: [] };
      }
      case "all":
      case "values": {
        return { rows: await conn.all(sql, bind, "array") };
      }
      case "get": {
        const rows = await conn.all(sql, bind, "array");
        return { rows: rows.length > 0 ? [rows[0]] : [] };
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
function toBind(params: unknown[]): unknown[] {
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
