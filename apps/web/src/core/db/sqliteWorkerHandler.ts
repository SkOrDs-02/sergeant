/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * Виконавець запитів до SQLite — уся робота воркера без привʼязки до `self`.
 *
 * AI-CONTEXT: винесено з `sqliteWorker.ts` 2026-11-18 (PR-T1, рішення
 * власника Б). Головний потік більше не має власної копії sqlite-wasm, тож
 * тестам, яким потрібна справжня база, ніде її взяти, крім як тут: фейковий
 * `Worker` у `__tests__/inProcessSqliteWorker.ts` створює окремий
 * виконавець на кожен «воркер», зі своїм станом, як і справжній потік.
 * Сам `sqliteWorker.ts` лишається тонким: перевірка повідомлень і
 * `postMessage`.
 */
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";

import { kvvfsSnapshotToBytes } from "./kvvfsConvert";
import { pruneOrphanPartitions, type PrunePool } from "./sqliteWorkerPrune";
import type {
  SqliteWorkerDiagnostics,
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
  try {
    await target.addCapacity(grewBy);
  } catch {
    // Не фатально: база могла відкритись і на наявних слотах. Оптимізація
    // запасу не має ставати новим шляхом відмови (той самий інваріант жив
    // у головнопотоковій гілці до PR-T1, 2026-11-18). Якщо `SQLITE_CANTOPEN`
    // повернеться, `grewBy: 0` у крихті «opened in worker» скаже, що
    // запасу не додалось.
    return 0;
  }
  return grewBy;
}

export type SqliteWorkerHandler = (
  request: SqliteWorkerRequest,
) => Promise<SqliteWorkerResponse>;

/** Один виконавець = один воркер: стан бази живе в замиканні. */
export function createSqliteWorkerHandler(): SqliteWorkerHandler {
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

  return async function handle(request) {
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
        // Імпорт — ПЕРЕД відкриттям: `importDb` пише файл цілком, тож на
        // відкритій базі він або не спрацює, або залишить її в невідомому
        // стані. Наявний файл не чіпаємо взагалі: там уже живуть дані, і
        // перезапис затер би саме те, заради чого переїзд робиться.
        //
        // AI-DANGER: ім'я для `importDb` мусить бути НОРМАЛІЗОВАНИМ, зі
        // скісною на початку. Пул кладе імпортований файл у свою мапу рівно
        // під тим рядком, який йому дали, а `xOpen` шукає файл під шляхом
        // після `new URL(name, "file://localhost/").pathname`, тобто під
        // `/sergeant-…db`. Передати сюди голе ім'я — і імпорт ляже під
        // ключем, якого відкриття ніколи не спитає: байти на диску є, база
        // порожня, і жодної помилки.
        const path = `/${request.dbName}`;
        const exists = installed.getFileNames().includes(path);
        // Знімок kvvfs збирається у файл лише тоді, коли файлу ще немає:
        // на повторних запусках розбирати мегабайти рядків нема навіщо.
        // Зіпсований знімок КИДАЄ (див. `kvvfsConvert.ts`), і відкриття
        // падає цілком: краще база в памʼяті з чесним банером і повтор
        // на наступному запуску, ніж порожній файл, після якого позначка
        // «перелито» назавжди відрізала б старі дані.
        const bytes =
          request.importKvvfs && !exists
            ? kvvfsSnapshotToBytes(sqlite3, request.importKvvfs)
            : null;
        const imported = bytes !== null;
        if (bytes) await installed.importDb(path, bytes);
        db = new installed.OpfsSAHPoolDb(request.dbName);
        openDbName = request.dbName;
        return {
          id,
          ok: true,
          kind: "open",
          result: {
            dbName: request.dbName,
            grewBy,
            diagnostics: diagnostics(),
            imported,
          },
        };
      }
      case "openMemory": {
        const sqlite3 = await sqlite3InitModule();
        db = new sqlite3.oo1.DB(":memory:", "ct");
        openDbName = null;
        return {
          id,
          ok: true,
          kind: "open",
          result: {
            dbName: ":memory:",
            grewBy: 0,
            diagnostics: null,
            imported: false,
          },
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
        // AI-DANGER: ім'я НОРМАЛІЗОВАНЕ, зі скісною на початку — як для
        // `importDb` вище. `unlink` пулу не нормалізує шлях (іде прямо в
        // `deletePath`), а відкриті файли лежать у його мапі під
        // `/sergeant-…db`. Голе ім'я тихо повертало `false`, і файл розділу
        // на виході не стирався взагалі, доки його не прибирав примусовий
        // prune на наступному старті (знайдено 2026-11-19).
        if (pool && openDbName) pool.unlink(`/${openDbName}`);
        return { id, ok: true, kind: "wipe" };
      }
      case "prune": {
        if (!pool) throw new Error("sqlite-worker: pool is not installed");
        const result = pruneOrphanPartitions(
          pool satisfies PrunePool,
          request.keep,
          request.force,
          request.sweep,
        );
        return { id, ok: true, kind: "prune", result };
      }
    }
  };
}
