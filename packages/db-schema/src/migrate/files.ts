import { promises as fs } from "node:fs";
import path from "node:path";
import { MIGRATION_FILENAME_RE, type MigrationFile } from "./types.js";

/**
 * Node-only helper that loads `NNN_description.sql` files from `dir`
 * into the {@link MigrationFile} shape that {@link runMigrations}
 * accepts. Browser / mobile bundles must NOT import this module —
 * they should ship migrations as pre-bundled string constants. The
 * runner itself stays Node-free; this helper is the convenience layer
 * for server-side and CLI consumers.
 *
 * Behaviour:
 *
 * - Reads the directory, filters to `*.sql` matching
 *   {@link MIGRATION_FILENAME_RE}, and **excludes** `.down.sql`
 *   companions (those are documented manual rollbacks per AGENTS.md
 *   hard rule #4 — production never auto-applies them).
 * - Returns the files sorted lexicographically by filename so the
 *   runner's apply order is stable across platforms.
 * - Empty SQL bodies are passed through. The runner happily applies
 *   them; the existing `apps/server/migrate.mjs` skipped empties — we
 *   leave that judgement to the adapter so the runner stays mechanical.
 */
export async function loadMigrationFiles(
  dir: string,
): Promise<MigrationFile[]> {
  const entries = await fs.readdir(dir);
  const sqlFiles = entries
    .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))
    .filter((f) => MIGRATION_FILENAME_RE.test(f))
    .sort();

  const out: MigrationFile[] = [];
  for (const name of sqlFiles) {
    const sql = await fs.readFile(path.join(dir, name), "utf8");
    out.push({ name, sql });
  }
  return out;
}
