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
// Placeholder text emitted by `plop migration` — leftovers in checked-in
// `.down.sql` files mean the contributor never wrote the rollback body.
const DOWN_PLACEHOLDER_RE = /TODO:\s*write\s+your\s+DOWN/i;
// Explicit opt-out for migrations that genuinely cannot be rolled back
// (`DROP TABLE` of a deprecated schema, irreversible data backfill, etc.).
// Same shape as `ALLOW_DROP:` — a reason after the colon is mandatory.
const NO_ROLLBACK_RE = /^--[ \t]*NO_ROLLBACK:[ \t]*\S.*/m;

// `-- TWO-PHASE-DROP: introduced YYYY-MM-DD as deprecation; safe to drop after YYYY-MM-DD`
// — структурований header, що проявляє Hard Rule #4 two-phase contract:
// Phase 1 PR deprecates the column/table (deploy date = `introduced`); Phase 2
// PR (this one) drops it after the 14-day soak. Both dates must parse, gap
// must be ≥ MIN_DEPRECATION_DAYS, and `safe to drop after` must already be
// in the past so we don't merge a DROP whose soak window has not elapsed.
const TWO_PHASE_DROP_RE =
  /^--[ \t]*TWO-PHASE-DROP:[ \t]*introduced[ \t]+(\d{4}-\d{2}-\d{2})[ \t]+as[ \t]+deprecation[ \t]*;[ \t]*safe[ \t]+to[ \t]+drop[ \t]+after[ \t]+(\d{4}-\d{2}-\d{2})[ \t]*$/im;
// Loose probe — detects a `TWO-PHASE-DROP:` header even when malformed so we
// can return a more useful error than "header missing".
const TWO_PHASE_DROP_PROBE_RE = /^--[ \t]*TWO-PHASE-DROP:/im;

export const MIN_DEPRECATION_DAYS = 14;

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
 * `-- ALLOW_DROP: <reason>` comment (the legacy escape-hatch).
 *
 * `ALLOW_DROP:` is still accepted for backward-compatibility with migrations
 * authored before the structured `TWO-PHASE-DROP:` header existed (e.g.
 * `046_drop_module_data.sql`, `059_*.down.sql`). New migrations should use
 * `TWO-PHASE-DROP:` so the soak-window dates are machine-verified.
 */
export function hasAllowDropEscapeHatch(content) {
  return ALLOW_DROP_RE.test(content);
}

/**
 * Strict parser for `YYYY-MM-DD` calendar dates: rejects values that
 * `Date.parse` would silently normalize (e.g. `2026-02-30` → 2026-03-02).
 * Returns the UTC midnight timestamp in ms, or `null` on any malformed
 * input. Used by the two-phase-DROP validator so the deprecation timeline
 * survives transcription typos.
 */
function strictParseISODate(s) {
  if (typeof s !== "string") return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  const ms = Date.UTC(year, month - 1, day);
  const d = new Date(ms);
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return ms;
}

/**
 * Days between two `YYYY-MM-DD` strings (UTC-based, ignores timezone). Used
 * to verify the 14-day soak gap between Phase 1 (deprecate) and Phase 2
 * (DROP) of Hard Rule #4's two-phase contract. Callers must have already
 * validated the strings via `strictParseISODate()`.
 */
function dayDiff(fromISO, toISO) {
  const a = strictParseISODate(fromISO);
  const b = strictParseISODate(toISO);
  if (a === null || b === null) return Number.NaN;
  return Math.floor((b - a) / 86_400_000);
}

/**
 * Parses the `-- TWO-PHASE-DROP: introduced YYYY-MM-DD as deprecation; safe
 * to drop after YYYY-MM-DD` header. Returns one of three discriminated
 * shapes:
 *
 * - `{ kind: "absent" }` — no `TWO-PHASE-DROP:` line found at all.
 * - `{ kind: "malformed", reason }` — line starts with `TWO-PHASE-DROP:`
 *   but doesn't match the canonical shape (typo, missing date, etc.).
 * - `{ kind: "valid", introduced, safeAfter }` — both dates parsed, ISO
 *   strings carried forward for downstream validation.
 *
 * The caller still has to run `validateTwoPhaseDropHeader()` on a `valid`
 * shape to gate the soak gap and "safe to drop" boundary.
 */
export function parseTwoPhaseDropHeader(content) {
  const m = content.match(TWO_PHASE_DROP_RE);
  if (m) {
    return { kind: "valid", introduced: m[1], safeAfter: m[2] };
  }
  if (TWO_PHASE_DROP_PROBE_RE.test(content)) {
    return {
      kind: "malformed",
      reason:
        "header present but does not match expected shape " +
        '"-- TWO-PHASE-DROP: introduced YYYY-MM-DD as deprecation; safe to drop after YYYY-MM-DD"',
    };
  }
  return { kind: "absent" };
}

/**
 * Validates a `{ kind: "valid" }` two-phase-DROP header against:
 *
 * - gap between `introduced` and `safeAfter` ≥ `minGapDays` (default 14)
 * - `safeAfter` ≤ `now` (the soak window has actually elapsed; we don't
 *   want to merge a DROP whose canary period is still in the future)
 * - both dates parse as a real calendar date
 *
 * Returns `{ ok: true }` when all checks pass, or `{ ok: false, reason }`
 * with a single human-readable error string when one fails. Multiple
 * failures collapse to the first reason hit — this is a CI lint, not a
 * compiler diagnostic; the contributor will see them one at a time.
 */
export function validateTwoPhaseDropHeader(
  parsed,
  { now = new Date(), minGapDays = MIN_DEPRECATION_DAYS } = {},
) {
  if (parsed.kind !== "valid") {
    return { ok: false, reason: "header is not in a valid shape" };
  }
  // Strict round-trip: `Date.parse` is permissive (treats 2026-02-30 as
  // 2026-03-02), but Hard Rule #4 demands a real calendar date so the
  // deprecation timeline is unambiguous.
  const introducedMs = strictParseISODate(parsed.introduced);
  const safeAfterMs = strictParseISODate(parsed.safeAfter);
  if (introducedMs === null) {
    return {
      ok: false,
      reason: `"introduced ${parsed.introduced}" is not a valid YYYY-MM-DD calendar date`,
    };
  }
  if (safeAfterMs === null) {
    return {
      ok: false,
      reason: `"safe to drop after ${parsed.safeAfter}" is not a valid YYYY-MM-DD calendar date`,
    };
  }
  const gap = dayDiff(parsed.introduced, parsed.safeAfter);
  if (gap < minGapDays) {
    return {
      ok: false,
      reason:
        `soak window between "${parsed.introduced}" and ` +
        `"${parsed.safeAfter}" is ${gap} day(s); ` +
        `Hard Rule #4 requires ≥ ${minGapDays} days`,
    };
  }
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  if (safeAfterMs > nowMs) {
    const today = new Date(nowMs).toISOString().slice(0, 10);
    return {
      ok: false,
      reason:
        `"safe to drop after ${parsed.safeAfter}" is still in the future ` +
        `(today is ${today}); wait for the soak window to elapse before merging`,
    };
  }
  return { ok: true };
}

/**
 * Returns `true` when the file content contains at least one
 * `-- NO_ROLLBACK: <reason>` comment (the escape-hatch). Used by the
 * empty-down check to allow migrations that genuinely cannot be rolled
 * back (irreversible data writes, `DROP TABLE` of obsolete schemas).
 */
export function hasNoRollbackEscapeHatch(content) {
  return NO_ROLLBACK_RE.test(content);
}

/**
 * Returns `true` when a `.down.sql` body has no executable SQL — only
 * blank lines, single-line `--` comments, or the plop-generated
 * `TODO: write your DOWN` placeholder. Empty rollbacks slip past code
 * review because the file is committed; this check is the lint-time
 * safety net behind AGENTS.md rule #4's two-phase DROP guarantee.
 *
 * The matching escape hatch is `-- NO_ROLLBACK: <reason>` — see
 * `hasNoRollbackEscapeHatch()`. The caller is responsible for skipping
 * this check when the hatch is present.
 */
export function isEmptyDownMigration(content) {
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    if (isCommentLine(line)) continue;
    if (DOWN_PLACEHOLDER_RE.test(line)) continue;
    return false;
  }
  return true;
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

  // 2. Check DROP statements in new/changed files (skip .down.sql).
  //    `.down.sql` files get a separate empty-body check below.
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
    if (dropLines.length === 0) continue;

    // Acceptance order: TWO-PHASE-DROP (structured, machine-validated) →
    // ALLOW_DROP (legacy, free-form). The latter is kept only so that
    // pre-existing migrations on `main` (046_drop_module_data,
    // 059_..._down.sql) keep linting; new code should always use the
    // structured form.
    const parsedTwoPhase = parseTwoPhaseDropHeader(content);
    if (parsedTwoPhase.kind === "valid") {
      const { ok, reason } = validateTwoPhaseDropHeader(parsedTwoPhase);
      if (!ok) {
        errors.push(
          [
            `❌ ${filePath}: TWO-PHASE-DROP header validation failed.`,
            `   ${reason}.`,
            `   Hard Rule #4: see docs/runbooks/operations-runbook.md § 8.2.`,
          ].join("\n"),
        );
      }
      continue;
    }
    if (parsedTwoPhase.kind === "malformed") {
      errors.push(
        [
          `❌ ${filePath}: TWO-PHASE-DROP header is malformed.`,
          `   ${parsedTwoPhase.reason}.`,
          `   Expected (single line, single comment):`,
          `     -- TWO-PHASE-DROP: introduced YYYY-MM-DD as deprecation; safe to drop after YYYY-MM-DD`,
          `   Hard Rule #4: see docs/runbooks/operations-runbook.md § 8.2.`,
        ].join("\n"),
      );
      continue;
    }
    if (hasAllowDropEscapeHatch(content)) {
      // Legacy escape hatch — accepted but not validated. No new migration
      // should rely on this; the structured TWO-PHASE-DROP header is
      // preferred and lint-time-checked.
      continue;
    }

    // No header at all — emit the canonical message the task spec calls for.
    errors.push(
      [
        `❌ Migration ${name} contains destructive DROP without two-phase header.`,
        `   Hard Rule #4: see docs/runbooks/operations-runbook.md § 8.2.`,
        ``,
        `   First non-comment DROP line: ${filePath}:${dropLines[0].lineNumber}:`,
        `     ${dropLines[0].text.trim()}`,
        ``,
        `   Add (after the file header comment block):`,
        `     -- TWO-PHASE-DROP: introduced YYYY-MM-DD as deprecation; safe to drop after YYYY-MM-DD`,
        ``,
        `   The two dates must be ≥ ${MIN_DEPRECATION_DAYS} days apart, and`,
        `   "safe to drop after" must already be in the past on merge day.`,
      ].join("\n"),
    );
  }

  // 2b. Empty-rollback check for new/changed `.down.sql` files.
  //     Closes PR-T38 from `docs/testing/2026-05-05-tests-pr-plan.md`
  //     ("migration rollback за замовчуванням") — the plop generator
  //     emits a `-- TODO: write your DOWN` placeholder which contributors
  //     historically leave in place, defeating the two-phase DROP
  //     guarantee. We only check files actually touched by the PR so
  //     pre-existing empty-down sins don't block unrelated work.
  for (const filePath of changedFiles) {
    const name = basename(filePath);

    if (!DOWN_FILE_RE.test(name)) continue;

    let content;
    try {
      content = readFileSync(filePath, "utf8");
    } catch {
      continue;
    }

    if (!isEmptyDownMigration(content)) continue;
    if (hasNoRollbackEscapeHatch(content)) continue;

    errors.push(
      [
        `❌ ${filePath}: rollback body is empty.`,
        `   AGENTS.md rule #4 requires every migration to ship with a`,
        `   working DOWN script so we can revert a deploy without a manual`,
        `   schema surgery. Either:`,
        `   1. Replace the \`-- TODO: write your DOWN\` placeholder with`,
        `      SQL that reverses the matching UP migration, OR`,
        `   2. Add an explicit escape-hatch comment if rollback is truly`,
        `      impossible (irreversible data write, dropping an obsolete`,
        `      table, etc.):`,
        `        -- NO_ROLLBACK: <reason> (due: YYYY-MM-DD)`,
        `   Ref: https://github.com/Skords-01/Sergeant/blob/main/docs/governance/rules/04-sql-migrations-sequential-two-phase.md`,
      ].join("\n"),
    );
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
