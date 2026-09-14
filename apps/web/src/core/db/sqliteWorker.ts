/**
 * Last validated: 2026-09-14
 * Status: Active
 *
 * Власник SQLite у фоновому потоці — стадія 1 спеки
 * [`sqlite-opfs-worker.md`](../../../../../docs/work/specs/sqlite-opfs-worker.md).
 *
 * AI-CONTEXT: чому база взагалі має жити тут. `installOpfsSAHPoolVfs`
 * вимагає `FileSystemSyncAccessHandle`, якого на головному потоці немає —
 * тож виклик звідти завжди кидав `Missing required OPFS APIs`, і `sqlite.ts`
 * тихо з'їжджав на задекларований фолбек `JsStorageDb("local")`, тобто на
 * localStorage зі стелею ~5 МБ. Розвідка `opfsProbe.worker.ts` (стадія 0)
 * підтвердила на пристрої власника, що з воркера той самий API доступний.
 *
 * AI-DANGER: `oo1.DB` НЕ переноситься між потоками. Тому сюди переїжджає
 * не «встановлення пулу», а вся база: кожен запит приходить повідомленням і
 * повертається відповіддю. Не намагайся віддати хендл назад на головний
 * потік — такого шляху не існує.
 *
 * Воркер нічого не вирішує сам: вибір бекенда, фолбек і діагностика живуть
 * на боці клієнта (`sqliteWorkerClient.ts`). Тут лише виконання.
 */
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";

import type {
  SqliteWorkerDiagnostics,
  SqliteWorkerErrorPayload,
  SqliteWorkerRequest,
  SqliteWorkerResponse,
} from "./sqliteProtocol";

type Sqlite3Static = Awaited<ReturnType<typeof sqlite3InitModule>>;
type Sqlite3Database = InstanceType<Sqlite3Static["oo1"]["DB"]>;
type ExecOptionsArg = Parameters<Sqlite3Database["exec"]>[0];
type ExecOptions = Exclude<ExecOptionsArg, string | readonly string[]>;
type BindArg = Exclude<ExecOptions["bind"], undefined>;

/** Те, що віддає `installOpfsSAHPoolVfs` — без ручних звужень. */
type SahPool = Awaited<ReturnType<Sqlite3Static["installOpfsSAHPoolVfs"]>>;

let db: Sqlite3Database | null = null;
let pool: SahPool | null = null;
let openDbName: string | null = null;

function requireDb(): Sqlite3Database {
  if (!db) throw new Error("sqlite-worker: database is not open");
  return db;
}

function diagnostics(): SqliteWorkerDiagnostics | null {
  if (!pool) return null;
  try {
    return { capacity: pool.getCapacity(), fileCount: pool.getFileCount() };
  } catch {
    return null;
  }
}

/**
 * Дорощує пул до запасу вільних слотів.
 *
 * `initialCapacity` діє лише на ПЕРШІЙ ініціалізації пулу в цьому origin —
 * у людини, яка вже користувалась застосунком, пул створено зі старою
 * ємністю і таким лишиться. Кожен журнал і темп SQLite теж займає слот, а
 * переповнення пулу віддається як `SQLITE_CANTOPEN`. Див. той самий розбір
 * у `sqlite.ts` над `SAH_POOL_INITIAL_CAPACITY`.
 */
async function ensureHeadroom(target: SahPool, min: number): Promise<number> {
  const free = target.getCapacity() - target.getFileCount();
  if (free >= min) return 0;
  const grewBy = min - free;
  await target.addCapacity(grewBy);
  return grewBy;
}

async function handle(
  request: SqliteWorkerRequest,
): Promise<SqliteWorkerResponse> {
  const { id } = request;
  switch (request.kind) {
    case "open": {
      const sqlite3 = await sqlite3InitModule();
      const installed = await sqlite3.installOpfsSAHPoolVfs({
        directory: request.directory,
        initialCapacity: request.initialCapacity,
      });
      pool = installed;
      const grewBy = await ensureHeadroom(installed, request.minFreeSlots);
      db = new installed.OpfsSAHPoolDb(request.dbName);
      openDbName = request.dbName;
      return {
        id,
        ok: true,
        kind: "open",
        result: { dbName: request.dbName, grewBy, diagnostics: diagnostics() },
      };
    }
    case "exec": {
      requireDb().exec({ sql: request.sql });
      return { id, ok: true, kind: "exec" };
    }
    case "run": {
      const bind = request.bind as BindArg;
      requireDb().exec({ sql: request.sql, bind });
      return { id, ok: true, kind: "run" };
    }
    case "all": {
      const bind = request.bind as BindArg;
      const rows = requireDb().exec({
        sql: request.sql,
        bind,
        rowMode: request.rowMode,
        returnValue: "resultRows",
      });
      return {
        id,
        ok: true,
        kind: "all",
        rows: Array.isArray(rows) ? rows : [],
      };
    }
    case "diagnostics":
      return { id, ok: true, kind: "diagnostics", result: diagnostics() };
    case "close": {
      db?.close();
      db = null;
      return { id, ok: true, kind: "close" };
    }
    case "wipe": {
      // Файл на акаунт — тут ніщо чуже не лежить, тож видалення цілого
      // файлу завжди коректне. Порядок важливий і НЕ взаємозамінний:
      // пул лишає результат `unlink` невизначеним, доки файл відкритий,
      // тож спершу `close()`. Той самий інваріант — у `wipeSqliteDb`.
      db?.close();
      db = null;
      if (pool && openDbName) pool.unlink(openDbName);
      return { id, ok: true, kind: "wipe" };
    }
  }
}

function toPayload(err: unknown): SqliteWorkerErrorPayload {
  const code: unknown = (err as { resultCode?: unknown } | null)?.resultCode;
  return {
    name: err instanceof Error ? err.name : "Error",
    message: err instanceof Error ? err.message : String(err),
    resultCode: typeof code === "number" ? code : null,
  };
}

self.onmessage = (event: MessageEvent<SqliteWorkerRequest>) => {
  const request = event.data;
  handle(request).then(
    (response) => self.postMessage(response),
    (err: unknown) =>
      self.postMessage({
        id: request.id,
        ok: false,
        error: toPayload(err),
      } satisfies SqliteWorkerResponse),
  );
};
