/**
 * Re-export of the Postgres adapter so callers can do
 *   `import { createPgAdapter } from "@sergeant/db-schema/migrate/pg";`
 * without reaching into the package's internal `adapters/` folder.
 *
 * Server / Node-only — this module pulls the `pg`-style typing surface
 * onto the import graph and must not be imported from web/mobile bundles.
 */
export { createPgAdapter, type PgQueryClient } from "./adapters/pg.js";
