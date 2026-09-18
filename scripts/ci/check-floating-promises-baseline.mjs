#!/usr/bin/env node
// scripts/ci/check-floating-promises-baseline.mjs
//
// Ratchet for the `@typescript-eslint/no-floating-promises` debt allowance in
// `eslint.floating-promises-baseline.js`.
//
// The ESLint config turns the rule OFF for every file in that list, so new
// offenders fail lint while the 83 pre-existing ones do not. That half needs
// no script — ESLint enforces it. What needs a script is the OTHER half: once
// someone fixes a file, nothing notices, and the allowance keeps the rule
// disabled there forever. A stale allowance is indistinguishable from a real
// one, which is how a ratchet quietly turns into a permanent exemption.
//
// So this checker asks one question: does every listed file STILL need the
// allowance? It re-lints just the baseline (83 files, not all 4353) with the
// rule forced back on, and fails when an entry comes back clean.
//
//   --check-only   verify the baseline is free of stale entries (CI default)
//   --bump         rewrite the baseline from a full `apps/**` scan
//
// `--bump` is the expensive path (a whole type-aware pass, minutes) and is
// meant to be run by hand after fixing files — never in CI.

import { ESLint } from "eslint";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const BASELINE_FILE = path.join(
  REPO_ROOT,
  "eslint.floating-promises-baseline.js",
);
const RULE = "@typescript-eslint/no-floating-promises";

const mode = process.argv.includes("--bump") ? "bump" : "check";

/** Files that currently trip the rule, given a set of paths to lint. */
async function findOffenders(patterns) {
  if (patterns.length === 0) return new Set();
  const eslint = new ESLint({
    cwd: REPO_ROOT,
    // Force the rule back on: the repo config switches it off for exactly the
    // files we want to re-examine, so without this override the answer would
    // always be "clean" and the ratchet would be a no-op.
    overrideConfig: [{ files: patterns, rules: { [RULE]: "error" } }],
    errorOnUnmatchedPattern: false,
    warnIgnored: false,
  });
  const results = await eslint.lintFiles(patterns);
  const offenders = new Set();
  for (const result of results) {
    const relative = path.relative(REPO_ROOT, result.filePath);
    for (const message of result.messages) {
      if (message.ruleId === RULE) offenders.add(relative);
      // A parse failure means the file left the TS project (moved, renamed,
      // newly excluded). Treat it as "still needs the allowance" rather than
      // reporting a phantom fix — the exclusion list in eslint.type-aware.js
      // is where that case belongs.
      if (message.ruleId === null) offenders.add(relative);
    }
  }
  return offenders;
}

async function readBaseline() {
  const module = await import(BASELINE_FILE);
  return module.floatingPromisesBaseline;
}

function writeBaseline(files, findings) {
  const source = readFileSync(BASELINE_FILE, "utf8");
  const header = source.slice(0, source.indexOf("export const"));
  const stamped = header.replace(
    /\/\/ Baseline captured [^\n]*/,
    `// Baseline captured ${new Date().toISOString().slice(0, 10)}: ${findings} findings across ${files.length} files.`,
  );
  const body = [...files]
    .sort()
    .map((f) => `  ${JSON.stringify(f)},\n`)
    .join("");
  writeFileSync(
    BASELINE_FILE,
    `${stamped}export const floatingPromisesBaseline = [\n${body}];\n`,
  );
}

if (mode === "bump") {
  const offenders = await findOffenders(["apps/**/*.{ts,tsx}"]);
  const previous = await readBaseline();
  writeBaseline([...offenders], offenders.size);
  const removed = previous.filter((f) => !offenders.has(f));
  const added = [...offenders].filter((f) => !previous.includes(f));
  console.log(
    `floating-promises baseline: ${previous.length} → ${offenders.size} file(s).`,
  );
  if (removed.length > 0) console.log(`  cleared: ${removed.join(", ")}`);
  if (added.length > 0) {
    console.log(`  NEW offenders recorded: ${added.join(", ")}`);
    console.log(
      "  A --bump that ADDS files is a debt increase, not a fix — justify it in the PR body or fix the file instead.",
    );
  }
  process.exit(0);
}

const baseline = await readBaseline();
if (baseline.length === 0) {
  console.log(
    "✓ floating-promises baseline: empty — the rule is on everywhere.",
  );
  process.exit(0);
}

const stillOffending = await findOffenders(baseline);
const stale = baseline.filter((f) => !stillOffending.has(f));

if (stale.length > 0) {
  console.error(
    `✗ floating-promises baseline: ${stale.length} of ${baseline.length} entries no longer need the allowance:`,
  );
  for (const f of stale) console.error(`    ${f}`);
  console.error(
    "\n  These files are fixed, but the baseline still turns the rule off for them —",
  );
  console.error(
    "  a regression there would pass lint. Run `node scripts/ci/check-floating-promises-baseline.mjs --bump` and commit.",
  );
  process.exit(1);
}

console.log(
  `✓ floating-promises baseline: all ${baseline.length} entries still needed.`,
);
