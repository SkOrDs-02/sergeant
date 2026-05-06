#!/usr/bin/env node
// scripts/check-initiative-status-sync.mjs
//
// CI guard for `docs/initiatives/README.md` ↔ `docs/initiatives/[_]?[0-9]{4}-*.md`
// status synchronization.
//
// Validates three invariants:
//   1. Every `NNNN-*.md` (or `_NNNN-*.md` for completed-prefix files) in
//      `docs/initiatives/` is referenced by a row in README.md (active table
//      + recently-completed table + archive stub list). The leading `_`
//      marks `Done` / `Closed` files so `ls` clearly separates active from
//      completed; both forms parse to the same NNNN id.
//   2. Every README row (`| NNNN | ...`) has a matching file (or, in the
//      Archive section, an explicit `archive/...` redirect-stub).
//   3. The status keyword in the README cell matches the canonical
//      `> **Status:** ...` line at the top of the file. Equivalent forms
//      are normalised — `**Done**`, `Done`, `Done (Phase 1 + …)`,
//      `Closed (Phase 6a/...)` all parse to the same canonical word.
//
// Why a separate gate (vs `generate-initiative-followups.mjs`):
//   The follow-ups index is a mechanical aggregation of carry-over
//   bullets. Status drift between README and file headers is a
//   *different* problem — historically caught only by quarterly cleanup
//   (e.g. 0007 stayed `In progress` in README for 1 day after the file
//   went `Done`, [#1951]). This script makes drift visible at PR time.
//
// Usage:
//   pnpm lint:initiative-status-sync
//   node scripts/check-initiative-status-sync.mjs
//
// Exits 1 on any drift / missing entry / unparseable header; 0 otherwise.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ── Constants ───────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");
const INITIATIVES_DIR = resolve(REPO_ROOT, "docs/initiatives");
const README_PATH = join(INITIATIVES_DIR, "README.md");

const RE_INITIATIVE_FILE = /^_?(\d{4})-[a-z0-9-]+\.md$/i;
const RE_TABLE_ROW = /^\|\s*(\d{4})\s*\|/;
const RE_STATUS_LINE = /^>\s*\*\*Status:\*\*\s*(.+?)\s*$/im;
const HEADER_LINE_LIMIT = 30;

// Listed longest-first so `In progress` matches before `In`.
const ALLOWED_STATUSES = [
  "In progress",
  "Withdrawn",
  "Proposed",
  "Archived",
  "Closed",
  "Done",
];

// ── Pure helpers ────────────────────────────────────────────────────────────

/**
 * Pull the canonical status word out of a `> **Status:** <free text>`
 * header line. Returns the matched word from `ALLOWED_STATUSES` or null.
 *
 * Only the first 30 lines of the file are scanned — initiative headers
 * always live at the top, and we don't want body text like "Phase X
 * remains In progress" to leak in.
 */
export function parseStatusFromFile(content) {
  const head = content.split("\n").slice(0, HEADER_LINE_LIMIT).join("\n");
  const m = head.match(RE_STATUS_LINE);
  if (!m) return null;
  const raw = m[1].trim();
  for (const s of ALLOWED_STATUSES) {
    const re = new RegExp(`^${s.replace(/\s+/g, "\\s+")}\\b`, "i");
    if (re.test(raw)) return s;
  }
  return null;
}

/**
 * Pull the leading status word out of a README table cell. The cell may
 * begin with `**Status**`, plain `Status`, or with leading whitespace.
 *
 * Only the part before the first ` — ` (em-dash) or ` (` is examined,
 * to avoid matching status keywords that appear inside the descriptive
 * suffix (e.g. "...still In progress on Phase 6b").
 */
export function parseStatusFromReadmeCell(cell) {
  // Strip leading bold markers and whitespace.
  let head = cell.trim();
  // Cut at em-dash / open-paren — the descriptive tail is irrelevant.
  for (const sep of [" — ", " (", " ("]) {
    const idx = head.indexOf(sep);
    if (idx > 0) head = head.slice(0, idx);
  }
  // Drop bold markers.
  head = head.replace(/\*\*/g, "").trim();
  for (const s of ALLOWED_STATUSES) {
    const re = new RegExp(`^${s.replace(/\s+/g, "\\s+")}\\b`, "i");
    if (re.test(head)) return s;
  }
  return null;
}

/**
 * Find the status cell in a README table row. Each table in this README
 * has the status keyword in the **last** non-empty pipe-delimited cell
 * (active table) or the **last** cell with a known status keyword
 * (recently-completed table — column "Статус").
 *
 * Active table:    `| NNNN | name | priority | owner | eta | STATUS |`
 * Completed table: `| NNNN | name | date     | STATUS | outcome |`
 *
 * Both have the status as a cell beginning with a known keyword; the
 * lookup walks cells right-to-left and picks the first cell whose lead
 * is one of `ALLOWED_STATUSES`. This handles either layout without
 * having to know which table the row came from.
 */
export function pickStatusCell(rowLine) {
  // Strip leading/trailing pipes, split on `|`.
  const trimmed = rowLine.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells = trimmed.split("|").map((c) => c.trim());
  for (let i = cells.length - 1; i >= 0; i--) {
    const cell = cells[i];
    if (!cell) continue;
    const status = parseStatusFromReadmeCell(cell);
    if (status) return status;
  }
  return null;
}

/**
 * Parse README to produce `{ id → status }` for every NNNN row in any
 * table. Archive-section redirect-stubs (lines starting with
 * `[archive/NNNN-...]`) are picked up separately and assigned status
 * `Archived` regardless of cell content.
 */
export function parseStatusesFromReadme(content) {
  const lines = content.split("\n");
  const result = new Map();
  for (const line of lines) {
    const m = line.match(RE_TABLE_ROW);
    if (!m) continue;
    const id = m[1];
    const status = pickStatusCell(line);
    result.set(id, status);
  }
  // Archive redirect-stubs: `[archive/NNNN-slug.md] — archived YYYY-MM-DD`
  // (or `[archive/_NNNN-slug.md]` if the file kept its completed-prefix
  // when moved into the archive).
  const reArchiveStub =
    /^\s*[-*]?\s*\[?archive\/_?(\d{4})-[a-z0-9-]+\.md\]?\s*[—-]\s*archived\b/i;
  for (const line of lines) {
    const m = line.match(reArchiveStub);
    if (m) result.set(m[1], "Archived");
  }
  return result;
}

/** List initiative files (NNNN-*.md) in `docs/initiatives/`. */
export function listInitiativeFiles(dir = INITIATIVES_DIR) {
  return readdirSync(dir)
    .filter((f) => RE_INITIATIVE_FILE.test(f))
    .sort();
}

// ── Runner ──────────────────────────────────────────────────────────────────

/**
 * Programmatic entry point. Returns `{ ok, errors, fileStatuses, readmeStatuses }`.
 * Exposed for unit testing the wiring.
 */
export function run({
  readmePath = README_PATH,
  initiativesDir = INITIATIVES_DIR,
  read = (p) => readFileSync(p, "utf8"),
  list = listInitiativeFiles,
} = {}) {
  const errors = [];
  const fileStatuses = new Map();

  for (const file of list(initiativesDir)) {
    const m = file.match(RE_INITIATIVE_FILE);
    if (!m) continue;
    const id = m[1];
    const content = read(join(initiativesDir, file));
    const status = parseStatusFromFile(content);
    if (!status) {
      errors.push(
        `${file}: no recognised \`> **Status:** …\` line in first ${HEADER_LINE_LIMIT} lines (allowed: ${ALLOWED_STATUSES.join(", ")}).`,
      );
      // Still record presence so we don't double-report as "row without file".
      fileStatuses.set(id, { file, status: null });
      continue;
    }
    fileStatuses.set(id, { file, status });
  }

  const readmeContent = read(readmePath);
  const readmeStatuses = parseStatusesFromReadme(readmeContent);

  // Invariant 1: file without a README row.
  for (const [id, info] of fileStatuses.entries()) {
    if (!readmeStatuses.has(id)) {
      errors.push(
        `${info.file}: no row in docs/initiatives/README.md for #${id}. ` +
          `Add it to "Активні ініціативи" or "Нещодавно завершені".`,
      );
    }
  }
  // Invariant 2: README row without a matching file (and not an archive stub).
  for (const id of readmeStatuses.keys()) {
    const stat = readmeStatuses.get(id);
    if (!fileStatuses.has(id) && stat !== "Archived") {
      errors.push(
        `docs/initiatives/README.md: row for #${id} but no matching ${id}-*.md file in docs/initiatives/.`,
      );
    }
  }
  // Invariant 3: status drift (file vs README).
  for (const [id, info] of fileStatuses.entries()) {
    if (!readmeStatuses.has(id)) continue;
    if (info.status === null) continue; // file-parse error already reported.
    const readmeStatus = readmeStatuses.get(id);
    if (readmeStatus === null) {
      errors.push(
        `docs/initiatives/README.md: row for #${id} (${info.file}) — no recognised status keyword in cell.`,
      );
      continue;
    }
    if (readmeStatus !== info.status) {
      errors.push(
        `docs/initiatives/README.md: status drift for #${id} — README says "${readmeStatus}", ${info.file} header says "${info.status}".`,
      );
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    fileStatuses,
    readmeStatuses,
  };
}

function formatReport(result) {
  const lines = [];
  if (result.ok) {
    lines.push(
      `Initiative status sync OK — ${result.fileStatuses.size} file(s), ` +
        `${result.readmeStatuses.size} README row(s).`,
    );
    return lines.join("\n");
  }
  lines.push(
    `Initiative status sync FAILED — ${result.errors.length} issue(s):`,
  );
  for (const e of result.errors) lines.push(`  ❌ ${e}`);
  lines.push("");
  lines.push(
    "Fix by either:",
    "  • Updating the offending row in docs/initiatives/README.md to match the file header, or",
    "  • Updating the file header to match the README row, or",
    "  • Adding/removing the missing entry on either side.",
  );
  return lines.join("\n");
}

// ── Entry point ─────────────────────────────────────────────────────────────

if (process.argv[1] === __filename) {
  const result = run();
  const report = formatReport(result);
  if (result.ok) {
    console.log(report);
  } else {
    console.error(report);
    process.exit(1);
  }
}
