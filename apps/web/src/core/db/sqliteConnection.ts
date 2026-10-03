/**
 * Last validated: 2026-09-14
 * Status: Active
 *
 * Спільний інтерфейс з'єднання з локальною базою — стадія 1 спеки
 * [`sqlite-opfs-worker.md`](../../../../../docs/work/specs/sqlite-opfs-worker.md).
 *
 * AI-CONTEXT: до цієї стадії `sqlite.ts` тримав СИНХРОННИЙ `oo1.DB` і
 * будував на ньому і drizzle-проксі, і клієнт міграцій. База у воркері
 * такого хендла дати не може в принципі — між потоками він не
 * переноситься. Тому обидва бекенди зводяться сюди, до чотирьох
 * асинхронних методів, а споживачі вище лишаються незмінними: drizzle уже
 * ходить через async-колбек `sqlite-proxy`, а `SqliteMigrationClient`
 * оголошений як `void | Promise<void>` саме щоб приймати такі реалізації.
 *
 * Синхронний бекенд нічого не втрачає: обгортка лише повертає готове
 * значення промісом, жодної додаткової черги тут немає.
 */

type SqliteWasmModule = typeof import("@sqlite.org/sqlite-wasm");
type Sqlite3Static = Awaited<ReturnType<SqliteWasmModule["default"]>>;
type Sqlite3Database = InstanceType<Sqlite3Static["oo1"]["DB"]>;
type ExecOptionsArg = Parameters<Sqlite3Database["exec"]>[0];
type ExecOptions = Exclude<ExecOptionsArg, string | readonly string[]>;
type BindArg = Exclude<ExecOptions["bind"], undefined>;

/** Як повертати рядки: масивами значень чи обʼєктами по іменах колонок. */
export type SqliteRowMode = "array" | "object";

export interface SqliteConnection {
  /** SQL без параметрів і без результату (DDL, скрипти міграцій). */
  exec(sql: string): Promise<void>;
  /** SQL із параметрами, без результату. */
  run(sql: string, bind: readonly unknown[]): Promise<void>;
  /** SQL із параметрами, з рядками результату. */
  all(
    sql: string,
    bind: readonly unknown[],
    rowMode: SqliteRowMode,
  ): Promise<unknown[]>;
  close(): Promise<void>;
}

/** Обгортка над синхронним `oo1.DB` головного потоку. */
export function makeLocalConnection(db: Sqlite3Database): SqliteConnection {
  return {
    async exec(sql) {
      db.exec({ sql });
    },
    async run(sql, bind) {
      db.exec({ sql, bind: bind as BindArg });
    },
    async all(sql, bind, rowMode) {
      const rows = db.exec({
        sql,
        bind: bind as BindArg,
        rowMode,
        returnValue: "resultRows",
      });
      return Array.isArray(rows) ? Array.from(rows as unknown[]) : [];
    },
    async close() {
      db.close();
    },
  };
}
