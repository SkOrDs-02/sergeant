/**
 * Last validated: 2026-11-18
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
 * Від 2026-11-18 (PR-T1, рішення власника Б) бекенд лишився один —
 * воркер (`sqliteWorkerClient.ts`): головнопотокова обгортка над `oo1.DB`
 * пішла разом із копією sqlite-wasm на головному потоці. Інтерфейс
 * лишається окремим, бо його читають `sqlite.ts`, `kvvfsHandoff.ts` і
 * прибирання осиротілих файлів, і жоден із них не має знати про воркер.
 */

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
