#!/usr/bin/env node
// scripts/docs/check-wip-limits.mjs
//
// WIP (work-in-progress) limit check. Counts open documents per tracker
// (using the same scan as `generate-open-work.mjs`) and compares against
// `docs/governance/wip-limits.json`.
//
// Exit codes:
//   0 — every tracker under its soft limit (silent pass)
//   0 — at least one tracker between soft and hard (warning printed to stderr)
//   1 — at least one tracker at or above its hard limit (CI gate fails)
//
// Usage:
//   node scripts/docs/check-wip-limits.mjs            # human-readable report
//   node scripts/docs/check-wip-limits.mjs --json     # machine-readable JSON
//
// Designed to be wired into CI (`pnpm docs:check-wip-limits`) so that
// trying to open a new initiative / audit / etc. when the maintainer is
// already over-committed becomes a visible, mechanical signal — not
// something to forget about until decision fatigue hits.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { collectOpenWork, TRACKERS } from "./generate-open-work.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "../..");
const LIMITS_PATH = resolve(REPO_ROOT, "docs/governance/wip-limits.json");

const args = new Set(process.argv.slice(2));
const JSON_MODE = args.has("--json");

/**
 * Load the per-tracker WIP limits from `wip-limits.json`. Missing entries
 * are silently allowed (tracker simply has no limit). Throws if the file
 * is malformed.
 */
export function loadLimits(path = LIMITS_PATH) {
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed.limits || typeof parsed.limits !== "object") {
    throw new Error(`wip-limits.json missing 'limits' object`);
  }
  return parsed.limits;
}

/**
 * For each tracker, return `{ tracker, count, soft, hard, severity }` where
 * `severity` is one of:
 *   - `ok`    — count < soft
 *   - `warn`  — soft ≤ count < hard
 *   - `fail`  — count ≥ hard
 *   - `none`  — tracker has no configured limit
 */
export function evaluate(report, limits) {
  return report.map(({ tracker, entries }) => {
    const count = entries.length;
    const lim = limits[tracker.id];
    if (!lim) {
      return { tracker, count, soft: null, hard: null, severity: "none" };
    }
    const { soft, hard } = lim;
    let severity = "ok";
    if (count >= hard) severity = "fail";
    else if (count >= soft) severity = "warn";
    return { tracker, count, soft, hard, severity };
  });
}

/**
 * Pick the worst severity across all rows. Order: fail > warn > ok > none.
 */
export function worstSeverity(rows) {
  if (rows.some((r) => r.severity === "fail")) return "fail";
  if (rows.some((r) => r.severity === "warn")) return "warn";
  return "ok";
}

function fmtRow(row) {
  const ind =
    row.severity === "fail"
      ? "🔴 HARD"
      : row.severity === "warn"
        ? "🟡 SOFT"
        : row.severity === "ok"
          ? "🟢 ok"
          : "  —  ";
  const limits =
    row.soft === null ? "—" : `${row.soft} soft / ${row.hard} hard`;
  return `  ${ind}  ${row.tracker.title.padEnd(28)} ${String(row.count).padStart(3)}  (${limits})`;
}

function main() {
  const report = collectOpenWork(REPO_ROOT, TRACKERS);
  const limits = loadLimits();
  const rows = evaluate(report, limits);
  const worst = worstSeverity(rows);

  if (JSON_MODE) {
    process.stdout.write(
      JSON.stringify(
        {
          worst,
          trackers: rows.map((r) => ({
            id: r.tracker.id,
            title: r.tracker.title,
            count: r.count,
            soft: r.soft,
            hard: r.hard,
            severity: r.severity,
          })),
        },
        null,
        2,
      ) + "\n",
    );
    process.exit(worst === "fail" ? 1 : 0);
  }

  const lines = [];
  lines.push("WIP limits — open document count per tracker");
  lines.push("");
  for (const row of rows) lines.push(fmtRow(row));
  lines.push("");

  if (worst === "fail") {
    lines.push("🔴 FAIL — one or more trackers at or above their hard limit.");
    lines.push(
      "   Close existing items before starting new ones in the offending tracker(s).",
    );
    process.stderr.write(lines.join("\n") + "\n");
    process.exit(1);
  }
  if (worst === "warn") {
    lines.push("🟡 WARN — one or more trackers above their soft limit.");
    lines.push(
      "   No CI failure, but consider draining before opening new work.",
    );
    process.stderr.write(lines.join("\n") + "\n");
    process.exit(0);
  }

  process.stdout.write(lines.join("\n") + "\n");
  process.exit(0);
}

// Run only when invoked directly, not when imported by other scripts
// (generate-today.mjs and generate-trust-badge.mjs reuse `evaluate`).
const isMain = process.argv[1] === __filename;
if (isMain) main();
