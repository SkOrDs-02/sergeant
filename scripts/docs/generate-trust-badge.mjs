#!/usr/bin/env node
// scripts/docs/generate-trust-badge.mjs
//
// At-a-glance "is the docs system healthy?" badge. Computes three signals:
//   - stale-count    : open documents whose `Next review:` date is in the past
//   - wip-violations : trackers at soft or hard WIP limit (from check-wip-limits)
//   - cron-failures  : scheduled docs/release workflows with ≥2 consecutive
//                      failed runs (added 2026-05-31 after docs-daily-brief
//                      failed silently for 13 days because the badge had no
//                      awareness of GitHub Actions health)
//
// Renders the badge as a markdown block between
// `<!-- TRUST-BADGE:START -->` and `<!-- TRUST-BADGE:END -->` markers in
// `docs/README.md`. Anything between those markers is replaced; markers
// outside are untouched.
//
// Thresholds:
//   🟢 healthy   — stale = 0  AND wip-violations = 0 AND cron-failures = 0
//   🟡 warning   — stale ≤ 3 OR  wip-violations = 1 OR  any one monitored
//                  workflow has exactly 2 consecutive failed runs
//   🔴 critical  — stale > 3 OR  wip-violations > 1 OR  any monitored
//                  workflow has ≥3 consecutive failed runs, OR ≥2 workflows
//                  are at warning-or-worse
//
// Usage:
//   node scripts/docs/generate-trust-badge.mjs            # write
//   node scripts/docs/generate-trust-badge.mjs --check    # CI gate

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { collectOpenWork, TRACKERS } from "./generate-open-work.mjs";
import { evaluate, loadLimits } from "./check-wip-limits.mjs";
import { pickOverdueReview } from "./generate-today.mjs";

// Scheduled workflows we treat as load-bearing for docs trust. Keep this
// list tight — every entry costs one `gh run list` call per badge regen.
// Add a workflow here only if its silent failure would mean the badge
// itself is lying about docs health (the exact failure mode the badge
// is supposed to flag).
export const MONITORED_WORKFLOWS = [
  "docs-daily-brief.yml",
  "changelog-auto-cut.yml",
];

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
 * Count consecutive trailing failures in a list of recent-runs records
 * (newest first). Conclusion strings other than "failure" / "cancelled"
 * break the streak — including "success", "neutral", "skipped".
 * Pure for testability.
 */
export function countConsecutiveFailures(runs) {
  let n = 0;
  for (const r of runs) {
    if (r.conclusion === "failure" || r.conclusion === "cancelled") n++;
    else break;
  }
  return n;
}

/**
 * Probe each MONITORED_WORKFLOWS via `gh run list` and return a list of
 * `{ workflow, consecutiveFailures, totalSeen }` records.
 *
 * Degrades gracefully if `gh` is missing, unauthenticated, or offline —
 * returns `{ available: false, workflows: [] }` so local-dev runs without
 * gh tokens don't flash 🔴 false alarms. CI runners always have gh wired,
 * so production badge accurately reflects cron health.
 */
export function getCronHealth({ runListImpl } = {}) {
  const probe =
    runListImpl ??
    ((wf) => {
      const stdout = execFileSync(
        "gh",
        [
          "run",
          "list",
          `--workflow=${wf}`,
          "--limit=5",
          "--json",
          "conclusion,createdAt",
        ],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
      return JSON.parse(stdout);
    });

  const workflows = [];
  for (const wf of MONITORED_WORKFLOWS) {
    let runs;
    try {
      runs = probe(wf);
    } catch (err) {
      return {
        available: false,
        workflows: [],
        reason: err.message ?? String(err),
      };
    }
    if (!Array.isArray(runs)) {
      return {
        available: false,
        workflows: [],
        reason: `unexpected gh output for ${wf}`,
      };
    }
    workflows.push({
      workflow: wf,
      consecutiveFailures: countConsecutiveFailures(runs),
      totalSeen: runs.length,
    });
  }
  return { available: true, workflows };
}

/**
 * Compute the trust score from collected open-work + WIP evaluation + cron
 * health. Pure for testability — cronHealth is the structured result from
 * getCronHealth(), not a live probe.
 *
 * Cron contribution to status:
 *   - any workflow with ≥3 consecutive failures      → critical
 *   - ≥2 workflows at "warning or worse" (≥2 fails)   → critical
 *   - exactly one workflow at exactly 2 consec fails  → warning
 *   - cronHealth.available === false                  → ignored (no signal)
 */
export function computeTrust({ wipRows, overdueCount, cronHealth }) {
  const violations = wipRows.filter(
    (r) => r.severity === "warn" || r.severity === "fail",
  ).length;

  let cronStatus = "healthy";
  let cronSummary = null;
  let worstWorkflow = null;
  let worstStreak = 0;
  let warnOrWorseCount = 0;

  if (cronHealth && cronHealth.available) {
    for (const w of cronHealth.workflows) {
      if (w.consecutiveFailures >= 2) warnOrWorseCount++;
      if (w.consecutiveFailures > worstStreak) {
        worstStreak = w.consecutiveFailures;
        worstWorkflow = w.workflow;
      }
    }
    if (worstStreak >= 3 || warnOrWorseCount >= 2) cronStatus = "critical";
    else if (worstStreak === 2) cronStatus = "warning";
    if (worstStreak >= 2) {
      cronSummary = `${worstWorkflow} failed ${worstStreak}× поспіль`;
      if (warnOrWorseCount > 1)
        cronSummary += ` (+${warnOrWorseCount - 1} more)`;
    }
  }

  let status;
  if (overdueCount === 0 && violations === 0 && cronStatus === "healthy") {
    status = "healthy";
  } else if (overdueCount > 3 || violations > 1 || cronStatus === "critical") {
    status = "critical";
  } else {
    status = "warning";
  }

  return { status, overdueCount, violations, cronStatus, cronSummary };
}

function emoji(status) {
  return status === "healthy" ? "🟢" : status === "warning" ? "🟡" : "🔴";
}

export function renderBlock(trust) {
  const { status, overdueCount, violations, cronSummary } = trust;
  const baseSummary =
    status === "healthy"
      ? "0 stale docs · 0 WIP violations · 0 cron failures — система здорова, працюй спокійно."
      : status === "warning"
        ? `${overdueCount} stale, ${violations} WIP soft-violation — варто прибрати найближчим тижнем.`
        : `${overdueCount} stale, ${violations} WIP violations — **STOP**, дренуй backlog перш ніж заводити нове.`;
  const cronLine = cronSummary
    ? `> ⚠ Cron health: ${cronSummary}. Перевір \`gh run list --workflow=<name> --status=failure\`.`
    : null;
  return [
    MARK_START,
    "",
    `> ${emoji(status)} **Docs trust: ${status.toUpperCase()}** — _оновлено ${TODAY} via \`pnpm docs:gen-trust-badge\`_`,
    ">",
    `> ${baseSummary} Деталі → [\`today.md\`](./today.md).`,
    ...(cronLine ? [">", cronLine] : []),
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
      `Trust badge markers not found in docs/README.md. Add the slot first: ${MARK_START} … ${MARK_END}`,
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
  const cronHealth = getCronHealth();
  if (!cronHealth.available) {
    process.stderr.write(
      `docs:gen-trust-badge: cron health probe unavailable (${cronHealth.reason}). Badge will reflect docs/WIP signals only.\n`,
    );
  }
  const trust = computeTrust({
    wipRows,
    overdueCount: overdue.length,
    cronHealth,
  });

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
    process.stdout.write(
      `docs/README.md trust badge already current (${trust.status})\n`,
    );
    process.exit(0);
  }
  writeFileSync(README_PATH, next, "utf8");
  process.stdout.write(
    `updated docs/README.md trust badge → ${trust.status}\n`,
  );
}

const isMain = process.argv[1] === __filename;
if (isMain) main();
