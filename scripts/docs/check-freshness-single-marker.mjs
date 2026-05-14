#!/usr/bin/env node
// scripts/docs/check-freshness-single-marker.mjs
//
// Guards against doc freshness drift where a docs/*.md file accidentally
// carries multiple canonical `Last validated` markers. Coverage is checked by
// `check-freshness.mjs --check-coverage`; this script only enforces "at most
// one" and ignores fenced code examples.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DEFAULT_ROOT = resolve(__dirname, "..", "..");
const MARKER_RE = /^>\s*\*\*Last validated:\*\*/;
const FENCE_RE = /^\s*```/;

const SKIP_DIRS = new Set([
  ".git",
  ".turbo",
  "node_modules",
  "dist",
  "dist-server",
  "build",
  "coverage",
]);

export function countFreshnessMarkers(content) {
  let count = 0;
  let inFence = false;
  for (const line of content.split(/\r?\n/)) {
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence && MARKER_RE.test(line)) {
      count++;
    }
  }
  return count;
}

function walkDocsMarkdown(repoRoot, dir = resolve(repoRoot, "docs"), out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        walkDocsMarkdown(repoRoot, join(dir, entry.name), out);
      }
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

export function checkFreshnessSingleMarker(repoRoot = DEFAULT_ROOT) {
  const files = walkDocsMarkdown(repoRoot);
  const failures = [];

  for (const file of files) {
    const content = readFileSync(file, "utf8");
    const markers = countFreshnessMarkers(content);
    if (markers > 1) {
      failures.push({
        file: relative(repoRoot, file).replace(/\\/g, "/"),
        markers,
      });
    }
  }

  return {
    checked: files.length,
    failures,
    ok: failures.length === 0,
  };
}

function parseArgs(argv) {
  const rootIdx = argv.indexOf("--root");
  return {
    json: argv.includes("--json"),
    root: rootIdx >= 0 ? resolve(argv[rootIdx + 1]) : DEFAULT_ROOT,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = checkFreshnessSingleMarker(args.root);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.ok ? 0 : 1);
  }

  if (report.ok) {
    console.log(
      `Freshness single-marker OK - ${report.checked} docs/*.md file(s) checked.`,
    );
    process.exit(0);
  }

  console.error("Freshness single-marker check FAILED\n");
  for (const failure of report.failures) {
    console.error(`  - ${failure.file}: ${failure.markers} markers`);
  }
  console.error(
    "\nFix: keep exactly one canonical '> **Last validated:**' marker in each docs/*.md file. Historical dates should use another label or an HTML comment.",
  );
  process.exit(1);
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(__filename);
if (isMain) {
  main();
}
