/**
 * Last validated: 2026-09-14
 * Status: Active
 *
 * Протокол між головним потоком і `sqliteWorker.ts` — стадія 1 спеки
 * [`sqlite-opfs-worker.md`](../../../../../docs/work/specs/sqlite-opfs-worker.md).
 *
 * AI-DANGER: цей файл містить ЛИШЕ типи. Жодного рантайм-коду, жодного
 * імпорту. Його читають обидва боки, а воркер збирається окремим entry —
 * тобто все, що сюди потрапить як значення, Rollup ЗДУБЛЮЄ у воркерний
 * бандл, а `size-limit` сумує всі емітовані чанки. Типи стираються на
 * білді й коштують нуль.
 *
 * Набір повідомлень навмисно повторює дві поверхні, які вже існують:
 * `{exec, run, all}` з `SqliteMigrationClient` і `run/all/values/get` із
 * `drizzle-orm/sqlite-proxy`. `get` тут немає — це `all` із зрізом першого
 * рядка на боці клієнта, а зайве повідомлення в протоколі означало б зайву
 * гілку у воркері.
 */

/** Як воркер віддає рядки: масивами значень чи обʼєктами по іменах колонок. */
export type SqliteWorkerRowMode = "array" | "object";

/** Параметри прив'язки. Структурований клон вміє все, що приймає sqlite-wasm. */
export type SqliteWorkerBind = readonly unknown[];

export type SqliteWorkerRequest =
  | {
      readonly id: number;
      readonly kind: "open";
      readonly dbName: string;
      readonly directory: string;
      readonly initialCapacity: number;
      readonly minFreeSlots: number;
    }
  | { readonly id: number; readonly kind: "exec"; readonly sql: string }
  | {
      readonly id: number;
      readonly kind: "run";
      readonly sql: string;
      readonly bind: SqliteWorkerBind;
    }
  | {
      readonly id: number;
      readonly kind: "all";
      readonly sql: string;
      readonly bind: SqliteWorkerBind;
      readonly rowMode: SqliteWorkerRowMode;
    }
  | { readonly id: number; readonly kind: "diagnostics" }
  | { readonly id: number; readonly kind: "close" }
  | { readonly id: number; readonly kind: "wipe" };

/** Заповненість SAH-пулу — те саме, що `readSqliteStorageDiagnostics()`. */
export interface SqliteWorkerDiagnostics {
  readonly capacity: number;
  readonly fileCount: number;
}

export interface SqliteWorkerOpenResult {
  readonly dbName: string;
  /** Скільки слотів пул доростив на відкритті; 0 — запасу вистачало. */
  readonly grewBy: number;
  readonly diagnostics: SqliteWorkerDiagnostics | null;
}

/**
 * Помилка з іншого потоку. `Error` не переживає структурований клон, тож
 * переносимо руками — і разом із `resultCode`, бо саме він відрізняє
 * `SQLITE_IOERR` (10, переповнення сховища) від `SQLITE_CANTOPEN`
 * (14, переповнення пулу). Без нього діагностика знову стає здогадом.
 */
export interface SqliteWorkerErrorPayload {
  readonly name: string;
  readonly message: string;
  readonly resultCode: number | null;
}

export type SqliteWorkerResponse =
  | {
      readonly id: number;
      readonly ok: true;
      readonly kind: "open";
      readonly result: SqliteWorkerOpenResult;
    }
  | {
      readonly id: number;
      readonly ok: true;
      readonly kind: "all";
      readonly rows: readonly unknown[];
    }
  | {
      readonly id: number;
      readonly ok: true;
      readonly kind: "diagnostics";
      readonly result: SqliteWorkerDiagnostics | null;
    }
  | {
      readonly id: number;
      readonly ok: true;
      readonly kind: "exec" | "run" | "close" | "wipe";
    }
  | {
      readonly id: number;
      readonly ok: false;
      readonly error: SqliteWorkerErrorPayload;
    };

/**
 * Запит без `id` — його проставляє клієнт.
 *
 * AI-NOTE: саме розподільна форма, а не `Omit<SqliteWorkerRequest, "id">`:
 * звичайний `Omit` над юніоном лишає тільки СПІЛЬНІ поля, тобто `sql` і
 * `dbName` просто зникають із типу.
 */
export type SqliteWorkerCall = SqliteWorkerRequest extends infer T
  ? T extends { readonly id: number }
    ? Omit<T, "id">
    : never
  : never;
