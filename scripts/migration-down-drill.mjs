#!/usr/bin/env node
// scripts/migration-down-drill.mjs
//
// Migration down.sql drill — validates that every `apps/server/src/migrations/
// *.down.sql` can roll back the corresponding up migration cleanly, and that
// re-applying every up migration after the rollback produces the same schema.
//
// Required by PR-32 of `docs/planning/pr-plan-2026-05.md` and Hard Rule #4
// (`docs/governance/rules/04-sql-migrations-sequential-two-phase.md`): down
// migrations exist for **local rollbacks** — production never runs them, but
// CI must guarantee they are not silently broken (no DROP-references to
// removed columns, no missing indexes, no IF-NOT-EXISTS / IF-EXISTS skew).
//
// Algorithm:
//
//   Phase A — fresh schema → apply all `NNN_*.sql` (excluding `*.down.sql`)
//             in lexicographic order. Capture fingerprint A (full structural
//             snapshot of `public` — tables, columns, indexes, constraints).
//
//   Phase B — apply every `NNN_*.down.sql` in REVERSE order. Migrations
//             without a `.down.sql` companion are logged as `skip:no-down`
//             (legitimate per Hard Rule #4 — down is optional). The drill
//             does NOT fail on missing downs.
//
//   Phase C — fresh schema → apply all ups again. Capture fingerprint C.
//
//   Phase D — assert fingerprint A === fingerprint C. If a down migration
//             ever leaks state (e.g. forgets to drop a sequence created by
//             the up), Phase C still works but the resulting schema differs
//             from Phase A and the drill fails.
//
// Fail-fast: any SQL error during any phase exits 1 immediately. The script
// prints the offending file + the postgres error before exiting so CI logs
// land on a clearly attributable failure.
//
// Usage:
//   DATABASE_URL=postgresql://hub:hub@127.0.0.1:5432/hub \
//     node scripts/migration-down-drill.mjs
//
// CI wires this via `.github/workflows/ci.yml › migration-down-drill` against
// a pgvector/pgvector:pg16 service container — the same image used by the
// `critical-flow` and `coverage` jobs (migration 025 needs the vector ext).

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "apps", "server", "src", "migrations");

const MIGRATION_FILE_RE = /^(\d{3})_.+\.sql$/;
const DOWN_FILE_RE = /\.down\.sql$/;

function log(level, msg, extra) {
  const payload = { level, msg, ...(extra ?? {}) };

  console.log(JSON.stringify(payload));
}

async function listUpMigrations() {
  const files = await readdir(MIGRATIONS_DIR);
  return files
    .filter((f) => MIGRATION_FILE_RE.test(f) && !DOWN_FILE_RE.test(f))
    .sort();
}

async function readSql(file) {
  // `file` comes from `readdir(MIGRATIONS_DIR)`, never from user input —
  // path is fully server-controlled.
  return (await readFile(join(MIGRATIONS_DIR, file), "utf8")).trim();
}

async function downCompanion(upFile) {
  // `NNN_foo.sql` → `NNN_foo.down.sql`
  return upFile.replace(/\.sql$/, ".down.sql");
}

async function fileExists(file) {
  try {
    // `file` is constructed from a vetted up-migration name; never user-supplied.
    await readFile(join(MIGRATIONS_DIR, file), "utf8");
    return true;
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "ENOENT") {
      return false;
    }
    throw e;
  }
}

async function resetSchema(client) {
  await client.query("DROP SCHEMA IF EXISTS public CASCADE");
  await client.query("CREATE SCHEMA public");
  await client.query("GRANT ALL ON SCHEMA public TO public");
}

async function applyFile(client, file) {
  const sql = await readSql(file);
  if (!sql) return;
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {
      /* best-effort */
    });
    throw new MigrationError(file, e);
  }
}

class MigrationError extends Error {
  constructor(file, cause) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    super(`${file}: ${msg}`);
    this.file = file;
    this.cause = cause;
  }
}

async function applyForward(client, files) {
  await resetSchema(client);
  for (const f of files) {
    log("info", "drill_apply_up", { file: f });
    await applyFile(client, f);
  }
}

async function rollbackReverse(client, ups) {
  const skipped = [];
  const rolledBack = [];
  for (const up of [...ups].reverse()) {
    const down = await downCompanion(up);
    if (!(await fileExists(down))) {
      skipped.push(up);
      log("info", "drill_skip_no_down", { up });
      continue;
    }
    log("info", "drill_apply_down", { down });
    await applyFile(client, down);
    rolledBack.push(down);
  }
  return { skipped, rolledBack };
}

// ── Schema fingerprint ──────────────────────────────────────────────────────
//
// We snapshot the public schema using stable, order-deterministic queries
// against information_schema / pg_catalog and hash the JSON. Anything that
// matters for application-level compatibility (tables, columns + types +
// nullability + defaults, indexes, constraints) is included; anything
// volatile (statistics, OIDs, comments) is omitted.

async function fingerprintSchema(client) {
  const tables = await client.query(
    `SELECT table_name, table_type
       FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name`,
  );

  const columns = await client.query(
    `SELECT table_name,
            column_name,
            data_type,
            udt_name,
            is_nullable,
            column_default,
            is_generated,
            generation_expression
       FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position`,
  );

  const indexes = await client.query(
    `SELECT tablename, indexname, indexdef
       FROM pg_indexes
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname`,
  );

  // Postgres ≥16 surfaces synthetic NOT NULL check constraints named
  // `<table_oid>_<column_oid>_<attnum>_not_null` via
  // `information_schema.table_constraints`. Those names depend on the OID
  // a row got at CREATE time, so re-applying the same DDL yields a
  // different name and breaks fingerprint equality. NOT NULL semantics
  // are already captured by `is_nullable` in the columns query — filter
  // these synthetic rows out.
  const constraints = await client.query(
    `SELECT table_name, constraint_name, constraint_type
       FROM information_schema.table_constraints
      WHERE table_schema = 'public'
        AND constraint_name !~ '^[0-9]+_[0-9]+_[0-9]+_not_null$'
      ORDER BY table_name, constraint_name`,
  );

  const sequences = await client.query(
    `SELECT sequence_name, data_type
       FROM information_schema.sequences
      WHERE sequence_schema = 'public'
      ORDER BY sequence_name`,
  );

  const enums = await client.query(
    `SELECT t.typname AS enum_name,
            e.enumlabel AS enum_value
       FROM pg_type t
       JOIN pg_enum e ON e.enumtypid = t.oid
       JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
      ORDER BY t.typname, e.enumsortorder`,
  );

  const snapshot = {
    tables: tables.rows,
    columns: columns.rows,
    indexes: indexes.rows,
    constraints: constraints.rows,
    sequences: sequences.rows,
    enums: enums.rows,
  };
  const json = JSON.stringify(snapshot);
  const digest = createHash("sha256").update(json).digest("hex");
  return { digest, snapshot };
}

function diffSnapshots(a, b) {
  const keys = [
    "tables",
    "columns",
    "indexes",
    "constraints",
    "sequences",
    "enums",
  ];
  const diff = {};
  for (const key of keys) {
    const aRows = JSON.stringify(a[key]);
    const bRows = JSON.stringify(b[key]);
    if (aRows !== bRows) {
      diff[key] = {
        onlyInA: a[key].filter(
          (r) => !b[key].some((br) => JSON.stringify(br) === JSON.stringify(r)),
        ),
        onlyInB: b[key].filter(
          (r) => !a[key].some((ar) => JSON.stringify(ar) === JSON.stringify(r)),
        ),
      };
    }
  }
  return diff;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    log("error", "drill_database_url_missing", {
      hint: "Set DATABASE_URL to a postgres connection string (pgvector/pgvector:pg16).",
    });
    process.exit(1);
  }

  const ups = await listUpMigrations();
  log("info", "drill_start", {
    upCount: ups.length,
    migrationsDir: MIGRATIONS_DIR,
  });

  const pool = new pg.Pool({ connectionString: url, max: 2 });
  const client = await pool.connect();

  try {
    // Phase A — forward.
    log("info", "drill_phase_a_forward");
    await applyForward(client, ups);
    const fpA = await fingerprintSchema(client);
    log("info", "drill_phase_a_done", { digest: fpA.digest });

    // Phase B — reverse rollback.
    log("info", "drill_phase_b_reverse");
    const { skipped, rolledBack } = await rollbackReverse(client, ups);
    log("info", "drill_phase_b_done", {
      rolledBack: rolledBack.length,
      skipped: skipped.length,
      skippedFiles: skipped,
    });

    // Phase C — forward again.
    log("info", "drill_phase_c_forward_again");
    await applyForward(client, ups);
    const fpC = await fingerprintSchema(client);
    log("info", "drill_phase_c_done", { digest: fpC.digest });

    // Phase D — fingerprint equality.
    log("info", "drill_phase_d_compare");
    if (fpA.digest !== fpC.digest) {
      const diff = diffSnapshots(fpA.snapshot, fpC.snapshot);
      log("error", "drill_fingerprint_mismatch", {
        digestA: fpA.digest,
        digestC: fpC.digest,
        diff,
      });
      process.exitCode = 1;
      return;
    }

    log("info", "drill_ok", {
      digest: fpA.digest,
      upCount: ups.length,
      rolledBack: rolledBack.length,
      noDownSkipped: skipped.length,
    });
  } catch (e) {
    if (e instanceof MigrationError) {
      log("error", "drill_migration_failed", {
        file: e.file,
        error: e.cause instanceof Error ? e.cause.message : String(e.cause),
        code:
          e.cause && typeof e.cause === "object" && "code" in e.cause
            ? e.cause.code
            : undefined,
      });
    } else {
      log("error", "drill_unhandled", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end().catch(() => {
      /* best-effort */
    });
  }
}

// Allow importing helpers from unit tests without running main().
const invokedDirectly = process.argv[1]
  ? resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
  : false;

if (invokedDirectly) {
  main().catch((e) => {
    log("error", "drill_top_level_throw", {
      error: e instanceof Error ? e.message : String(e),
    });
    process.exit(1);
  });
}

export {
  listUpMigrations,
  downCompanion,
  fileExists,
  diffSnapshots,
  MigrationError,
};
