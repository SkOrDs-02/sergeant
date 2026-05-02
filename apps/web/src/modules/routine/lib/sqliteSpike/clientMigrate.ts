import {
  ROUTINE_SPIKE_CLIENT_MIGRATIONS,
  ROUTINE_SPIKE_MIGRATIONS_TABLE,
} from "@sergeant/db-schema/sqlite/migrations";
// Import the runner from the dedicated `./migrate/runner` sub-path
// rather than `./migrate`. The umbrella `./migrate` entry re-exports
// `loadMigrationFiles` from `./files.js`, which top-level imports
// `node:fs` / `node:path` and breaks Vite's browser bundle when the
// SPIKE library lands in the production graph (see PR #1378
// follow-up). The runner itself is dialect- and platform-free.
import { runMigrations } from "@sergeant/db-schema/migrate/runner";
import {
  createSqliteAdapter,
  type SqliteMigrationClient,
} from "@sergeant/db-schema/migrate/sqlite";

/**
 * Run the bundled SPIKE migrations against an arbitrary SQLite client.
 *
 * The web app calls this with a small adapter wrapping the sqlite-wasm
 * `oo1.DB` instance returned by `apps/web/src/core/db/sqlite.ts`. The
 * mobile app uses an equivalent shim around `expo-sqlite`. Tests pass
 * a `better-sqlite3` adapter — same interface, different driver.
 *
 * Idempotent: re-running over an already-migrated DB is a no-op
 * thanks to the runner's `__migrations` ledger contract (see
 * `packages/db-schema/src/migrate/runner.ts`).
 */
export async function migrateRoutineSpike(
  client: SqliteMigrationClient,
): Promise<void> {
  await runMigrations({
    adapter: createSqliteAdapter(client),
    files: ROUTINE_SPIKE_CLIENT_MIGRATIONS,
    tableName: ROUTINE_SPIKE_MIGRATIONS_TABLE,
  });
}

export type { SqliteMigrationClient };
