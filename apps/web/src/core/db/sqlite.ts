import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import * as sqliteSchema from "@sergeant/db-schema/sqlite";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import {
  openWithRetry,
  type WorkerOpenAttemptOptions,
} from "./workerOpenRetry.js";
import { addSentryBreadcrumb, setSentryTag } from "../observability/sentry.js";
import {
  isChunkLoadError,
  reloadOnceForChunkError,
} from "../lib/chunkReload.js";
import { logger } from "@shared/lib";
import { resetInitialPull } from "../syncEngine/initialPullState.js";
import {
  noteActiveSqliteVfs,
  noteSqliteLegacyStoreKept,
  noteSqliteVfsFallbackReason,
} from "./storageBackendState.js";
import { hasKvvfsData, isHandoffDone } from "./kvvfsHandoff.js";
import { claimDbOwnership, onYieldRequested } from "./dbOwnership.js";
import { watchOpfsWipe } from "./opfsWipeGuard.js";
import {
  cleanupOrphanSqliteFiles,
  markPendingSqliteWipe,
} from "./sqliteOrphanCleanup.js";
import { markKvAnonPartition, refreshKvWarmCache } from "./kvStoreBoot.js";
import type { SqliteConnection } from "./sqliteConnection.js";
import {
  markAnonPartitionDirty,
  sqlMayWriteAnonData,
} from "../durability/anonPartitionState.js";

/**
 * Lazy-loaded SQLite-WASM client for `apps/web` (PR #015 in
 * `https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/planning/archive/storage-roadmap.md`).
 *
 * Why this lives outside the main bundle:
 *
 * - `drizzle-orm` and the schema tables are only needed once a feature
 *   actually opens the DB, so this module is reached through
 *   `await import(...)` only — see the static-analysis guard in
 *   `__tests__/sqlite.lazy.test.ts`.
 * - `@sqlite.org/sqlite-wasm` itself is NOT loaded on the main thread at
 *   all (PR-T1, owner decision Б, 2026-11-18): it lives only in
 *   `sqliteWorker.ts`. Guarded by `__tests__/sqlite.mainThreadNoWasm.test.ts`.
 *
 * VFS selection (best → worst):
 *
 * 1. **OPFS-SAH Pool у ВОРКЕРІ** ({@link openWorkerBackedDb}) — єдиний
 *    персистентний шлях від стадії 3 спеки `sqlite-opfs-worker.md`. Файл на
 *    акаунт, стеля — частка вільного місця пристрою.
 * 2. **`:memory:` у воркері** ({@link openMemoryDb}) — друга вкладка (пул
 *    тримає перша), пристрій без OPFS у воркері або воркер, що не відкрив
 *    OPFS після ретраїв. Дані не переживають reload, і про це говорить
 *    банер `MemoryOnlyStorageBanner`.
 *
 * AI-CONTEXT: до 2026-11-18 між ними стояли ще дві гілки на головному
 * потоці власною копією sqlite-wasm (~55 kB brotli у `vendor-sqlite`
 * поверх такої самої у воркері): OPFS-SAH (на практиці не спрацьовувала
 * ніколи — `FileSystemSyncAccessHandle` є лише у воркері) і kvvfs у
 * `localStorage` (~5 МБ). Власник прийняв відмову від пристроїв без OPFS у
 * воркері (PR-T1, варіант Б). Їхнє kvvfs-сховище не стирається: його
 * підбере звичайне перелиття, щойно браузер оновиться (`kvvfsHandoff.ts`).
 *
 * Concurrency: every caller awaits the same in-flight init promise — see
 * the dedupe logic in {@link getSqliteDb}. We never expose raw sqlite-wasm
 * globals to feature code.
 */

/** Names the runtime VFS the DB was opened against. */
export type SqliteVfs = "opfs-sahpool" | "memory";

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
 * Note: only the OPFS-SAH VFS keys by filename. The in-memory VFS is
 * ephemeral and lives in its own worker per open, so nothing outlives it.
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
 * because the kvvfs hand-off prune ({@link attemptWorkerBackedDb}) needs
 * the exact `user_id` column value — the sanitized key is filename-safe but
 * not guaranteed byte-identical to what write paths stored.
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
  if (key === ANON_USER_KEY) markKvAnonPartition();
  const stale = resolved;
  resolved = null;
  resolvedKey = null;
  inFlight = null;
  inFlightKey = null;
  currentOpen = null;
  if (stale) {
    await stale.close();
  }
  // KV-кеш заповнено на буті з `anon`: без перечитування залогінений
  // користувач читав би анонімні значення до кінця сесії. Після `close()`,
  // бо перечитування відкриває новий handle, а два одночасно не можна.
  if (key !== ANON_USER_KEY) {
    await refreshKvWarmCache();
    // Зашифровані слоти AI-історії: кеш відкритого тексту відповідає
    // попередньому розділу, перечитуємо з нового.
    await import("../security/aiAtRest")
      .then((m) => m.hydrateAtRest())
      .catch(() => undefined);
  }
}

/**
 * Tear down and DELETE the current user's persistent SQLite storage, then
 * reset the singleton. Called from `AuthContext.logout` so user B never reads
 * user A's rows on a shared device (page-audit-10 F17). Best-effort: storage
 * removal failures are logged, not thrown, so logout always completes.
 *
 * On OPFS this is a full-file delete — the just-signed-out user already has
 * their own `sergeant-<id>.db`, so nothing else lives in that file. The
 * in-memory DB has nothing to delete.
 *
 * AI-CONTEXT: до 2026-11-18 тут була ще гілка kvvfs (одне спільне сховище
 * на всі партиції, тож стирання було рядковим `DELETE ... WHERE user_id`).
 * Її прибрано разом із копією sqlite-wasm на головному потоці (PR-T1).
 * Старе kvvfs-сховище вихід не чистить (див. `purgeLocalData.ts`): при
 * перелитті чужі партиції з файлу вирізає `pruneForeignPartitionRows`, а
 * саме сховище стирається після перелиття, щойно в ньому не лишилось
 * нічого незамінного (стадія 3, `canRemoveKvvfsStore`, priv-17).
 */
export async function wipeSqliteDb(): Promise<void> {
  // Snapshot + reset synchronously so any concurrent getSqliteDb() re-opens a
  // fresh DB instead of reusing the one being wiped.
  const open = currentOpen;
  const stale = resolved;
  const userIdBeingWiped = activeUserId;
  // Локальна репліка стерта: «pull уже був» більше не правда, доки не
  // пройде новий (гейт відновлення з файлу data-07, prefs Їжі data-04).
  // Reader і сам скине прапор на наступному тіку (новий client), але гейт
  // імпорту не має бачити «true» у проміжку між wipe і цим тіком.
  if (userIdBeingWiped) resetInitialPull();
  resolved = null;
  resolvedKey = null;
  inFlight = null;
  inFlightKey = null;
  currentOpen = null;

  // Ordering is backend-dependent and NOT interchangeable
  // ({@link OpenedDb.wipeBeforeClose}):
  //   - the worker backend's `wipe` message is handled INSIDE the worker,
  //     which closes the db itself and only then `unlink`s. `close()` on the
  //     client terminates the worker, so a `wipe` sent after it is rejected
  //     (`dead`) and the file is never unlinked (priv-05) — wipe first.
  //   - memory has nothing to wipe; order does not matter.
  // priv-05: файл на диску стирається ПІСЛЯ маркера «стирання не завершилось».
  //
  // AI-DANGER: маркер НЕ знімається тут навіть після успішного `wipe`. Його
  // знімає `cleanupOrphanSqliteFiles` на наступному відкритті анонімної
  // партиції, і саме там файл видаляється примусово ще раз. Між `wipe` і
  // `setSqliteUser(null)` ще живуть тіки синку й dual-write: `getSqliteDb()`
  // з ключем вихідного акаунта перевідкриває файл партиції, і сам `wipe`
  // гарантії не дає (e2e `logout-sqlite-wipe`). Раніше це прибирало
  // підмітання з анонімної партиції, але воно ж видаляло файл залогіненої
  // людини на кожному старті, тож тепер воно діє лише з партиції акаунта
  // (див. `cleanupOrphanSqliteFiles`), а вихід покладається на маркер.
  const pendingFile = open?.vfs === "opfs-sahpool" ? open.dbName : null;
  if (pendingFile) markPendingSqliteWipe(pendingFile);
  const wipeStorage = async (): Promise<void> => {
    if (!open) return;
    try {
      await open.wipe(userIdBeingWiped);
    } catch (err) {
      // Не ковтаємо мовчки: файл із даними користувача лишився на диску.
      // `logger.error` у проді йде в Sentry (breadcrumb + captureException).
      logger.error("[sqlite] storage wipe failed", err);
    }
  };

  if (open?.wipeBeforeClose) await wipeStorage();

  if (stale) {
    try {
      await stale.close();
    } catch (err) {
      logger.warn("[sqlite] close during wipe failed", err);
    }
  }

  if (open && !open.wipeBeforeClose) await wipeStorage();
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

/**
 * Віддати базу вкладці, яка натиснула «Працювати тут».
 *
 * Сингълтон скидається СИНХРОННО, до `close()`: доки він скинутий, будь-який
 * паралельний `getSqliteDb()` відкриє нову (вже памʼятєву) базу замість того,
 * щоб дочекатись хендла, який зараз закривається.
 */
onYieldRequested(async () => {
  const stale = resolved;
  resolved = null;
  resolvedKey = null;
  inFlight = null;
  inFlightKey = null;
  currentOpen = null;
  if (stale) await stale.close();
});

async function initSqliteDb(
  userKey: string,
): Promise<{ handle: SqliteDbHandle; open: OpenedDb }> {
  const coi = warnIfNotCrossOriginIsolated();

  // sqlite-wasm на головному потоці не вантажиться ніколи (PR-T1): і
  // персистентна база, і памʼятева живуть у воркері.
  // Персистентний стор відкриває ЛИШЕ лідер - див. `dbOwnership.ts`. Пул
  // замикає каталог цілком, тож друга вкладка все одно його не дістане: ретраї
  // нижче виграють гонку з воркером ПОПЕРЕДНЬОГО завантаження цієї ж сторінки,
  // але не з сусідньою вкладкою, яка тримає пул скільки завгодно довго. Без
  // цієї гілки вона з'їжджала б у власне сховище поруч із живою базою першої
  // і показувала б інший набір даних на тому самому акаунті.
  const owner = await claimDbOwnership();
  const persistent = owner === "leader";
  if (!persistent) {
    noteSqliteVfsFallbackReason("pool-busy");
    // Вкладка-послідовник не перелиє kvvfs сама (це робить лідер), тож поки
    // перелиття не завершене, старі записи лежать недоторканими - банер має
    // це сказати і тут (CodeRabbit на #1692).
    noteLegacyStoreKeptIfStranded(userKey);
  }
  const driver =
    (persistent ? await openWorkerBackedDb(userKey) : null) ??
    (await openMemoryDb());
  // Анонімна партиція: кожен запис, що може створити дані для переносу,
  // спершу ставить DIRTY (спека anonymous-migration-fast-path, інваріант 3).
  const conn =
    userKey === ANON_USER_KEY
      ? markAnonDirtyBeforeWrites(driver.conn)
      : driver.conn;
  const proxy = makeProxyDriver(conn);
  const drizzleDb = drizzle<SqliteSchema>(proxy, { schema: sqliteSchema });

  // AI-DANGER: рівно ОДИН клієнт на хендл, а не новий на кожен виклик.
  // Адаптер міграцій серіалізує `applyMigration` через `WeakMap` по
  // обʼєкту клієнта, тож свіжий обʼєкт на кожен виклик робив би ту чергу
  // порожньою — чотири модульні мігратори (fizruk / routine / finyk /
  // nutrition) ділять цей `oo1.DB` і без спільного ключа знову
  // перетинали б `BEGIN`, валячи бут із «cannot start a transaction
  // within a transaction».
  const sharedMigrationClient = makeMigrationClient(conn);

  // Який VFS реально дістався пристрою — тег на всю сесію.
  //
  // AI-CONTEXT: без цього тега цілий клас прод-питань нерозвʼязний. У
  // `kvvfs` (фолбек для старого iOS Safari, прибраний 2026-11-18) УСІ
  // партиції користувачів лежали в одному сховищі, тоді як `opfs-sahpool`
  // тримає файл на акаунт (`sergeant-<id>.db`). Тобто гіпотези виду «два акаунти на
  // одному пристрої переплутали дані» перевіряються рівно цим полем — а
  // воно не потрапляло в жодну подію. Саме через це `SERGEANT-API-X`
  // (`fk_violation` на `fizruk_measurements.insert`, 3 користувачі) досі
  // без діагнозу: id виміру випадковий (`m_<ts>_<uuid>`), тож збіг між
  // акаунтами неможливий — лишається спільне сховище, але підтвердити
  // це нічим. Той самий тег розділяє `SQLITE_CORRUPT` (`API-P` / `API-Q`)
  // за бекендом зберігання.
  lastVfs = driver.vfs;
  noteActiveSqliteVfs(driver.vfs);
  if (driver.vfs === "opfs-sahpool") watchOpfsWipe(SAH_POOL_DIRECTORY);
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
 * `Worker`, OPFS, що не піднявся, впале перелиття — веде в базу `:memory:`
 * у воркері ({@link openMemoryDb}).
 *
 * AI-DANGER: під цим прапорцем база ІНША — окремий файл в OPFS, а не
 * спільний localStorage-блоб. Від стадії 2 дані переїжджають разом із
 * двигуном: при першому відкритті стара база копіюється сюди цілком
 * (`kvvfsHandoff`). Старе сховище під час копіювання НЕ чіпається; після
 * нього його стирає стадія 3 (`canRemoveKvvfsStore`, priv-17).
 *
 * Від стадії 3 це БЕЗУМОВНИЙ основний шлях: прапорця більше немає.
 *
 * AI-DANGER: не повертай сюди тумблер. Його прибрано за рішенням власника
 * саме тому, що ручне вимикання розщеплює дані — записи, зроблені в OPFS,
 * у старе сховище не повертаються, і людина лишається з двома половинами
 * історії, не знаючи про це. Відкат тепер один і чесний: ревертнути
 * коміт. Автоматичний фолбек від цього не постраждав — він нижче і
 * спрацьовує на будь-якій невдачі воркера.
 *
 * AI-DANGER: фолбек тепер — памʼять, а не kvvfs (PR-T1, 2026-11-18). Тож
 * невдале перелиття НЕ ставить позначку і не лишає порожнього файлу:
 * старе сховище чекає наступного запуску, а людина бачить банер.
 */
async function openWorkerBackedDb(userKey: string): Promise<OpenedDb | null> {
  return openWithRetry((options) => attemptWorkerBackedDb(userKey, options), {
    isLockContention: isOpfsLockContention,
    onRetry: ({ reason, attempt, delayMs }) => {
      addSentryBreadcrumb({
        category: "storage",
        level: "info",
        message:
          reason === "lock"
            ? "sqlite: opfs pool busy, retrying"
            : "sqlite: worker open timed out, retrying with fresh worker",
        data: { attempt, delayMs },
      });
    },
    onGiveUp: (err) => {
      if (isChunkLoadError(err)) reloadOnceForChunkError();
      // Ретраї вичерпано, а пул усе ще зайнятий - отже тримає його не наш
      // попередній воркер, а щось довговічніше. Причина доїжджає до аркуша
      // «Синхронізація» окремим рядком: її людина усуває сама.
      const busy = isOpfsLockContention(err);
      if (busy) noteSqliteVfsFallbackReason("pool-busy");
      const unsupported = !busy && isOpfsUnsupported(err);
      if (unsupported) noteUnsupportedDevice(userKey);
      else noteLegacyStoreKeptIfStranded(userKey);
      addSentryBreadcrumb({
        category: "storage",
        level: "warning",
        message: "sqlite: worker backend unavailable, falling back",
        data: {
          error: err instanceof Error ? err.message : String(err),
          poolBusy: busy,
          unsupported,
        },
      });
    },
  });
}

/**
 * Чи це саме «пул зайнятий», а не чесна відмова середовища.
 *
 * Розрізняти обов'язково: на пристрої без OPFS (`Missing required OPFS
 * APIs`) ретраї лише додали б півсекунди до кожного холодного старту, так
 * нічого й не змінивши.
 */
function isOpfsLockContention(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === "NoModificationAllowedError") return true;
  return /createSyncAccessHandle|Access Handles cannot be created/i.test(
    err.message,
  );
}

/**
 * Чи це чесна відмова середовища: OPFS у воркері немає (`Missing required
 * OPFS APIs`) або воркера немає взагалі. На такому пристрої reload нічого
 * не змінить, і банер не має цього обіцяти.
 */
function isOpfsUnsupported(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  // DOMException-и, які середовище кидає з `navigator.storage.getDirectory()`
  // чи встановлення пулу, коли сховище заборонене (приватний режим, політика
  // сайту) або API відсутній: повтор їх не лікує, тож reload не обіцяємо.
  // Ім'я доїжджає з воркера (`SqliteWorkerError.name`). `InvalidStateError`
  // сюди навмисно не входить: він буває й тимчасовим.
  if (err.name === "SecurityError" || err.name === "NotSupportedError") {
    return true;
  }
  return /Missing required OPFS APIs|Worker is unavailable/i.test(err.message);
}

/**
 * Пристрій без OPFS у воркері (PR-T1, рішення власника Б, 2026-11-18).
 *
 * Якщо на ньому лежить неперелите kvvfs-сховище, воно лишається
 * НЕДОТОРКАНИМ: ми його більше не відкриваємо, але й не стираємо. Щойно
 * браузер оновиться і OPFS у воркері з'явиться, `attemptWorkerBackedDb`
 * перелиє його звичайним шляхом (позначки ще немає). Тег — щоб власник
 * бачив у Sentry, скільки таких пристроїв насправді.
 */
function noteUnsupportedDevice(userKey: string): void {
  noteSqliteVfsFallbackReason("unsupported");
  noteLegacyStoreKeptIfStranded(userKey);
}

/**
 * Старе kvvfs-сховище не перелилось, хоч би чому не відкрився OPFS (не лише
 * «не підтримується»: таймаут, зіпсований знімок, інша відмова). Воно
 * лежить недоторканим, і банер має це сказати незалежно від класу помилки.
 */
function noteLegacyStoreKeptIfStranded(userKey: string): void {
  if (!isHandoffDone(userKey) && hasKvvfsData()) {
    noteSqliteLegacyStoreKept();
    setSentryTag("sqlite.kvvfs_stranded", "true");
    addSentryBreadcrumb({
      category: "storage",
      level: "warning",
      message: "sqlite: legacy kvvfs store left untouched (no worker OPFS)",
    });
  }
}

async function attemptWorkerBackedDb(
  userKey: string,
  options: WorkerOpenAttemptOptions = {},
): Promise<OpenedDb> {
  const { openSqliteInWorker } = await import("./sqliteWorkerClient.js");
  const handoff = await import("./kvvfsHandoff.js");
  const dbName = `sergeant-${userKey}.db`;
  // Стадія 2: перелиття старої бази. Рядки читаються ЛИШЕ доки немає
  // позначки — після переїзду цей шлях більше не виконується. SQLite тут
  // не потрібен: файл бази з рядків збирає воркер (`kvvfsConvert.ts`).
  const needsHandoff = !handoff.isHandoffDone(userKey);
  const importKvvfs = needsHandoff ? handoff.readKvvfsSnapshot() : null;
  const conn = await openSqliteInWorker(dbName, {
    directory: SAH_POOL_DIRECTORY,
    initialCapacity: SAH_POOL_INITIAL_CAPACITY,
    minFreeSlots: SAH_POOL_MIN_FREE_SLOTS,
    importKvvfs,
    ...(options.openTimeoutMs !== undefined
      ? { openTimeoutMs: options.openTimeoutMs }
      : {}),
  });
  if (needsHandoff) {
    // Перепис — ДО підчищання і лише на свіжо зібраному файлі: після
    // підчищання чужих партицій у ньому вже не видно (стадія 3, priv-17).
    const census = conn.imported
      ? await handoff.takeKvvfsCensus(conn).catch(() => null)
      : null;
    // Підчищаємо ЗАВЖДИ, а не лише після свіжого імпорту: попередня
    // спроба могла впасти саме між імпортом і підчищанням, і тоді файл
    // уже існує, але містить чужі партиції. На чистій базі це no-op.
    const prunedTables = await handoff.pruneForeignPartitionRows(
      conn,
      activeUserId,
      {
        keepKvStore:
          activeUserId !== null &&
          !handoff.isAnotherAccountHandoffDone(userKey, ANON_USER_KEY),
      },
    );
    // Позначка ставиться ОСТАННЬОЮ. Доки її немає, перелиття вважається
    // таким, що не відбулось, і наступний запуск доробить його.
    handoff.markHandoffDone(userKey);
    // Стадія 3: старе сховище стирається лише ПІСЛЯ позначки і лише коли
    // КОЖНА партиція знімка вже має свою (`canRemoveKvvfsStore`). Інакше
    // воно чекає перелиття наступної партиції.
    const removedKeys =
      census &&
      handoff.canRemoveKvvfsStore(census, {
        anonHandedOff: handoff.isHandoffDone(ANON_USER_KEY),
        isAccountHandedOff: (id) => handoff.isHandoffDone(sanitizeUserKey(id)),
        kvStoreDelivered:
          activeUserId !== null ||
          handoff.isAnotherAccountHandoffDone(userKey, ANON_USER_KEY),
      })
        ? handoff.removeKvvfsStore()
        : 0;
    addSentryBreadcrumb({
      category: "storage",
      level: "info",
      message: "sqlite: kvvfs handoff completed",
      data: { imported: conn.imported, prunedTables, removedKeys },
    });
  }
  lastWorkerDiagnostics = await conn.diagnostics();
  // priv-05: довести недостерте після виходу й прибрати осиротілі файли.
  // Без await: прибирання не затримує бут і не кидає.
  void cleanupOrphanSqliteFiles(conn, dbName);
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
    // Файл на акаунт — видаляється цілком. `userId` тут не потрібен:
    // чужих рядків у файлі немає.
    wipe: () => conn.wipe(),
    // Воркер у `wipe` сам закриває БД і робить `unlink`; після `close()`
    // клієнт уже мертвий, тож стирати треба ДО нього (priv-05).
    wipeBeforeClose: true,
  };
}

/**
 * База `:memory:` у воркері — останній рубіж, щоб контракт `getSqliteDb()`
 * лишався живим.
 *
 * Stale-deploy recovery: чанк клієнта воркера і сам воркер версійовані,
 * тож після деплою стара вкладка може не знайти їх; ловимо на місці й
 * віддаємо в той самий one-shot-reload, що й решта чанків.
 *
 * Якщо не піднявся навіть воркер — бази немає зовсім. Тоді стан
 * сховища позначається як `memory`: для всіх споживачів це безпечний бік
 * (журнал dual-write не знімає записів, банер каже, що записи не
 * зберігаються), а `getSqliteDb()` відхиляється, як і раніше на збої.
 */
async function openMemoryDb(): Promise<OpenedDb> {
  try {
    const { openSqliteMemoryInWorker } =
      await import("./sqliteWorkerClient.js");
    const conn = await openSqliteMemoryInWorker();
    logger.warn(
      "[sqlite] No persistent VFS available; using in-memory database. " +
        "Data will not survive a reload.",
    );
    return {
      conn,
      vfs: "memory",
      dbName: ":memory:",
      // Нічого стирати: база не торкалась диска.
      wipe: async () => {},
      wipeBeforeClose: false,
    };
  } catch (err) {
    if (isChunkLoadError(err)) reloadOnceForChunkError();
    if (isOpfsUnsupported(err)) noteSqliteVfsFallbackReason("unsupported");
    lastVfs = "memory";
    noteActiveSqliteVfs("memory");
    setSentryTag("sqlite.vfs", "none");
    addSentryBreadcrumb({
      category: "storage",
      level: "error",
      message: "sqlite: no database at all (worker did not start)",
      data: { error: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }
}

/**
 * Detects whether the page is `crossOriginIsolated`. When it is not, the
 * plain Worker-backed OPFS VFS (which requires `SharedArrayBuffer`) is
 * unavailable. We surface this loudly in DevTools and as a Sentry
 * breadcrumb so production triage can correlate fallback usage with the
 * current header config — but we do NOT throw, since the OPFS-SAH Pool
 * VFS works without COOP/COEP and the memory fallback is always available.
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
      "back to OPFS-SAH-Pool / memory. See storage-roadmap PR #016 for the " +
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
 * Зʼєднання анонімної партиції, яке СИНХРОННО ставить прапорець DIRTY перед
 * кожним SQL, що може записати дані для переносу в профіль
 * ({@link sqlMayWriteAnonData}).
 *
 * AI-DANGER: хук стоїть тут, на шарі виконання SQL, а не в модульних
 * писачах: так його не обійде жоден писач, про якого ми не знаємо (хуки
 * дуалрайту чотирьох модулів, HubChat, імпорт Strong, міграції схем). Запис
 * прапорця мусить іти ДО `conn.*`, не після: обрив між ними має лишити
 * DIRTY, а не рядок без DIRTY.
 */
function markAnonDirtyBeforeWrites(conn: SqliteConnection): SqliteConnection {
  return {
    exec(sql) {
      if (sqlMayWriteAnonData(sql)) markAnonPartitionDirty();
      return conn.exec(sql);
    },
    run(sql, bind) {
      if (sqlMayWriteAnonData(sql)) markAnonPartitionDirty();
      return conn.run(sql, bind);
    },
    all(sql, bind, rowMode) {
      if (sqlMayWriteAnonData(sql)) markAnonPartitionDirty();
      return conn.all(sql, bind, rowMode);
    },
    close() {
      return conn.close();
    },
  };
}

/**
 * Wrap an `oo1.DB` so it satisfies the cross-platform
 * {@link SqliteMigrationClient} contract — the same `{exec, run, all}`
 * surface the migration runner and the routine SPIKE repo are written
 * against. Від стадії 1 спеки `sqlite-opfs-worker.md` методи асинхронні
 * (контракт це допускав завжди: `void | Promise<void>` / `R[] | Promise<R[]>`),
 * бо база живе у воркері.
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

interface OpenedDb {
  readonly conn: SqliteConnection;
  readonly vfs: SqliteVfs;
  /** Name of the underlying store (OPFS filename / `:memory:`). */
  readonly dbName: string;
  /**
   * Removes this DB's persistent storage. Order relative to `close()` is
   * given by {@link wipeBeforeClose}.
   *
   * @param userId Raw id of the user being wiped, or `null`. Unused by both
   *   remaining backends (an OPFS file belongs to exactly one user; memory
   *   has nothing on disk); kept so a future shared-store backend has to
   *   decide how to scope its teardown. See {@link wipeSqliteDb}.
   */
  wipe(userId: string | null): Promise<void>;
  /**
   * `true` — `wipe` викликається ДО `close()`: воркерний бекенд (воркер сам
   * закриває БД перед `unlink`, а `close()` клієнта вбиває воркер).
   * `false` — після `close()`: memory (нічого стирати).
   */
  readonly wipeBeforeClose: boolean;
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

/** Тека пулу в OPFS (у воркері). */
const SAH_POOL_DIRECTORY = "/sergeant/sqlite";

/**
 * Заповненість пулу, як її повідомив воркер на відкритті.
 *
 * `readSqliteStorageDiagnostics()` синхронний (його кличе рядок діагностики
 * збою переносу), а воркер відповідає лише промісом. Тому тримаємо останнє
 * відоме значення: на момент відкриття воно точне, далі — орієнтир.
 */
let lastWorkerDiagnostics: SqliteStorageDiagnostics | null = null;

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

/** Сирий id активної партиції, або `null` для анонімної. */
export function readActiveSqliteUserId(): string | null {
  return activeUserId;
}

/**
 * Заповненість SAH-пулу, як її повідомив воркер на відкритті, або `null`
 * поза OPFS-гілкою (memory, тести). Ніколи не кидає: це діагностика.
 */
export function readSqliteStorageDiagnostics(): SqliteStorageDiagnostics | null {
  return lastWorkerDiagnostics;
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
