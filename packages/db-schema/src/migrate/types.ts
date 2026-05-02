/**
 * Public types for the cross-platform schema migration runner.
 *
 * The runner is dialect-free: it operates against a {@link MigrationAdapter}
 * that hides the difference between Postgres (`drizzle-orm/node-postgres` or
 * raw `pg`) and SQLite (`drizzle-orm/expo-sqlite`, sqlite-wasm proxy, or
 * `better-sqlite3` in tests). Adapter factories live in
 * {@link "./adapters/pg"} and {@link "./adapters/sqlite"} and are imported
 * lazily by callers — the runner itself never references either dialect.
 *
 * Implements PR #019 of `docs/planning/storage-roadmap.md`.
 */

/**
 * A single migration file resolved into memory. Filenames must match
 * `^\d+_[A-Za-z0-9._-]+\.sql$` and are applied in lexicographic order.
 */
export interface MigrationFile {
  /** Filename — used as the primary key in the migrations ledger. */
  readonly name: string;
  /** Raw SQL body. Multiple statements separated by `;` are allowed. */
  readonly sql: string;
}

/**
 * Adapter contract that the {@link runMigrations} runner depends on. One
 * implementation per dialect; both ship in `@sergeant/db-schema/migrate/pg`
 * and `@sergeant/db-schema/migrate/sqlite`.
 *
 * Implementations are responsible for transactional safety: the
 * {@link applyMigration} call must apply the migration SQL **and** insert
 * the ledger row in a single atomic unit so that a partial failure leaves
 * the database in a clean state.
 */
export interface MigrationAdapter {
  /**
   * Create the migrations ledger table if it does not exist. Must be
   * idempotent — the runner calls this on every invocation.
   *
   * Required ledger shape (column names are stable, types are
   * dialect-appropriate):
   *
   * - `id`     — INTEGER PRIMARY KEY (autoincrement)
   * - `name`   — TEXT NOT NULL UNIQUE
   * - `applied_at` — timestamp default `now()`
   */
  ensureLedger(tableName: string): Promise<void>;
  /**
   * Return the names of every migration that has already been applied,
   * in insertion order. Used to compute the diff against the requested
   * file list.
   */
  getAppliedNames(tableName: string): Promise<string[]>;
  /**
   * Apply a single migration in a transaction: execute `sql`, then
   * record the migration in the ledger. Throws if either side fails;
   * implementations must roll the transaction back on failure so the
   * ledger never reflects a partially applied migration.
   */
  applyMigration(tableName: string, name: string, sql: string): Promise<void>;
}

/**
 * Logger callback emitted by {@link runMigrations}. Optional — pass it
 * if the consumer wants per-migration visibility (server logs, Sentry
 * breadcrumbs, etc.). The runner stays silent if no logger is provided.
 */
export type MigrationLogEvent =
  | { type: "ensure_ledger"; tableName: string }
  | { type: "skipped"; name: string }
  | { type: "applying"; name: string }
  | { type: "applied"; name: string; durationMs: number }
  | { type: "failed"; name: string; error: Error };

export type MigrationLogger = (event: MigrationLogEvent) => void;

export interface RunMigrationsOptions {
  /** Adapter created via `createPgAdapter` or `createSqliteAdapter`. */
  readonly adapter: MigrationAdapter;
  /** Migrations to apply, in the order they should run. */
  readonly files: readonly MigrationFile[];
  /**
   * Override the ledger table name. Defaults to `__migrations`. The
   * server's existing `apps/server/migrate.mjs` uses `schema_migrations`
   * — pass that here if/when consumers wire the new runner to share the
   * existing ledger.
   */
  readonly tableName?: string;
  /** Optional sink for per-migration log events. */
  readonly logger?: MigrationLogger;
}

export interface RunMigrationsResult {
  /** Names of migrations applied during this invocation. */
  readonly applied: string[];
  /** Names of migrations skipped because the ledger already had them. */
  readonly skipped: string[];
  /** Ledger table name actually used (defaulted or caller-provided). */
  readonly tableName: string;
}

/** Default ledger table name. Matches PR #019's roadmap spec. */
export const DEFAULT_MIGRATIONS_TABLE = "__migrations";

/**
 * Filename contract: starts with one or more digits, an underscore, a
 * description, and ends in `.sql`. We deliberately reject `.down.sql`
 * (the existing server convention treats those as manual rollbacks
 * that production never auto-applies — see AGENTS.md hard rule #4).
 */
export const MIGRATION_FILENAME_RE = /^\d+_[A-Za-z0-9._-]+\.sql$/;
