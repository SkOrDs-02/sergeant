import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// __dirname = packages/db-schema/src/__tests__ → 4 levels up to repo root.
const ROOT = resolve(__dirname, "../../../..");

/** Run the drift script, capturing JSON output + exit code regardless of drift. */
function runDrift(
  args: string,
  env?: NodeJS.ProcessEnv,
): { output: string; exitCode: number } {
  let output = "";
  let exitCode = 0;
  try {
    output = execSync(`node scripts/check-schema-drift.mjs ${args}`, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...env },
    });
  } catch (err: unknown) {
    const e = err as { stdout?: string; status?: number };
    output = e.stdout ?? "";
    exitCode = e.status ?? 1;
  }
  return { output, exitCode };
}

/**
 * Integration smoke-test for scripts/check-schema-drift.mjs (PR-11).
 * Runs the script against the real SQL migrations and Drizzle schema files.
 * Passes if and only if the script exits 0 (no drift detected).
 *
 * This test catches accidental regression where a SQL migration is added
 * without updating the Drizzle schema (or vice-versa) and the script's
 * whitelist is not updated to document the divergence.
 */
describe("Drizzle schema ↔ SQL migration drift", () => {
  it("reports no drift between packages/db-schema/src/pg and migrations", () => {
    let output = "";
    let exitCode = 0;
    try {
      output = execSync("node scripts/check-schema-drift.mjs --json", {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; status?: number };
      output = e.stdout ?? "";
      exitCode = e.status ?? 1;
    }

    let result: {
      ok: boolean;
      issues: Array<{ kind: string; message: string }>;
    };
    try {
      result = JSON.parse(output);
    } catch {
      throw new Error(
        `check-schema-drift.mjs did not produce valid JSON.\nRaw output:\n${output}`,
      );
    }

    if (!result.ok) {
      const summary = result.issues
        .map((i) => `  [${i.kind}] ${i.message}`)
        .join("\n");
      throw new Error(
        `Schema drift detected (${result.issues.length} issue(s)):\n${summary}\n\n` +
          "Fix: update packages/db-schema/src/pg/*.ts to match SQL migrations,\n" +
          "or add a whitelist entry in scripts/check-schema-drift.mjs.",
      );
    }

    expect(result.ok).toBe(true);
    expect(exitCode).toBe(0);
  }, 30_000);

  it("has every SQL-only table documented in SQL_ONLY_TABLES", () => {
    // --list-sql-only друкує всі SQL-таблиці без Drizzle-моделі. Кожна має бути
    // в allowlist-і, інакше table-sql-only впав би у головному прогоні вище.
    const { output, exitCode } = runDrift("--list-sql-only");
    expect(exitCode).toBe(0);
    const result = JSON.parse(output) as {
      count: number;
      notAllowlisted: string[];
    };
    expect(result.count).toBeGreaterThan(0); // sanity: детектор бачить таблиці
    expect(result.notAllowlisted).toEqual([]);
  }, 30_000);

  it("flags a new SQL-only table that is neither modelled nor allowlisted", () => {
    // Фікстура: одна SQL-міграція з таблицею, якої немає ні в Drizzle, ні в
    // SQL_ONLY_TABLES → детектор має повернути issue kind=table-sql-only.
    const tmp = mkdtempSync(join(tmpdir(), "drift-fixture-"));
    try {
      const sqlDir = join(tmp, "sql");
      const pgDir = join(tmp, "pg");
      const sqliteDir = join(tmp, "sqlite");
      mkdirSync(sqlDir);
      mkdirSync(pgDir);
      mkdirSync(sqliteDir);
      writeFileSync(
        join(sqlDir, "001_rogue.sql"),
        "CREATE TABLE rogue_sql_only_table (\n  id BIGSERIAL PRIMARY KEY,\n  name TEXT NOT NULL\n);\n",
      );

      const { output, exitCode } = runDrift("--json", {
        SCHEMA_DRIFT_SQL_DIR: sqlDir,
        SCHEMA_DRIFT_PG_DIR: pgDir,
        SCHEMA_DRIFT_SQLITE_DIR: sqliteDir,
      });

      expect(exitCode).toBe(1);
      const result = JSON.parse(output) as {
        ok: boolean;
        issues: Array<{ kind: string; table: string }>;
      };
      expect(result.ok).toBe(false);
      expect(
        result.issues.some(
          (i) =>
            i.kind === "table-sql-only" && i.table === "rogue_sql_only_table",
        ),
      ).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 30_000);
});
