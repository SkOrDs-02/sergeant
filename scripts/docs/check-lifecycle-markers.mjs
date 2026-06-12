#!/usr/bin/env node
// scripts/docs/check-lifecycle-markers.mjs
//
// Theme 4 (consolidated audit 2026-05-13) — lifecycle marker coverage gate.
//
// Hard Rule #10: every file/doc declares its status via a `@status` JSDoc tag
// or a `> **Last validated:**` / `> **Status:**` markdown header.
//
// This script scans `apps/web/src/**/*.{ts,tsx}` for files that lack a
// lifecycle marker and reports the gap count. It is intentionally NON-BLOCKING
// (exits 0) while the marker count is high — the `--fail-on-violations`
// flag promotes it to a blocking gate once the burn-down reaches zero.
//
// Marker formats accepted:
//   TS/TSX (JSDoc):
//     /** @status Active */     → single-line
//     * @status Deprecated      → multi-line JSDoc body
//     * Status: Active          → legacy inline comment
//     * Last validated: YYYY-MM-DD
//   Markdown (handled by check-freshness.mjs --check-coverage):
//     > **Last validated:** YYYY-MM-DD ...
//     > **Status:** Active
//
// Usage:
//   node scripts/docs/check-lifecycle-markers.mjs              # report-only
//   node scripts/docs/check-lifecycle-markers.mjs --fail-on-violations  # CI gate
//   node scripts/docs/check-lifecycle-markers.mjs --json       # machine-readable
//
// See docs/90-work/audits/2026-05-13-consolidated-page-audit.md § Theme 4.
// Burn-down target: 2026-Q3. See docs/04-governance/governance/rules/10-lifecycle-markers.md.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "../..");

const FAIL_ON_VIOLATIONS = process.argv.includes("--fail-on-violations");
const JSON_OUTPUT = process.argv.includes("--json");

// Regexes that indicate a lifecycle marker is present.
const MARKER_PATTERNS = [
  // JSDoc @status tag: /** @status Active */ or * @status Deprecated
  /@status\s+\S+/,
  // Legacy inline: * Status: Active  or  // Status: Active
  /\*\s+Status:\s+\S+|\/\/\s+Status:\s+\S+/,
  // Last validated in JSDoc/comment: * Last validated: YYYY-MM-DD
  /Last (?:validated|touched):\s+\d{4}-\d{2}-\d{2}/,
  // Markdown-style inside TS file (rare but valid):
  /\*\*Last (?:validated|touched):\*\*/,
  /\*\*Status:\*\*/,
];

const SCAN_ROOT = join(REPO_ROOT, "apps/web/src");

// Directories/patterns to skip.
const SKIP_PATTERNS = [
  "__tests__",
  ".test.",
  ".spec.",
  ".stories.",
  "generated",
  "assets/illustrations",
  "i18n",
];

function shouldSkip(filePath) {
  const rel = filePath.replace(/\\/g, "/");
  return SKIP_PATTERNS.some((p) => rel.includes(p));
}

function hasLifecycleMarker(content) {
  // Only scan the first 20 lines (file header area).
  const header = content.split("\n").slice(0, 20).join("\n");
  return MARKER_PATTERNS.some((re) => re.test(header));
}

function walkDir(dir, results = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkDir(full, results);
    } else if (st.isFile()) {
      const ext = extname(entry);
      if (ext === ".ts" || ext === ".tsx") {
        results.push(full);
      }
    }
  }
  return results;
}

const allFiles = walkDir(SCAN_ROOT);
const violations = [];

for (const file of allFiles) {
  if (shouldSkip(file)) continue;
  const content = readFileSync(file, "utf8");
  if (!hasLifecycleMarker(content)) {
    violations.push(relative(REPO_ROOT, file).replace(/\\/g, "/"));
  }
}

const total = allFiles.filter((f) => !shouldSkip(f)).length;
const violationCount = violations.length;
const coveragePercent =
  total > 0 ? (((total - violationCount) / total) * 100).toFixed(1) : "100.0";

if (JSON_OUTPUT) {
  process.stdout.write(
    JSON.stringify(
      {
        total,
        violations: violationCount,
        coverage: `${coveragePercent}%`,
        files: violations,
      },
      null,
      2,
    ) + "\n",
  );
} else {
  process.stdout.write(
    `\nLifecycle marker coverage (Hard Rule #10 — apps/web/src/**/*.{ts,tsx})\n`,
  );
  process.stdout.write(`  Total files scanned : ${total}\n`);
  process.stdout.write(`  Files with markers  : ${total - violationCount}\n`);
  process.stdout.write(`  Missing markers     : ${violationCount}\n`);
  process.stdout.write(`  Coverage            : ${coveragePercent}%\n`);
  if (violationCount > 0) {
    process.stdout.write(
      `\n  Burn-down target: 2026-Q3. Add /** @status Active */ (or Scaffolded / Deprecated)\n`,
    );
    process.stdout.write(
      `  to each file's top-level JSDoc. See docs/04-governance/governance/rules/10-lifecycle-markers.md.\n\n`,
    );
    if (!JSON_OUTPUT) {
      // Show first 20 as a sample.
      const sample = violations.slice(0, 20);
      for (const f of sample) {
        process.stdout.write(`  MISSING: ${f}\n`);
      }
      if (violations.length > 20) {
        process.stdout.write(`  … and ${violations.length - 20} more.\n`);
      }
      process.stdout.write("\n");
    }
  } else {
    process.stdout.write(`  All files have lifecycle markers.\n\n`);
  }
}

if (FAIL_ON_VIOLATIONS && violationCount > 0) {
  process.stderr.write(
    `\ncheck-lifecycle-markers: ${violationCount} file(s) missing lifecycle markers. ` +
      `Run without --fail-on-violations to see the full list.\n`,
  );
  process.exit(1);
}

// Non-blocking exit — violations are advisory during burn-down.
process.exit(0);
