#!/usr/bin/env node
// scripts/knip-respects-scaffolded.mjs
//
// Wraps `pnpm knip --reporter=json` and filters out files / exports that
// declare a lifecycle marker (`@scaffolded`, `@deprecated`). See
// AGENTS.md → Hard Rule #10 for context.
//
// Why a wrapper instead of knip's built-in `ignore`?
//   `ignore` would force us to keep a hand-maintained allowlist in
//   `knip.json` and re-edit it on every wire-up PR. The marker lives
//   with the code, so the source of truth is the file itself.
//
// Usage:
//   node scripts/knip-respects-scaffolded.mjs
//   pnpm dead-code:files
//
// Exits 0 if every "unused" file/export carries a marker.
// Exits 1 if any unmarked unused file remains — those are real findings.

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(new URL("..", import.meta.url).pathname);

const MARKER_RE = /@scaffolded\b|@deprecated\b|@experimental\b/;

function fileHasMarker(relPath) {
  const abs = resolve(REPO_ROOT, relPath);
  if (!existsSync(abs)) return false;
  let head;
  try {
    head = readFileSync(abs, "utf8").slice(0, 4096);
  } catch {
    return false;
  }
  return MARKER_RE.test(head);
}

function runKnipJson() {
  const res = spawnSync("pnpm", ["knip", "--reporter=json", "--no-progress"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  // Knip exits non-zero when it finds issues; that's expected.
  const out = res.stdout ?? "";
  const idx = out.indexOf('{"issues');
  if (idx === -1) {
    process.stderr.write(out);
    process.stderr.write(res.stderr ?? "");
    throw new Error("Could not locate knip JSON payload in output");
  }
  // Knip prints a single JSON object followed (sometimes) by pnpm's
  // ELIFECYCLE warning on stderr. Trim the JSON to the matching brace.
  let depth = 0;
  let end = -1;
  for (let i = idx; i < out.length; i++) {
    const c = out[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) throw new Error("Unterminated knip JSON");
  return JSON.parse(out.slice(idx, end + 1));
}

function main() {
  const data = runKnipJson();
  const unmarkedFiles = [];
  const markedFiles = [];

  for (const issue of data.issues ?? []) {
    if (!issue.files?.length) continue;
    if (fileHasMarker(issue.file)) {
      markedFiles.push(issue.file);
    } else {
      unmarkedFiles.push(issue.file);
    }
  }

  if (markedFiles.length) {
    process.stdout.write(
      `Skipped ${markedFiles.length} file(s) with @scaffolded/@deprecated/@experimental markers:\n`,
    );
    for (const f of markedFiles) process.stdout.write(`  · ${f}\n`);
    process.stdout.write("\n");
  }

  if (unmarkedFiles.length) {
    process.stdout.write(
      `Found ${unmarkedFiles.length} unused file(s) without lifecycle markers:\n`,
    );
    for (const f of unmarkedFiles) process.stdout.write(`  ✗ ${f}\n`);
    process.stdout.write(
      "\nIf these files are real dead code, delete them. " +
        "If they're scaffolded for future wiring, add a @scaffolded JSDoc " +
        "block (see AGENTS.md → Hard Rule #10).\n",
    );
    process.exit(1);
  }

  process.stdout.write("No unmarked unused files. ✓\n");
}

main();
