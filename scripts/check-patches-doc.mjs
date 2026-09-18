#!/usr/bin/env node
// scripts/check-patches-doc.mjs
//
// CI guard for `patches/README.md` (closes PR-20 / M4).
//
// Why this guard exists:
//   `patches/` is silent tech debt. Nothing reminds the team that an
//   upstream fix has shipped, so patches accumulate and rebase pain
//   compounds during framework upgrades (e.g. Expo SDK bumps). This
//   script forces every `patches/*.patch` to carry a documented
//   "Drop when" condition + Owner alongside it.
//
// Three checks, each fatal:
//   1. Every `patches/*.patch` file has a row in `patches/README.md`'s
//      `LINT:patches:table` block, and every row's mandatory cells
//      (Patch, Reason, Upstream, Drop when, Owner) are non-empty.
//   2. Every patch file is referenced from
//      `package.json -> pnpm.patchedDependencies`, and every key in
//      `pnpm.patchedDependencies` has a matching patch file on disk
//      (no stale orphans).
//   3. Every row in the table refers to an existing patch file (the
//      table cannot describe ghosts).
//
// Usage:
//   pnpm lint:patches
//   node scripts/check-patches-doc.mjs
//
// Exit code: 0 on success, 1 on any violation. The runner is purely
// path-based (no `pnpm install` required) so it stays cheap on PR-CI.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const TABLE_START = "<!-- LINT:patches:table:start -->";
const TABLE_END = "<!-- LINT:patches:table:end -->";
const REQUIRED_COLUMNS = ["Patch", "Reason", "Upstream", "Drop when", "Owner"];

// ── Pure helpers (exported for tests) ────────────────────────────────────────

/**
 * List `*.patch` filenames in the given directory. Returns sorted
 * basenames (no path prefix). Throws on missing directory.
 */
export function listPatchFiles(patchesDir, fs = { readdirSync }) {
  const entries = fs.readdirSync(patchesDir);
  return entries.filter((f) => f.endsWith(".patch")).sort();
}

/**
 * Read a JSON file and return its parsed contents. Returns `null` on
 * ENOENT and rethrows other errors.
 */
export function loadJSON(filePath, fs = { readFileSync }) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    if (e?.code === "ENOENT") return null;
    throw e;
  }
}

/**
 * Extract the keys of `pnpm.patchedDependencies` from a parsed
 * `package.json` object. Returns a sorted string array. Falls back to
 * an empty array when the field is missing.
 */
export function extractPatchedDeps(pkgJson) {
  const map = pkgJson?.pnpm?.patchedDependencies ?? {};
  return Object.keys(map).sort();
}

/**
 * Convert a `patchedDependencies` key (e.g. `@expo/cli@0.22.28`) into
 * its canonical patch-file basename (e.g. `@expo__cli@0.22.28.patch`)
 * — pnpm replaces `/` with `__` when materialising a patch on disk.
 *
 * The reverse direction is NOT 1:1 (multiple keys can map to the same
 * filename only on case-folded filesystems, which we don't support),
 * so the test set treats this as authoritative.
 */
export function patchKeyToFilename(key) {
  return `${key.replace(/\//g, "__")}.patch`;
}

/**
 * Locate the table block inside README content and return its raw
 * inner markdown (lines between the markers). Returns `null` when the
 * markers are missing or out of order.
 */
export function extractTableBlock(readme) {
  const startIdx = readme.indexOf(TABLE_START);
  const endIdx = readme.indexOf(TABLE_END);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return null;
  return readme.slice(startIdx + TABLE_START.length, endIdx).trim();
}

/**
 * Parse a GitHub-flavoured markdown table from `block` (the content
 * between the LINT markers, NOT the whole README). Returns an array
 * of objects keyed by column header. Cells are trimmed; leading /
 * trailing pipe characters and the separator row (`| --- |`) are
 * skipped. Returns `null` when no header row is found.
 */
export function parseTable(block) {
  if (!block) return null;
  const lines = block
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l.startsWith("|"));
  if (lines.length < 2) return null;

  const splitRow = (row) =>
    row
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());

  const header = splitRow(lines[0]);
  // Separator row: `| --- | :---: | ---: |` etc.
  const separator = splitRow(lines[1]);
  if (!separator.every((c) => /^:?-{3,}:?$/.test(c))) return null;

  const rows = [];
  for (let i = 2; i < lines.length; i++) {
    const cells = splitRow(lines[i]);
    if (cells.length !== header.length) {
      // Mismatch is significant — surface as a malformed row that
      // downstream validation flags via missing required columns.
      const obj = Object.fromEntries(header.map((h) => [h, ""]));
      obj.__malformed = lines[i];
      rows.push(obj);
      continue;
    }
    rows.push(Object.fromEntries(header.map((h, j) => [h, cells[j]])));
  }
  return { header, rows };
}

/**
 * Strip the inline-code backticks pnpm uses around the patch filename
 * (e.g. `` `@expo__cli@0.22.28.patch` `` → `@expo__cli@0.22.28.patch`).
 * Returns the original string when no wrapping backticks are present.
 */
export function unwrapCode(value) {
  if (!value) return "";
  const m = value.match(/^`(.+)`$/);
  return m ? m[1] : value;
}

/**
 * Run all three guards against pre-loaded inputs (mockable for tests).
 *
 * Returns `{ ok, errors }` where `errors` is a string array. The CLI
 * runner formats / prints them.
 */
export function validate({ patchFiles, patchedDeps, table }) {
  const errors = [];

  if (table === null) {
    errors.push(
      `patches/README.md: missing or malformed LINT:patches:table block ` +
        `(expected ${TABLE_START} … ${TABLE_END}).`,
    );
    return { ok: false, errors };
  }

  // Header coverage.
  for (const col of REQUIRED_COLUMNS) {
    if (!table.header.includes(col)) {
      errors.push(
        `patches/README.md: table is missing required column "${col}". ` +
          `Required columns: ${REQUIRED_COLUMNS.join(", ")}.`,
      );
    }
  }

  // Build patch-row lookup keyed by filename.
  const rowByPatch = new Map();
  for (const row of table.rows) {
    if (row.__malformed) {
      errors.push(
        `patches/README.md: malformed row (column count mismatch): "${row.__malformed}".`,
      );
      continue;
    }
    const patchCell = unwrapCode(row.Patch ?? "");
    if (!patchCell) {
      errors.push(`patches/README.md: row has empty Patch cell.`);
      continue;
    }
    if (rowByPatch.has(patchCell)) {
      errors.push(`patches/README.md: duplicate row for "${patchCell}".`);
    }
    rowByPatch.set(patchCell, row);

    for (const col of REQUIRED_COLUMNS) {
      const cell = (row[col] ?? "").trim();
      if (!cell) {
        errors.push(
          `patches/README.md: row "${patchCell}" has empty "${col}" cell.`,
        );
      }
    }
  }

  // Check 1: every patch file in patches/ has a documented row.
  for (const file of patchFiles) {
    if (!rowByPatch.has(file)) {
      errors.push(
        `patches/README.md: no row found for patch file "${file}". ` +
          `Add a row inside the LINT:patches:table block.`,
      );
    }
  }

  // Check 2: pnpm.patchedDependencies ↔ patches/ filesystem parity.
  const expectedFilenames = new Set(patchedDeps.map(patchKeyToFilename));
  const actualFilenames = new Set(patchFiles);
  for (const expected of expectedFilenames) {
    if (!actualFilenames.has(expected)) {
      errors.push(
        `package.json: pnpm.patchedDependencies references "${expected}" ` +
          `but patches/${expected} does not exist.`,
      );
    }
  }
  for (const actual of actualFilenames) {
    if (!expectedFilenames.has(actual)) {
      errors.push(
        `patches/${actual}: file exists but is not referenced from ` +
          `package.json -> pnpm.patchedDependencies (orphan patch).`,
      );
    }
  }

  // Check 3: every documented row maps to a real patch file.
  for (const documented of rowByPatch.keys()) {
    if (!actualFilenames.has(documented)) {
      errors.push(
        `patches/README.md: row "${documented}" describes a patch file ` +
          `that does not exist on disk.`,
      );
    }
  }

  return { ok: errors.length === 0, errors };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function main() {
  const patchesDir = path.join(REPO_ROOT, "patches");
  const readmePath = path.join(patchesDir, "README.md");
  const pkgPath = path.join(REPO_ROOT, "package.json");

  let patchFiles;
  try {
    patchFiles = listPatchFiles(patchesDir);
  } catch (e) {
    console.error(`[patches] failed to read ${patchesDir}: ${e.message}`);
    process.exit(1);
  }

  const pkgJson = loadJSON(pkgPath);
  if (pkgJson === null) {
    console.error(`[patches] package.json missing at ${pkgPath}.`);
    process.exit(1);
  }
  const patchedDeps = extractPatchedDeps(pkgJson);

  let readme;
  try {
    readme = readFileSync(readmePath, "utf8");
  } catch (e) {
    if (e?.code === "ENOENT") {
      console.error(
        `[patches] patches/README.md is missing. Document each patch in ` +
          `a LINT:patches:table block with columns: ${REQUIRED_COLUMNS.join(", ")}.`,
      );
    } else {
      console.error(`[patches] failed to read README: ${e.message}`);
    }
    process.exit(1);
  }

  const block = extractTableBlock(readme);
  const table = parseTable(block);

  const { ok, errors } = validate({ patchFiles, patchedDeps, table });

  if (!ok) {
    console.error("[patches] freshness check failed:\n");
    for (const err of errors) console.error(`  ❌ ${err}`);
    console.error(
      `\n[patches] re-read patches/README.md, fix the rows, and re-run ` +
        `\`pnpm lint:patches\`.`,
    );
    process.exit(1);
  }

  console.log(
    `[patches] OK: ${patchFiles.length} patch(es) documented and in sync ` +
      `with pnpm.patchedDependencies.`,
  );
}

if (process.argv[1] === __filename) {
  main();
}
