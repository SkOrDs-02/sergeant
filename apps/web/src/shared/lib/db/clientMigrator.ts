import { runMigrations } from "@sergeant/db-schema/migrate/runner";
import {
  createSqliteAdapter,
  type SqliteMigrationClient,
} from "@sergeant/db-schema/migrate/sqlite";

// The runner is imported from the dedicated `./migrate/runner` sub-path
// rather than the umbrella `./migrate`: that entry re-exports
// `loadMigrationFiles` from `./files.js`, which top-level imports
// `node:fs` / `node:path` and breaks Vite's browser bundle once a SQLite
// library lands in the production graph (see PR #1378 follow-up). The
// runner itself is dialect- and platform-free.

type RunMigrationsOptions = Parameters<typeof runMigrations>[0];

/**
 * Build a module's SQLite client-migration runner.
 *
 * Each Sergeant module (finyk, fizruk, nutrition, routine) differs only
 * in its migration file set and its ledger table name; the runner call
 * shape is identical. The returned function is idempotent — re-running
 * over an already-migrated DB is a no-op thanks to the runner's ledger
 * contract (`<tableName>`).
 */
export function createClientMigrator(
  files: RunMigrationsOptions["files"],
  tableName: string,
): (client: SqliteMigrationClient) => Promise<void> {
  const run = async (client: SqliteMigrationClient): Promise<void> => {
    await runMigrations({
      adapter: createSqliteAdapter(client),
      files,
      tableName,
    });
  };

  // Хвіст останнього запуску ЦЬОГО раннера (кожен модуль має власний).
  //
  // AI-DANGER: ідемпотентність із докстрінга вище дійсна лише ПОСЛІДОВНО.
  // Раннер читає журнал `<tableName>`, застосовує відсутнє і дописує рядок.
  // Два паралельні виклики читають ще ПОРОЖНІЙ журнал одночасно, обидва
  // застосовують ту саму міграцію, і другий INSERT падає на
  // `SQLITE_CONSTRAINT_UNIQUE`.
  //
  // Паралельні виклики тут — норма, а не крайній випадок: boot-хуки одного
  // модуля (`sqliteReadBoot`, `dualWriteBoot`, дзеркало/quick-stats)
  // стартують із різних ефектів одного кадру. Той, хто програв гонку,
  // отримував reject — і його гілка бута тихо не виконувалась: кеш не
  // прогрівався, сторінки малювали нулі, і лише перезавантаження (журнал
  // уже повний → міграцій нема → гонки нема) показувало правильні числа.
  // Браузерний QA 2026-08-24 бачив обидва хвости цього сліду:
  // `SQLITE_CONSTRAINT_UNIQUE __finyk_migrations` у консолі, нульова
  // Аналітика до релоуду (F-13/F-18) і зависання оверлея міграції (Z-01).
  //
  // Черга дешева: після першого проходу журнал повний, тож кожен наступний
  // виклик — це один SELECT.
  let tail: Promise<void> | null = null;

  return (client: SqliteMigrationClient): Promise<void> => {
    // Провал попереднього виклику не має валити наступний: черга задає
    // ПОРЯДОК, а не спільну долю.
    const next = (tail ?? Promise.resolve()).then(
      () => run(client),
      () => run(client),
    );
    tail = next.catch(() => undefined);
    return next;
  };
}

export type { SqliteMigrationClient };
