/**
 * Last validated: 2026-09-14
 * Status: Active
 *
 * Клієнт бази, що живе у воркері — стадія 1 спеки
 * [`sqlite-opfs-worker.md`](../../../../../docs/work/specs/sqlite-opfs-worker.md).
 *
 * Обов'язок один: перетворити повідомлення на проміси і НІКОЛИ не лишити
 * виклик без відповіді. Три способи, якими база в іншому потоці може
 * підвести, і всі три закриті тут:
 *
 * 1. Воркер не піднявся взагалі (CSP, старий рушій) — `openSqliteInWorker`
 *    кидає, і `sqlite.ts` спокійно йде на свій наявний фолбек.
 * 2. Відкриття зависло — таймаут. Ініціалізація WASM на телефоні повільна,
 *    тож поріг щедрий, але скінченний.
 * 3. Воркер помер посеред роботи — усі незавершені виклики відхиляються
 *    разом, а не висять вічно. Це найпідліший випадок: без цього застосунок
 *    виглядав би просто «задумливим».
 *
 * AI-DANGER: після відкриття таймаутів на запити НЕМА і бути не має.
 * Транзакція на 1356 рядків — легітимно довга, і відхилити її по таймеру
 * означало б порвати запис посередині. Межу тут ставить смерть воркера, а
 * не годинник.
 */
import type {
  SqliteWorkerBind,
  SqliteWorkerCall,
  SqliteWorkerDiagnostics,
  SqliteWorkerRequest,
  SqliteWorkerResponse,
  SqliteWorkerRowMode,
} from "./sqliteProtocol";

/** Скільки чекаємо на `open`: ініціалізація WASM + підняття пулу. */
const OPEN_TIMEOUT_MS = 30_000;

/**
 * Відкриття не вклалось у таймаут. Окремий клас, щоб `sqlite.ts` міг
 * відрізнити «воркер мовчить» (варто одна повторна спроба з новим
 * воркером) від чесної відмови середовища (ретрай безглуздий).
 */
export class SqliteWorkerOpenTimeoutError extends Error {
  constructor() {
    super("sqlite-worker: timed out");
    this.name = "SqliteWorkerOpenTimeoutError"; // зіставляється за name у workerOpenRetry.ts
  }
}

export interface SqliteWorkerConnection {
  readonly dbName: string;
  /** Скільки слотів пул доростив на відкритті. */
  readonly grewBy: number;
  /** Чи справді відбувся імпорт старої бази (стадія 2). */
  readonly imported: boolean;
  exec(sql: string): Promise<void>;
  run(sql: string, bind: SqliteWorkerBind): Promise<void>;
  all(
    sql: string,
    bind: SqliteWorkerBind,
    rowMode: SqliteWorkerRowMode,
  ): Promise<unknown[]>;
  diagnostics(): Promise<SqliteWorkerDiagnostics | null>;
  close(): Promise<void>;
  wipe(): Promise<void>;
}

export interface SqliteWorkerOpenOptions {
  readonly directory: string;
  readonly initialCapacity: number;
  readonly minFreeSlots: number;
  /**
   * Байти старої бази для перелиття (стадія 2), або `null`.
   *
   * AI-DANGER: буфер передається у воркер як transferable і після цього
   * на головному потоці порожній. Так і задумано — база важить мегабайти.
   */
  readonly importBytes?: ArrayBuffer | null;
  /** Перевизначає {@link OPEN_TIMEOUT_MS}; для повторної спроби після таймауту. */
  readonly openTimeoutMs?: number;
}

/**
 * Помилка, що прийшла з воркера, з відновленим `resultCode`.
 *
 * Код тут не декорація: `SQLITE_IOERR` (10) і `SQLITE_CANTOPEN` (14) — це
 * дві РІЗНІ причини (переповнене сховище проти переповненого пулу), і саме
 * за цією цифрою їх розвели під час розбору 2026-09-14.
 */
export class SqliteWorkerError extends Error {
  readonly resultCode: number | null;
  constructor(name: string, message: string, resultCode: number | null) {
    super(message);
    this.name = name;
    this.resultCode = resultCode;
  }
}

type Pending = {
  resolve: (response: SqliteWorkerResponse) => void;
  reject: (err: unknown) => void;
};

function spawnWorker(): Worker {
  if (typeof Worker === "undefined") {
    throw new Error("sqlite-worker: Worker is unavailable");
  }
  return new Worker(new URL("./sqliteWorker.ts", import.meta.url), {
    type: "module",
  });
}

/**
 * Піднімає воркер і відкриває в ньому базу на OPFS-SAH пулі.
 *
 * Кидає, якщо щось пішло не так — успіх тут означає робочу базу, а не
 * «воркер начебто стартував». Рішення про фолбек ухвалює виклик у
 * `sqlite.ts`, бо лише там відомо, куди падати.
 */
export async function openSqliteInWorker(
  dbName: string,
  options: SqliteWorkerOpenOptions,
): Promise<SqliteWorkerConnection> {
  const worker = spawnWorker();
  const pending = new Map<number, Pending>();
  let nextId = 1;
  let dead: Error | null = null;

  const killAll = (err: Error) => {
    dead = err;
    for (const [, entry] of pending) entry.reject(err);
    pending.clear();
  };

  worker.onmessage = (event: MessageEvent<SqliteWorkerResponse>) => {
    const entry = pending.get(event.data.id);
    if (!entry) return;
    pending.delete(event.data.id);
    entry.resolve(event.data);
  };
  worker.onerror = (event) =>
    killAll(new Error(event.message || "sqlite-worker: worker error"));
  worker.onmessageerror = () =>
    killAll(new Error("sqlite-worker: message could not be deserialized"));

  const send = (
    request: SqliteWorkerCall,
    timeoutMs?: number,
    transfer?: Transferable[],
    onTimeout?: () => Error,
  ): Promise<SqliteWorkerResponse> => {
    if (dead) return Promise.reject(dead);
    const id = nextId++;
    return new Promise<SqliteWorkerResponse>((resolve, reject) => {
      const timer =
        timeoutMs === undefined
          ? null
          : setTimeout(() => {
              pending.delete(id);
              reject(
                onTimeout ? onTimeout() : new Error("sqlite-worker: timed out"),
              );
            }, timeoutMs);
      pending.set(id, {
        resolve: (response) => {
          if (timer) clearTimeout(timer);
          resolve(response);
        },
        reject: (err) => {
          if (timer) clearTimeout(timer);
          reject(err);
        },
      });
      const message = { ...request, id } as SqliteWorkerRequest;
      if (transfer && transfer.length > 0)
        worker.postMessage(message, transfer);
      else worker.postMessage(message);
    });
  };

  const call = async (
    request: SqliteWorkerCall,
    timeoutMs?: number,
    transfer?: Transferable[],
    onTimeout?: () => Error,
  ): Promise<SqliteWorkerResponse> => {
    const response = await send(request, timeoutMs, transfer, onTimeout);
    if (!response.ok) {
      throw new SqliteWorkerError(
        response.error.name,
        response.error.message,
        response.error.resultCode,
      );
    }
    return response;
  };

  let opened: SqliteWorkerResponse;
  try {
    const importBytes = options.importBytes ?? undefined;
    opened = await call(
      {
        kind: "open",
        dbName,
        directory: options.directory,
        initialCapacity: options.initialCapacity,
        minFreeSlots: options.minFreeSlots,
        ...(importBytes ? { importBytes } : {}),
      },
      options.openTimeoutMs ?? OPEN_TIMEOUT_MS,
      importBytes ? [importBytes] : undefined,
      () => new SqliteWorkerOpenTimeoutError(),
    );
  } catch (err) {
    // Невдале відкриття — воркер більше ні для чого не потрібен. Лишити
    // його висіти означало б тримати потік і, можливо, OPFS-лок.
    worker.terminate();
    throw err;
  }
  const grewBy = opened.ok && opened.kind === "open" ? opened.result.grewBy : 0;
  const imported =
    opened.ok && opened.kind === "open" ? opened.result.imported : false;

  const terminate = () => {
    killAll(new Error("sqlite-worker: connection closed"));
    worker.terminate();
  };

  return {
    dbName,
    grewBy,
    imported,
    async exec(sql) {
      await call({ kind: "exec", sql });
    },
    async run(sql, bind) {
      await call({ kind: "run", sql, bind });
    },
    async all(sql, bind, rowMode) {
      const response = await call({ kind: "all", sql, bind, rowMode });
      return response.ok && response.kind === "all"
        ? Array.from(response.rows)
        : [];
    },
    async diagnostics() {
      try {
        const response = await call({ kind: "diagnostics" });
        return response.ok && response.kind === "diagnostics"
          ? response.result
          : null;
      } catch {
        // Діагностика не має права стати новим шляхом відмови.
        return null;
      }
    },
    async close() {
      try {
        await call({ kind: "close" });
      } finally {
        terminate();
      }
    },
    async wipe() {
      await call({ kind: "wipe" });
    },
  };
}
