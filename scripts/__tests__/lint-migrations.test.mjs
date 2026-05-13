// scripts/__tests__/lint-migrations.test.mjs
//
// Unit tests for the migration linter (AGENTS.md rule #4).
// Run with: node --test scripts/__tests__/lint-migrations.test.mjs

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  isCommentLine,
  findDropLines,
  hasAllowDropEscapeHatch,
  hasNoRollbackEscapeHatch,
  isEmptyDownMigration,
  checkSequentialNumbers,
  findCrossBranchCollisions,
  filterNewMigrationFiles,
  run,
} from "../lint-migrations.mjs";

// ── isCommentLine ────────────────────────────────────────────────────────────

describe("isCommentLine", () => {
  it("returns true for lines starting with --", () => {
    assert.equal(isCommentLine("-- this is a comment"), true);
    assert.equal(isCommentLine("  -- indented comment"), true);
    assert.equal(isCommentLine("--no space"), true);
  });

  it("returns false for non-comment lines", () => {
    assert.equal(isCommentLine("DROP TABLE foo;"), false);
    assert.equal(isCommentLine("ALTER TABLE foo DROP COLUMN bar;"), false);
    assert.equal(isCommentLine("SELECT '--not a comment';"), false);
    assert.equal(isCommentLine(""), false);
  });
});

// ── findDropLines ────────────────────────────────────────────────────────────

describe("findDropLines", () => {
  it("finds DROP TABLE statements", () => {
    const content = "CREATE TABLE foo;\nDROP TABLE bar;\nSELECT 1;";
    const result = findDropLines(content);
    assert.equal(result.length, 1);
    assert.equal(result[0].lineNumber, 2);
    assert.ok(result[0].text.includes("DROP TABLE"));
  });

  it("finds DROP COLUMN statements", () => {
    const content = "ALTER TABLE foo\n  DROP COLUMN bar;";
    const result = findDropLines(content);
    assert.equal(result.length, 1);
    assert.equal(result[0].lineNumber, 2);
  });

  it("ignores comment lines containing DROP", () => {
    const content = "-- DROP TABLE old_table;\nSELECT 1;";
    const result = findDropLines(content);
    assert.equal(result.length, 0);
  });

  it("is case-insensitive", () => {
    const lines = [
      "drop table foo;",
      "Drop Column bar;",
      "DROP   TABLE baz;",
      "DROP\tCOLUMN qux;",
    ];
    for (const line of lines) {
      const result = findDropLines(line);
      assert.equal(result.length, 1, `Expected match for: ${line}`);
    }
  });

  it("returns empty for clean SQL", () => {
    const content =
      "CREATE TABLE foo (id INT);\nALTER TABLE foo ADD COLUMN bar TEXT;";
    assert.equal(findDropLines(content).length, 0);
  });

  it("finds multiple DROP statements in one file", () => {
    const content = "DROP TABLE a;\nSELECT 1;\nALTER TABLE b DROP COLUMN c;";
    assert.equal(findDropLines(content).length, 2);
  });
});

// ── hasAllowDropEscapeHatch ──────────────────────────────────────────────────

describe("hasAllowDropEscapeHatch", () => {
  it("returns true when ALLOW_DROP comment exists", () => {
    const content =
      "-- ALLOW_DROP: legacy cleanup (due: 2026-06-01)\nDROP TABLE foo;";
    assert.equal(hasAllowDropEscapeHatch(content), true);
  });

  it("returns true for minimal ALLOW_DROP", () => {
    assert.equal(
      hasAllowDropEscapeHatch("-- ALLOW_DROP: reason\nDROP TABLE x;"),
      true,
    );
  });

  it("returns false when no ALLOW_DROP comment", () => {
    assert.equal(hasAllowDropEscapeHatch("DROP TABLE foo;"), false);
  });

  it("returns false for ALLOW_DROP without reason", () => {
    assert.equal(
      hasAllowDropEscapeHatch("-- ALLOW_DROP:\nDROP TABLE x;"),
      false,
    );
  });

  it("returns false for ALLOW_DROP in non-comment context", () => {
    assert.equal(
      hasAllowDropEscapeHatch("SELECT 'ALLOW_DROP: reason';"),
      false,
    );
  });
});

// ── hasNoRollbackEscapeHatch ────────────────────────────────────────────────

describe("hasNoRollbackEscapeHatch", () => {
  it("returns true when NO_ROLLBACK comment with a reason is present", () => {
    const content =
      "-- NO_ROLLBACK: irreversible backfill of `users.created_at` (due: 2026-06-01)\n";
    assert.equal(hasNoRollbackEscapeHatch(content), true);
  });

  it("returns false when there is no NO_ROLLBACK comment", () => {
    assert.equal(hasNoRollbackEscapeHatch("DELETE FROM foo;"), false);
    assert.equal(hasNoRollbackEscapeHatch(""), false);
  });

  it("returns false for NO_ROLLBACK without a reason after the colon", () => {
    assert.equal(hasNoRollbackEscapeHatch("-- NO_ROLLBACK:\n"), false);
    assert.equal(hasNoRollbackEscapeHatch("-- NO_ROLLBACK: \n"), false);
  });

  it("does not match NO_ROLLBACK inside a SQL string literal", () => {
    assert.equal(
      hasNoRollbackEscapeHatch("SELECT 'NO_ROLLBACK: not real';"),
      false,
    );
  });
});

// ── isEmptyDownMigration ────────────────────────────────────────────────────

describe("isEmptyDownMigration", () => {
  it("returns true for the bare plop placeholder", () => {
    const content =
      "-- Down migration: 999_demo\n\n-- TODO: write your DOWN (rollback) migration here\n";
    assert.equal(isEmptyDownMigration(content), true);
  });

  it("returns true for an entirely empty file", () => {
    assert.equal(isEmptyDownMigration(""), true);
    assert.equal(isEmptyDownMigration("\n\n  \n"), true);
  });

  it("returns true for a file with only SQL comments", () => {
    const content = "-- nothing to roll back here\n-- this is fine\n";
    assert.equal(isEmptyDownMigration(content), true);
  });

  it("returns false when at least one executable SQL statement is present", () => {
    const placeholder = "-- TODO: write your DOWN (rollback) migration here\n";
    assert.equal(
      isEmptyDownMigration(`${placeholder}\nDROP TABLE foo;\n`),
      false,
    );
    assert.equal(
      isEmptyDownMigration("ALTER TABLE foo DROP COLUMN bar;"),
      false,
    );
  });

  it("treats the placeholder line as 'still empty' even mixed with comments", () => {
    // Common pattern: contributor adds a comment but forgets the actual SQL.
    const content =
      "-- Down migration: 999_demo\n-- TODO: write your DOWN (rollback) migration here\n-- See up.sql\n";
    assert.equal(isEmptyDownMigration(content), true);
  });
});

// ── checkSequentialNumbers ───────────────────────────────────────────────────

describe("checkSequentialNumbers", () => {
  it("passes for sequential files", () => {
    const files = ["001_init.sql", "002_foo.sql", "003_bar.sql"];
    const { gaps, duplicates } = checkSequentialNumbers(files);
    assert.deepEqual(gaps, []);
    assert.deepEqual(duplicates, []);
  });

  it("detects gaps", () => {
    const files = ["001_init.sql", "003_bar.sql"];
    const { gaps } = checkSequentialNumbers(files);
    assert.deepEqual(gaps, [2]);
  });

  it("detects multiple gaps", () => {
    const files = ["001_init.sql", "005_bar.sql"];
    const { gaps } = checkSequentialNumbers(files);
    assert.deepEqual(gaps, [2, 3, 4]);
  });

  it("detects duplicates", () => {
    const files = ["001_init.sql", "001_other.sql", "002_bar.sql"];
    const { duplicates } = checkSequentialNumbers(files);
    assert.deepEqual(duplicates, [1]);
  });

  it("ignores .down.sql files in numbering", () => {
    const files = [
      "001_init.sql",
      "001_init.down.sql",
      "002_bar.sql",
      "002_bar.down.sql",
    ];
    const { gaps, duplicates } = checkSequentialNumbers(files);
    assert.deepEqual(gaps, []);
    assert.deepEqual(duplicates, []);
  });

  it("ignores non-migration files", () => {
    const files = ["README.md", "001_init.sql", "002_bar.sql"];
    const { gaps, duplicates, numbers } = checkSequentialNumbers(files);
    assert.deepEqual(numbers, [1, 2]);
    assert.deepEqual(gaps, []);
    assert.deepEqual(duplicates, []);
  });

  it("handles empty list", () => {
    const { gaps, duplicates, numbers } = checkSequentialNumbers([]);
    assert.deepEqual(numbers, []);
    assert.deepEqual(gaps, []);
    assert.deepEqual(duplicates, []);
  });
});

// ── run() integration tests (with temp dirs) ────────────────────────────────

describe("run() — integration", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "migration-lint-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("happy path — clean migrations pass", () => {
    writeFileSync(join(tmpDir, "001_init.sql"), "CREATE TABLE foo (id INT);\n");
    writeFileSync(
      join(tmpDir, "002_add_bar.sql"),
      "ALTER TABLE foo ADD COLUMN bar TEXT;\n",
    );

    const { ok, errors } = run({
      migrationsDir: tmpDir,
      changedFiles: [join(tmpDir, "002_add_bar.sql")],
    });
    assert.equal(ok, true);
    assert.equal(errors.length, 0);
  });

  it("fails when DROP TABLE found without escape-hatch", () => {
    writeFileSync(join(tmpDir, "001_init.sql"), "CREATE TABLE foo (id INT);\n");
    writeFileSync(join(tmpDir, "002_drop_foo.sql"), "DROP TABLE foo;\n");

    const { ok, errors } = run({
      migrationsDir: tmpDir,
      changedFiles: [join(tmpDir, "002_drop_foo.sql")],
    });
    assert.equal(ok, false);
    assert.ok(errors.some((e) => e.includes("DROP TABLE")));
    assert.ok(errors.some((e) => e.includes("AGENTS.md rule #4")));
  });

  it("fails when DROP COLUMN found without escape-hatch", () => {
    writeFileSync(
      join(tmpDir, "001_init.sql"),
      "CREATE TABLE foo (id INT, bar TEXT);\n",
    );
    writeFileSync(
      join(tmpDir, "002_drop_col.sql"),
      "ALTER TABLE foo DROP COLUMN bar;\n",
    );

    const { ok, errors } = run({
      migrationsDir: tmpDir,
      changedFiles: [join(tmpDir, "002_drop_col.sql")],
    });
    assert.equal(ok, false);
    assert.ok(errors.some((e) => e.includes("DROP COLUMN")));
  });

  it("passes when DROP has ALLOW_DROP escape-hatch", () => {
    writeFileSync(join(tmpDir, "001_init.sql"), "CREATE TABLE foo (id INT);\n");
    writeFileSync(
      join(tmpDir, "002_drop_foo.sql"),
      "-- ALLOW_DROP: column unused since PR #500 (due: 2026-06-01)\nDROP TABLE foo;\n",
    );

    const { ok } = run({
      migrationsDir: tmpDir,
      changedFiles: [join(tmpDir, "002_drop_foo.sql")],
    });
    assert.equal(ok, true);
  });

  it("allows DROP in .down.sql files", () => {
    writeFileSync(join(tmpDir, "001_init.sql"), "CREATE TABLE foo (id INT);\n");
    writeFileSync(join(tmpDir, "001_init.down.sql"), "DROP TABLE foo;\n");

    const { ok } = run({
      migrationsDir: tmpDir,
      changedFiles: [join(tmpDir, "001_init.down.sql")],
    });
    assert.equal(ok, true);
  });

  it("fails when a new .down.sql still contains the plop placeholder", () => {
    // The plop generator emits `-- TODO: write your DOWN …` and the
    // contributor is expected to replace it with real rollback SQL.
    // Leaving the placeholder in must trip the lint.
    writeFileSync(join(tmpDir, "001_init.sql"), "CREATE TABLE foo (id INT);\n");
    writeFileSync(
      join(tmpDir, "001_init.down.sql"),
      "-- Down migration: 001_init\n\n-- TODO: write your DOWN (rollback) migration here\n",
    );

    const { ok, errors } = run({
      migrationsDir: tmpDir,
      changedFiles: [join(tmpDir, "001_init.down.sql")],
    });
    assert.equal(ok, false);
    assert.ok(
      errors.some((e) => e.includes("rollback body is empty")),
      `expected empty-rollback error, got: ${errors.join(" | ")}`,
    );
    assert.ok(
      errors.some((e) => e.includes("NO_ROLLBACK")),
      "error must mention the NO_ROLLBACK escape hatch",
    );
  });

  it("fails when a new .down.sql is entirely empty", () => {
    writeFileSync(join(tmpDir, "002_init.sql"), "CREATE TABLE foo (id INT);\n");
    writeFileSync(join(tmpDir, "002_init.down.sql"), "");

    const { ok, errors } = run({
      migrationsDir: tmpDir,
      changedFiles: [join(tmpDir, "002_init.down.sql")],
    });
    assert.equal(ok, false);
    assert.ok(errors.some((e) => e.includes("rollback body is empty")));
  });

  it("passes when an empty .down.sql carries a NO_ROLLBACK escape hatch", () => {
    writeFileSync(join(tmpDir, "003_init.sql"), "CREATE TABLE foo (id INT);\n");
    writeFileSync(
      join(tmpDir, "003_init.down.sql"),
      "-- NO_ROLLBACK: legacy backfill cannot be undone (due: 2026-06-01)\n",
    );

    const { ok, errors } = run({
      migrationsDir: tmpDir,
      changedFiles: [join(tmpDir, "003_init.down.sql")],
    });
    assert.equal(ok, true, `unexpected failures: ${errors.join(" | ")}`);
  });

  it("passes when a new .down.sql has real rollback SQL", () => {
    writeFileSync(join(tmpDir, "004_init.sql"), "CREATE TABLE foo (id INT);\n");
    writeFileSync(join(tmpDir, "004_init.down.sql"), "DROP TABLE foo;\n");

    const { ok, errors } = run({
      migrationsDir: tmpDir,
      changedFiles: [join(tmpDir, "004_init.down.sql")],
    });
    assert.equal(ok, true, `unexpected failures: ${errors.join(" | ")}`);
  });

  it("does NOT flag a pre-existing empty .down.sql when only the up file changed", () => {
    // The empty-down check only runs against `changedFiles`. Pre-existing
    // empty `.down.sql` files in the tree must not block unrelated PRs;
    // the lint is opt-in via the touched-file gate.
    writeFileSync(join(tmpDir, "005_init.sql"), "CREATE TABLE foo (id INT);\n");
    writeFileSync(
      join(tmpDir, "005_init.down.sql"),
      "-- TODO: write your DOWN (rollback) migration here\n",
    );

    const { ok } = run({
      migrationsDir: tmpDir,
      changedFiles: [join(tmpDir, "005_init.sql")],
    });
    assert.equal(ok, true);
  });

  it("ignores DROP inside SQL comments", () => {
    writeFileSync(join(tmpDir, "001_init.sql"), "CREATE TABLE foo (id INT);\n");
    writeFileSync(
      join(tmpDir, "002_note.sql"),
      "-- Note: we will DROP TABLE foo later in a separate migration\nSELECT 1;\n",
    );

    const { ok } = run({
      migrationsDir: tmpDir,
      changedFiles: [join(tmpDir, "002_note.sql")],
    });
    assert.equal(ok, true);
  });

  it("fails on gaps in migration numbering", () => {
    writeFileSync(join(tmpDir, "001_init.sql"), "SELECT 1;\n");
    writeFileSync(join(tmpDir, "003_skip.sql"), "SELECT 1;\n");

    const { ok, errors } = run({
      migrationsDir: tmpDir,
      changedFiles: [],
    });
    assert.equal(ok, false);
    assert.ok(errors.some((e) => e.includes("gaps")));
  });

  it("fails on duplicate migration numbers", () => {
    writeFileSync(join(tmpDir, "001_init.sql"), "SELECT 1;\n");
    writeFileSync(join(tmpDir, "001_other.sql"), "SELECT 1;\n");
    writeFileSync(join(tmpDir, "002_bar.sql"), "SELECT 1;\n");

    const { ok, errors } = run({
      migrationsDir: tmpDir,
      changedFiles: [],
    });
    assert.equal(ok, false);
    assert.ok(errors.some((e) => e.includes("Duplicate")));
  });
});

// ── findCrossBranchCollisions ────────────────────────────────────────────────

describe("findCrossBranchCollisions", () => {
  it("returns empty when PR introduces a number above main's max", () => {
    const main = ["001_a.sql", "002_b.sql", "003_c.sql"];
    const prNew = ["004_d.sql"];
    assert.deepEqual(findCrossBranchCollisions(main, prNew), []);
  });

  it("detects a single collision (PR #1652 type-incident)", () => {
    // PR branched off when max(main) = 034. PR added 035_foo.sql.
    // Meanwhile main merged its own 035_bar.sql. PR's local lint
    // sees only its 035_foo.sql — no duplicate. This function is
    // what catches the cross-branch case.
    const main = ["034_x.sql", "035_main_branch.sql"];
    const prNew = ["035_pr_branch.sql"];
    const collisions = findCrossBranchCollisions(main, prNew);
    assert.equal(collisions.length, 1);
    assert.equal(collisions[0].number, 35);
    assert.equal(collisions[0].filename, "035_pr_branch.sql");
  });

  it("detects multiple collisions when PR adds several colliding numbers", () => {
    const main = ["010_a.sql", "011_b.sql"];
    const prNew = ["010_x.sql", "011_y.sql", "012_new.sql"];
    const collisions = findCrossBranchCollisions(main, prNew);
    assert.equal(collisions.length, 2);
    assert.deepEqual(
      collisions.map((c) => c.number),
      [10, 11],
    );
  });

  it("does not flag .down.sql companions on either side", () => {
    const main = ["010_a.sql", "010_a.down.sql"];
    const prNew = ["010_a.down.sql", "011_new.sql"];
    // PR's .down.sql for 010 is fine (it's modifying main's existing
    // companion, not adding a new number); 011 is new and clean.
    assert.deepEqual(findCrossBranchCollisions(main, prNew), []);
  });

  it("ignores non-migration filenames (README, scripts, etc.)", () => {
    const main = ["README.md", "001_init.sql"];
    const prNew = ["001_init.sql", "notes.md", "scripts/x.sh"];
    const collisions = findCrossBranchCollisions(main, prNew);
    // 001_init.sql is the same file (not really a "new" addition in
    // a real scenario), but filterNewMigrationFiles is the gate that
    // prevents this mis-input. Here we only verify that non-NNN_*.sql
    // entries are silently ignored.
    assert.equal(collisions.length, 1);
    assert.equal(collisions[0].number, 1);
  });

  it("returns empty when main is empty (first migration ever)", () => {
    assert.deepEqual(findCrossBranchCollisions([], ["001_first.sql"]), []);
  });
});

// ── filterNewMigrationFiles ──────────────────────────────────────────────────

describe("filterNewMigrationFiles", () => {
  it("keeps NNN_*.sql up files and drops .down.sql", () => {
    const result = filterNewMigrationFiles([
      "apps/server/src/migrations/040_foo.sql",
      "apps/server/src/migrations/040_foo.down.sql",
      "apps/server/src/migrations/041_bar.sql",
    ]);
    assert.deepEqual(result, [
      "apps/server/src/migrations/040_foo.sql",
      "apps/server/src/migrations/041_bar.sql",
    ]);
  });

  it("drops non-migration files (README, scripts, tests)", () => {
    const result = filterNewMigrationFiles([
      "apps/server/src/migrations/README.md",
      "apps/server/src/migrations/__tests__/foo.test.ts",
      "apps/server/src/migrations/040_foo.sql",
    ]);
    assert.deepEqual(result, ["apps/server/src/migrations/040_foo.sql"]);
  });

  it("returns empty for an empty input", () => {
    assert.deepEqual(filterNewMigrationFiles([]), []);
  });
});

// ── run() with cross-branch collision ────────────────────────────────────────

describe("run() — cross-branch collision", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "migration-lint-xbranch-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("fails when PR adds a number that already exists on main", () => {
    // Local tree (PR view): only 001_init and 002_pr_collide.
    writeFileSync(join(tmpDir, "001_init.sql"), "SELECT 1;\n");
    writeFileSync(join(tmpDir, "002_pr_collide.sql"), "SELECT 1;\n");

    // Simulate `main` having 001_init AND 002_main_winner.
    const mainFiles = ["001_init.sql", "002_main_winner.sql"];

    const { ok, errors } = run({
      migrationsDir: tmpDir,
      changedFiles: [join(tmpDir, "002_pr_collide.sql")],
      newFiles: [join(tmpDir, "002_pr_collide.sql")],
      mainFiles,
    });

    assert.equal(ok, false);
    assert.ok(
      errors.some((e) => e.includes("Cross-branch migration number collision")),
      `expected cross-branch error, got: ${errors.join(" | ")}`,
    );
    assert.ok(
      errors.some((e) => e.includes("002_pr_collide.sql")),
      "error must name the offending file",
    );
    assert.ok(
      errors.some((e) => e.includes("rebase")),
      "error must include the rebase guidance",
    );
  });

  it("passes when PR's new migration is strictly above main's max", () => {
    writeFileSync(join(tmpDir, "001_a.sql"), "SELECT 1;\n");
    writeFileSync(join(tmpDir, "002_b.sql"), "SELECT 1;\n");
    writeFileSync(join(tmpDir, "003_new.sql"), "SELECT 1;\n");

    const mainFiles = ["001_a.sql", "002_b.sql"];

    const { ok, errors } = run({
      migrationsDir: tmpDir,
      changedFiles: [join(tmpDir, "003_new.sql")],
      newFiles: [join(tmpDir, "003_new.sql")],
      mainFiles,
    });

    assert.equal(ok, true, JSON.stringify(errors));
  });

  it("skips cross-branch check when mainFiles is empty (no remote)", () => {
    // Simulates local dev without `git fetch origin`. The local-tree
    // checks (gaps, duplicates) still run.
    writeFileSync(join(tmpDir, "001_a.sql"), "SELECT 1;\n");
    writeFileSync(join(tmpDir, "002_b.sql"), "SELECT 1;\n");

    const { ok } = run({
      migrationsDir: tmpDir,
      changedFiles: [join(tmpDir, "002_b.sql")],
      newFiles: [join(tmpDir, "002_b.sql")],
      mainFiles: [],
    });

    assert.equal(ok, true);
  });

  it("does not flag a modified (non-new) migration file", () => {
    // PR modifies an existing migration on main — same number, same name.
    // This is rare but happens for typo fixes pre-deploy. It must NOT be
    // a collision because the file is the same one, not a duplicate number.
    writeFileSync(join(tmpDir, "001_a.sql"), "SELECT 1;\n");
    writeFileSync(join(tmpDir, "002_existing.sql"), "SELECT 2;\n");

    const mainFiles = ["001_a.sql", "002_existing.sql"];

    const { ok } = run({
      migrationsDir: tmpDir,
      // changedFiles includes M (modified) entries; newFiles does NOT.
      changedFiles: [join(tmpDir, "002_existing.sql")],
      newFiles: [], // empty → diff-filter=A returned nothing
      mainFiles,
    });

    assert.equal(ok, true);
  });
});
