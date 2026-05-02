import type { MigrationAdapter } from "../types.js";

/**
 * Postgres adapter for the cross-platform migration runner.
 *
 * Accepts any object with a `pg`-shaped `query` function — concretely:
 *
 * - `pg.Pool` from `node-postgres`
 * - `pg.PoolClient` (preferred, since the runner can serialise calls
 *   on the same connection — important when pairing with
 *   `pg_advisory_lock` in a higher-level wrapper)
 * - the `client.query` exposed by drizzle-orm/node-postgres internals
 * - any test fake matching the same shape (see pg-mem in
 *   `__tests__/migrate.pg.test.ts`)
 *
 * Transactional safety: each call to {@link MigrationAdapter.applyMigration}
 * runs `BEGIN` / migration SQL / `INSERT INTO __migrations` / `COMMIT`
 * inline. On any error we issue `ROLLBACK` and re-throw — leaving the
 * Postgres session in a clean state and the ledger untouched for the
 * failed file.
 *
 * Lazy-import: this module is only loaded by callers that actually run
 * Postgres migrations, so client bundles (web / mobile) never pay the
 * `pg` typing cost.
 */

export interface PgQueryResult {
  readonly rows: ReadonlyArray<Record<string, unknown>>;
}

export interface PgQueryClient {
  query(sql: string, params?: unknown[]): Promise<PgQueryResult>;
}

export function createPgAdapter(client: PgQueryClient): MigrationAdapter {
  return {
    async ensureLedger(tableName) {
      const ident = quoteIdentifier(tableName);
      // Postgres-side shape matches the spec: `id INTEGER PK, name TEXT,
      // applied_at TIMESTAMP`. We use SERIAL for the PK and TIMESTAMPTZ
      // for `applied_at` so the ledger plays nicely with the rest of
      // the server schema (see AGENTS.md domain invariants — Kyiv-day
      // bucketing relies on TIMESTAMPTZ at rest).
      await client.query(
        `CREATE TABLE IF NOT EXISTS ${ident} (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
      );
    },

    async getAppliedNames(tableName) {
      const ident = quoteIdentifier(tableName);
      const result = await client.query(
        `SELECT name FROM ${ident} ORDER BY id ASC`,
      );
      return result.rows.map((r) => {
        const value = r["name"];
        if (typeof value !== "string") {
          throw new Error(
            `Migrations ledger row missing "name" column: ${JSON.stringify(r)}`,
          );
        }
        return value;
      });
    },

    async applyMigration(tableName, name, sql) {
      const ident = quoteIdentifier(tableName);
      await client.query("BEGIN");
      try {
        if (sql.trim().length > 0) {
          await client.query(sql);
        }
        await client.query(`INSERT INTO ${ident} (name) VALUES ($1)`, [name]);
        await client.query("COMMIT");
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // Best-effort: if rollback itself fails, surface the original
          // error rather than the rollback's. The Postgres session will
          // self-heal once the connection is released back to the pool.
        }
        throw err;
      }
    },
  };
}

/**
 * Quote a Postgres identifier, doubling embedded quotes per the spec.
 * The runner already validates the table name against
 * `/^[A-Za-z_][A-Za-z0-9_]*$/`, so this is a defence-in-depth pass.
 */
function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}
