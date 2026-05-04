#!/usr/bin/env node
// scripts/lint-migrations.mjs
//
// CI lint: enforces AGENTS.md rule #4 —
//   • sequential migration numbering (no gaps, no duplicates)
//   • two-phase DROP (no DROP COLUMN / DROP TABLE without escape-hatch)
//
// Usage:
//   BASE_REF=main node scripts/lint-migrations.mjs
//   node scripts/lint-migrations.mjs          # defaults BASE_REF to "main"
//
// The script exits 1 when violations are found.

import { readFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = "apps/server/src/migrations";
const MIGRATION_FILE_RE = /^(\d{3})_.+\.sql$/;
const DOWN_FILE_RE = /\.down\.sql$/;
const DROP_RE = /\bDROP\s+(COLUMN|TABLE)\b/i;
const ALLOW_DROP_RE = /^--[ \t]*ALLOW_DROP:[ \t]*\S.*/m;

// ── Pure helpers (exported for tests) ────────────────────────────────────────

/** True when the trimmed line is a SQL single-line comment (`-- …`). */
export function isCommentLine(line) {
  return line.trimStart().startsWith("--");
}

/**
 * Returns `{ lineNumber, text }[]` for every non-comment line in `content`
 * that contains `DROP COLUMN` or `DROP TABLE` (case-insensitive).
 */
export function findDropLines(content) {
  return content
    .split("\n")
    .map((text, i) => ({ lineNumber: i + 1, text }))
    .filter(({ text }) => !isCommentLine(text) && DROP_RE.test(text));
}

/**
 * Returns `true` when the file content contains at least one
 * `-- ALLOW_DROP: <reason>` comment (the escape-hatch).
 */
export function hasAllowDropEscapeHatch(content) {
  return ALLOW_DROP_RE.test(content);
}

/**
 * Given a list of migration basenames on `main` and a list of new
 * migration basenames in the PR, returns the set of numbers that
 * collide (i.e. exist on both sides). `.down.sql` companions are
 * paired with their main file and never count as collisions.
 *
 * This catches the cross-branch failure mode that the local-tree
 * `checkSequentialNumbers` cannot see: PR #1652 type-incident, where
 * two PRs branched off when `max(main) = 034` and both proposed `035`.
 * The linter on each PR's own commit saw a clean local tree (its 035
 * existed; main's 035 was added in parallel and merged first), so the
 * second PR's local lint passed even though it would collide on merge.
 */
export function findCrossBranchCollisions(mainFilenames, prNewFilenames) {
  const numberOf = (name) => {
    const m = name.match(MIGRATION_FILE_RE);
    return m ? Number(m[1]) : null;
  };
  const mainNumbers = new Set(
    mainFilenames
      .filter((f) => !DOWN_FILE_RE.test(f))
      .map((f) => numberOf(basename(f)))
      .filter((n) => n !== null),
  );
  const collisions = [];
  for (const f of prNewFilenames) {
    if (DOWN_FILE_RE.test(basename(f))) continue;
    const n = numberOf(basename(f));
    if (n !== null && mainNumbers.has(n)) {
      collisions.push({ filename: basename(f), number: n });
    }
  }
  return collisions;
}

/**
 * Given an array of migration filenames (basenames), returns
 * `{ numbers, gaps, duplicates }` where:
 * - `numbers` — sorted array of migration prefix numbers
 * - `gaps`    — missing numbers in the sequence
 * - `duplicates` — numbers that appear more than once
 *
 * `.down.sql` files are excluded from the count.
 */
export function checkSequentialNumbers(filenames) {
  const numbers = filenames
    .filter((f) => !DOWN_FILE_RE.test(f))
    .map((f) => {
      const m = f.match(MIGRATION_FILE_RE);
      return m ? Number(m[1]) : null;
    })
    .filter((n) => n !== null)
    .sort((a, b) => a - b);

  const seen = new Set();
  const duplicates = [];
  for (const n of numbers) {
    if (seen.has(n)) {
      if (!duplicates.includes(n)) duplicates.push(n);
    }
    seen.add(n);
  }

  const gaps = [];
  if (numbers.length > 0) {
    for (let i = numbers[0]; i <= numbers[numbers.length - 1]; i++) {
      if (!seen.has(i)) gaps.push(i);
    }
  }

  return {
    numbers: [...new Set(numbers)].sort((a, b) => a - b),
    gaps,
    duplicates,
  };
}

// ── CLI runner ───────────────────────────────────────────────────────────────

/**
 * List migration filenames present on `origin/<baseRef>` for the
 * `migrationsDir` path. Returns an empty array when the ref is not
 * reachable (e.g. local dev without `git fetch origin`), in which
 * case the cross-branch collision check is skipped — the local-tree
 * checks still catch any in-PR duplicates.
 */
export function listMigrationsOnRef(migrationsDir, baseRef) {
  try {
    const out = execSync(
      `git ls-tree -r --name-only origin/${baseRef} -- "${migrationsDir}"`,
      { encoding: "utf8" },
    ).trim();
    if (!out) return [];
    return out.split("\n").map((p) => basename(p));
  } catch {
    return [];
  }
}

/**
 * Given a list of files changed in the PR (from `git diff --diff-filter=A`),
 * keep only the migration files (basenames look like `NNN_*.sql`) and
 * exclude `.down.sql` companions — only the "up" file owns the number.
 */
export function filterNewMigrationFiles(changedFiles) {
  return changedFiles
    .filter((f) => MIGRATION_FILE_RE.test(basename(f)))
    .filter((f) => !DOWN_FILE_RE.test(basename(f)));
}

export function run({
  migrationsDir = MIGRATIONS_DIR,
  changedFiles = null,
  newFiles = null,
  mainFiles = null,
} = {}) {
  const baseRef = process.env.BASE_REF || "main";
  const errors = [];

  // 1. Determine which migration files are new/changed in this PR
  if (changedFiles === null) {
    try {
      const diff = execSync(
        `git diff --name-only --diff-filter=ACM origin/${baseRef} -- "${migrationsDir}"`,
        { encoding: "utf8" },
      ).trim();
      changedFiles = diff ? diff.split("\n") : [];
    } catch {
      console.warn(
        `⚠ Could not diff against origin/${baseRef}; checking all migration files.`,
      );
      changedFiles = readdirSync(migrationsDir)
        .filter((f) => MIGRATION_FILE_RE.test(f))
        .map((f) => join(migrationsDir, f));
    }
  }

  // 1a. Determine which migration files are NEW (vs M = modified) — only
  //     newly-added files can collide with a number that already exists on
  //     `main`. Modified files share the same number on both sides, by
  //     definition, and are not collisions.
  if (newFiles === null) {
    try {
      const diff = execSync(
        `git diff --name-only --diff-filter=A origin/${baseRef} -- "${migrationsDir}"`,
        { encoding: "utf8" },
      ).trim();
      newFiles = diff ? diff.split("\n") : [];
    } catch {
      newFiles = [];
    }
  }

  // 1b. Read main's migration file list (basenames). Empty when origin/main
  //     is not reachable in this run — the local checks still catch in-PR
  //     duplicates, so a missing remote degrades the linter to its old
  //     behaviour rather than failing it.
  if (mainFiles === null) {
    mainFiles = listMigrationsOnRef(migrationsDir, baseRef);
  }

  // 2. Check DROP statements in new/changed files (skip .down.sql)
  for (const filePath of changedFiles) {
    const name = basename(filePath);

    if (DOWN_FILE_RE.test(name)) continue;

    let content;
    try {
      content = readFileSync(filePath, "utf8");
    } catch {
      // File might have been deleted in diff — skip
      continue;
    }

    const dropLines = findDropLines(content);
    if (dropLines.length > 0 && !hasAllowDropEscapeHatch(content)) {
      for (const { lineNumber, text } of dropLines) {
        errors.push(
          [
            `❌ ${filePath}:${lineNumber}: "${text.trim()}"`,
            `   AGENTS.md rule #4 requires two-phase DROP:`,
            `   1. First PR: deploy code that stops using the column/table.`,
            `   2. Second PR: DROP in a new migration (only after phase 1 is live).`,
            `   Escape hatch: add a comment to the file:`,
            `     -- ALLOW_DROP: <reason> (due: YYYY-MM-DD)`,
            `   Ref: https://github.com/Skords-01/Sergeant/blob/main/AGENTS.md#4-sql-migrations-sequential-no-gaps-two-phase-for-drop`,
          ].join("\n"),
        );
      }
    }
  }

  // 2a. Cross-branch collision check: catch numbers that exist on `main`
  //     and are being added by this PR. The local-tree numbering check below
  //     only sees the PR's own commit; this one compares against `main` to
  //     catch parallel-PR collisions before merge (PR #1652 type-incident).
  if (mainFiles.length > 0) {
    const newMigrationFiles = filterNewMigrationFiles(newFiles);
    const collisions = findCrossBranchCollisions(mainFiles, newMigrationFiles);
    if (collisions.length > 0) {
      const list = collisions
        .map(
          (c) =>
            `     • ${c.filename} (number ${String(c.number).padStart(3, "0")})`,
        )
        .join("\n");
      errors.push(
        [
          `❌ Cross-branch migration number collision detected against origin/${baseRef}:`,
          list,
          ``,
          `   These migration numbers already exist on \`${baseRef}\`. Another PR`,
          `   merged a migration with the same number while your branch was open.`,
          ``,
          `   Fix: rebase onto \`${baseRef}\` and renumber your migration to`,
          `   max(${baseRef}) + 1, then re-push. The two-phase DROP rule still`,
          `   applies to the renumbered file.`,
          ``,
          `   Ref: docs/initiatives/0011-foundation-adoption-and-process-discipline.md`,
          `        (Phase 1 PR 1.2 — closes PR #1652 type-incident)`,
        ].join("\n"),
      );
    }
  }

  // 3. Check sequential numbering across ALL migration files
  const allFiles = readdirSync(migrationsDir);
  const { gaps, duplicates } = checkSequentialNumbers(allFiles);

  if (gaps.length > 0) {
    const padded = gaps.map((n) => String(n).padStart(3, "0")).join(", ");
    errors.push(
      `❌ Migration numbering has gaps: ${padded}.\n` +
        `   AGENTS.md rule #4: sequential, no gaps.`,
    );
  }

  if (duplicates.length > 0) {
    const padded = duplicates.map((n) => String(n).padStart(3, "0")).join(", ");
    errors.push(
      `❌ Duplicate migration numbers: ${padded}.\n` +
        `   AGENTS.md rule #4: no duplicates.`,
    );
  }

  // 4. Report
  if (errors.length > 0) {
    console.error("\n🚫 Migration lint failed:\n");
    for (const e of errors) console.error(e + "\n");
    return { ok: false, errors };
  }

  console.log("✅ Migration lint passed.");
  return { ok: true, errors: [] };
}

// ── Entry point ──────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  const { ok } = run();
  if (!ok) process.exit(1);
}
