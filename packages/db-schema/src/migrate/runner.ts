import {
  DEFAULT_MIGRATIONS_TABLE,
  MIGRATION_FILENAME_RE,
  type MigrationFile,
  type RunMigrationsOptions,
  type RunMigrationsResult,
} from "./types.js";

/**
 * Cross-platform schema migration runner. Walks the supplied list of
 * `*.sql` files in order, skipping any whose name is already present in
 * the ledger and applying the rest one-at-a-time inside an
 * adapter-managed transaction.
 *
 * Contract:
 *
 * - **Sequential.** Files are applied in lexicographic order — the
 *   caller's responsibility to provide them sorted (helpers in
 *   `./files.ts` do this for filesystem inputs).
 * - **Idempotent.** A second invocation with no new files writes
 *   nothing: it only reads the ledger and returns `applied: []`.
 * - **Transaction per file.** Each migration is wrapped by the
 *   adapter so a syntax error mid-file rolls back without recording
 *   the file in the ledger; the next attempt picks up from there.
 * - **Fails fast on partial failure.** When a migration throws, the
 *   runner re-throws after asking the adapter to roll back. Earlier
 *   migrations in the same batch keep their ledger rows so a retry
 *   with the failing file fixed resumes from the broken file.
 *
 * See `packages/db-schema/src/__tests__/migrate.*.test.ts` for the
 * roll-forward / no-op / mid-batch-failure scenarios that lock this
 * behaviour in.
 */
export async function runMigrations(
  opts: RunMigrationsOptions,
): Promise<RunMigrationsResult> {
  const tableName = opts.tableName ?? DEFAULT_MIGRATIONS_TABLE;
  validateTableName(tableName);
  const files = [...opts.files];
  for (const file of files) {
    validateFilename(file.name);
  }
  // Apply in lexicographic order regardless of the caller's input order.
  files.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const log = opts.logger ?? noopLogger;

  log({ type: "ensure_ledger", tableName });
  await opts.adapter.ensureLedger(tableName);

  const appliedSet = new Set(await opts.adapter.getAppliedNames(tableName));
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    if (appliedSet.has(file.name)) {
      skipped.push(file.name);
      log({ type: "skipped", name: file.name });
      continue;
    }
    log({ type: "applying", name: file.name });
    const startedAt = Date.now();
    try {
      await opts.adapter.applyMigration(tableName, file.name, file.sql);
    } catch (err) {
      const error =
        err instanceof Error
          ? err
          : new Error(typeof err === "string" ? err : String(err));
      log({ type: "failed", name: file.name, error });
      throw new MigrationFailedError(file.name, error);
    }
    applied.push(file.name);
    log({
      type: "applied",
      name: file.name,
      durationMs: Date.now() - startedAt,
    });
  }

  return { applied, skipped, tableName };
}

/**
 * Error thrown by {@link runMigrations} when a single migration fails.
 * Wraps the underlying adapter / SQL error so callers can match on a
 * stable type instead of brittle string compares.
 */
export class MigrationFailedError extends Error {
  readonly migration: string;
  override readonly cause: Error;
  constructor(migration: string, cause: Error) {
    super(`Migration "${migration}" failed: ${cause.message}`);
    this.name = "MigrationFailedError";
    this.migration = migration;
    this.cause = cause;
  }
}

const TABLE_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function validateTableName(tableName: string): void {
  if (!TABLE_NAME_RE.test(tableName)) {
    throw new Error(
      `Invalid migrations ledger table name: "${tableName}". ` +
        "Must match /^[A-Za-z_][A-Za-z0-9_]*$/.",
    );
  }
}

function validateFilename(name: MigrationFile["name"]): void {
  if (!MIGRATION_FILENAME_RE.test(name)) {
    throw new Error(
      `Invalid migration filename: "${name}". ` +
        "Expected pattern NNN_description.sql (matches /^\\d+_[A-Za-z0-9._-]+\\.sql$/).",
    );
  }
}

function noopLogger(): void {
  /* no-op */
}
