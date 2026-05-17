#!/usr/bin/env node
// scripts/docs/generate-trust-badge.mjs
//
// At-a-glance "is the docs system healthy?" badge. Computes two signals:
//   - stale-count    : open documents whose `Next review:` date is in the past
//   - wip-violations : trackers at soft or hard WIP limit (from check-wip-limits)
//
// Renders the badge as a markdown block between
// `<!-- TRUST-BADGE:START -->` and `<!-- TRUST-BADGE:END -->` markers in
// `docs/README.md`. Anything between those markers is replaced; markers
// outside are untouched.
//
// Thresholds:
//   🟢 healthy   — stale = 0  AND wip-violations = 0
//   🟡 warning   — stale ≤ 3 OR  wip-violations = 1
//   🔴 critical  — stale > 3 OR  wip-violations > 1
//
// Usage:
//   node scripts/docs/generate-trust-badge.mjs            # write
//   node scripts/docs/generate-trust-badge.mjs --check    # CI gate

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  collectOpenWork,
  TRACKERS,
} from "./generate-open-work.mjs";
import { evaluate, loadLimits } from "./check-wip-limits.mjs";
import { pickOverdueReview } from "./generate-today.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "../..");
const README_PATH = resolve(REPO_ROOT, "docs/README.md");

const MARK_START = "<!-- TRUST-BADGE:START -->";
const MARK_END = "<!-- TRUST-BADGE:END -->";

const TODAY = new Date().toISOString().slice(0, 10);

const args = new Set(process.argv.slice(2));
const CHECK_MODE = args.has("--check");

/**
 * Compute the trust score from collected open-work + WIP evaluation.
 * Pure for testability.
 */
export function computeTrust({ wipRows, overdueCount }) {
  const violations = wipRows.filter(
    (r) => r.severity === "warn" || r.severity === "fail",
  ).length;
  let status;
  if (overdueCount === 0 && violations === 0) status = "healthy";
  else if (overdueCount > 3 || violations > 1) status = "critical";
  else status = "warning";
  return { status, overdueCount, violations };
}

function emoji(status) {
  return status === "healthy" ? "🟢" : status === "warning" ? "🟡" : "🔴";
}

function renderBlock(trust) {
  const { status, overdueCount, violations } = trust;
  const summary =
    status === "healthy"
      ? "0 stale docs · 0 WIP violations — система здорова, працюй спокійно."
      : status === "warning"
        ? `${overdueCount} stale, ${violations} WIP soft-violation — варто прибрати найближчим тижнем.`
        : `${overdueCount} stale, ${violations} WIP violations — **STOP**, дренуй backlog перш ніж заводити нове.`;
  return [
    MARK_START,
    "",
    `> ${emoji(status)} **Docs trust: ${status.toUpperCase()}** — _оновлено ${TODAY} via \`pnpm docs:gen-trust-badge\`_`,
    ">",
    `> ${summary} Деталі → [\`today.md\`](./today.md).`,
    "",
    MARK_END,
  ].join("\n");
}

/**
 * Splice the new badge block into the README between the markers. Throws
 * if markers are missing or out of order — easier to fail loudly than to
 * silently append in the wrong place.
 */
export function spliceReadme(readme, block) {
  const i = readme.indexOf(MARK_START);
  const j = readme.indexOf(MARK_END);
  if (i === -1 || j === -1) {
    throw new Error(
      `Trust badge markers not found in docs/README.md. Add the slot first: ${MARK_START} ... ${MARK_END}`,
    );
  }
  if (j < i) {
    throw new Error(`Trust badge markers out of order in docs/README.md`);
  }
  const before = readme.slice(0, i);
  const after = readme.slice(j + MARK_END.length);
  return before + block + after;
}

function main() {
  const report = collectOpenWork(REPO_ROOT, TRACKERS);
  const limits = loadLimits();
  const wipRows = evaluate(report, limits);
  const overdue = pickOverdueReview(report);
  const trust = computeTrust({ wipRows, overdueCount: overdue.length });

  const readme = readFileSync(README_PATH, "utf8");
  const next = spliceReadme(readme, renderBlock(trust));

  if (CHECK_MODE) {
    if (readme !== next) {
      process.stderr.write(
        `docs:gen-trust-badge --check: docs/README.md trust badge stale. Run \`pnpm docs:gen-trust-badge\`.\n`,
      );
      process.exit(1);
    }
    process.exit(0);
  }

  if (readme === next) {
    process.stdout.write(`docs/README.md trust badge already current (${trust.status})\n`);
    process.exit(0);
  }
  writeFileSync(README_PATH, next, "utf8");
  process.stdout.write(`updated docs/README.md trust badge → ${trust.status}\n`);
}

const isMain = process.argv[1] === __filename;
if (isMain) main();
