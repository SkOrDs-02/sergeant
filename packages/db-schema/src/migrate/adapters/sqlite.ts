import { DEFAULT_MIGRATIONS_TABLE, type MigrationAdapter } from "../types.js";

/**
 * SQLite adapter for the cross-platform migration runner.
 *
 * Accepts a thin "session" interface so the same adapter works with
 * every SQLite client we ship:
 *
 * - **`better-sqlite3`** (synchronous, used in tests).
 * - **`drizzle-orm/expo-sqlite`** wrapper around expo-sqlite — the
 *   adapter awaits the resulting promises so sync and async clients
 *   share one code path.
 * - **`drizzle-orm/sqlite-proxy`** (sqlite-wasm in `apps/web`) — the
 *   proxy callback signature is async-by-construction.
 *
 * Transactional safety: `applyMigration` runs `BEGIN` / migration SQL /
 * `INSERT INTO __migrations` / `COMMIT` inline. On error we issue
 * `ROLLBACK` and re-throw, mirroring the pg adapter so callers get the
 * same partial-failure semantics on either dialect.
 *
 * Lazy-import: server bundles do not import this module so they don't
 * pay for SQLite shims, and vice-versa.
 */

/**
 * Minimal SQLite client surface the adapter needs. Keep the API tiny so
 * adapter shims for new SQLite drivers are short to write.
 */
export interface SqliteMigrationClient {
  /**
   * Execute one or more raw SQL statements (no parameter binding).
   * Used for DDL, transaction control, and the migration body itself.
   * `better-sqlite3.prototype.exec` and sqlite-wasm's `oo1.DB#exec`
   * both run multi-statement strings; expo-sqlite exposes
   * `execAsync(sql)` with the same semantics.
   */
  exec(sql: string): void | Promise<void>;
  /**
   * Run a single parameterised statement. Used for the ledger writes
   * (`INSERT INTO __migrations (name) VALUES (?)`). No row results.
   */
  run(sql: string, params: readonly unknown[]): void | Promise<void>;
  /**
   * Run a SELECT and return its rows. Used to read applied migrations
   * back out of the ledger.
   */
  all<R extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): R[] | Promise<R[]>;
}

/**
 * Черга «одна міграція за раз» на КЛІЄНТА (а отже — на DB-хендл).
 *
 * AI-DANGER: `applyMigration` тримає `await` між `BEGIN` і `COMMIT`, а
 * кожен `await` віддає керування циклу подій. У вебі чотири модульні
 * мігратори (`migrateFizruk`, `migrateRoutine`, `migrateFinyk`,
 * `migrateNutrition`) стартують із бут-ефектів одного рендеру й ділять
 * ОДИН `oo1.DB`. Без цієї черги другий `BEGIN` прилітав усередину
 * першої транзакції, sqlite відповідав `cannot start a transaction
 * within a transaction`, бут модуля падав і він тихо лишався на
 * LS-фолбеку. Симптом ловився лише без COOP/COEP (memory-VFS повільніший,
 * тож вікно гонки ширше) — на OPFS та сама гонка просто рідша, не
 * відсутня.
 *
 * `SAVEPOINT` замість `BEGIN` тут НЕ підходить: savepoint-и мають
 * LIFO-семантику, тож `RELEASE` зовнішнього звільнив би і вкладений,
 * зафіксувавши чужу напівзастосовану міграцію. Серіалізація — єдина
 * коректна відповідь для спільного хендла.
 */
const clientLocks = new WeakMap<SqliteMigrationClient, Promise<void>>();

function withClientLock<T>(
  client: SqliteMigrationClient,
  task: () => Promise<T>,
): Promise<T> {
  const previous = clientLocks.get(client) ?? Promise.resolve();
  // `then(task, task)` — навмисно на обидві гілки: провалена міграція
  // одного модуля не має назавжди заблокувати чергу для решти.
  const result = previous.then(task, task);
  clientLocks.set(
    client,
    result.then(
      () => undefined,
      () => undefined,
    ),
  );
  return result;
}

export function createSqliteAdapter(
  client: SqliteMigrationClient,
): MigrationAdapter {
  return {
    defaultTableName: DEFAULT_MIGRATIONS_TABLE,

    async ensureLedger(tableName) {
      const ident = quoteIdentifier(tableName);
      // SQLite-side shape mirrors the Postgres ledger but uses
      // `INTEGER PRIMARY KEY AUTOINCREMENT` (rowid by default does not
      // guarantee monotonic ids across deletes — autoincrement does)
      // and stores `applied_at` as ISO-8601 text via `datetime('now')`,
      // matching the existing client schemas in
      // `packages/db-schema/src/sqlite/*`.
      await client.exec(
        `CREATE TABLE IF NOT EXISTS ${ident} (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`,
      );
    },

    async getAppliedNames(tableName) {
      const ident = quoteIdentifier(tableName);
      const rows = await client.all<{ name: string }>(
        `SELECT name FROM ${ident} ORDER BY id ASC`,
      );
      return rows.map((r) => r.name);
    },

    async applyMigration(tableName, name, sql) {
      const ident = quoteIdentifier(tableName);
      // Серіалізовано по клієнту — див. `withClientLock` вище.
      return withClientLock(client, async () => {
        await client.exec("BEGIN");
        try {
          // AI-DANGER: перевірка лежить УСЕРЕДИНІ транзакції, а не
          // покладається на `appliedSet`, який раннер зняв ДО циклу.
          //
          // `withClientLock` серіалізує по обʼєкту клієнта, а не по фізичній
          // базі, тож два різні хендли на ОДНУ БД мають два незалежні замки.
          // Так буває у двох штатних станах: kvvfs-фолбек (старий iOS Safari)
          // тримає всі партиції в одному фізичному файлі, а перемикання
          // анон→юзер створює свіжий хендл поверх тієї самої бази. Обидва
          // прогони знімають порожній `appliedSet`, перший комітить міграцію,
          // другий уже поза транзакцією першого — тож `BEGIN` проходить, тіло
          // (ідемпотентні `CREATE TABLE IF NOT EXISTS`) теж, а `INSERT`
          // у леджер валиться `UNIQUE constraint failed: __migrations.name`.
          // Бут модуля падав, і він тихо лишався на LS-фолбеку —
          // `SERGEANT-API-V`, 4 користувачі, серпень 2026.
          //
          // Повторна перевірка робить операцію no-op, коли гонку виграв
          // хтось інший: наслідок для схеми той самий (міграція застосована),
          // тому це не приховування помилки, а розпізнавання benign-гонки.
          const already = await client.all<{ name: string }>(
            `SELECT name FROM ${ident} WHERE name = ? LIMIT 1`,
            [name],
          );
          if (already.length > 0) {
            await client.exec("COMMIT");
            return;
          }
          if (sql.trim().length > 0) {
            await client.exec(sql);
          }
          await client.run(`INSERT INTO ${ident} (name) VALUES (?)`, [name]);
          await client.exec("COMMIT");
        } catch (err) {
          try {
            await client.exec("ROLLBACK");
          } catch {
            // Best-effort: surface the original migration error.
          }
          throw err;
        }
      });
    },
  };
}

/**
 * Quote a SQLite identifier with double quotes, doubling embedded
 * quotes per SQL spec. The runner already validates the table name
 * against `/^[A-Za-z_][A-Za-z0-9_]*$/`, so this is defence-in-depth.
 */
function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}
