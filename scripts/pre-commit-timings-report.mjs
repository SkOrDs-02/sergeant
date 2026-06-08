#!/usr/bin/env node
// scripts/pre-commit-timings-report.mjs
//
// Companion to `scripts/pre-commit-timing.mjs` — reads the JSONL log
// at `.husky/.pre-commit-timings.log` and prints a Markdown summary
// (p50 / p95 / mean / max) for the last N commits.
//
// Wired via `pnpm pre-commit:timings`. Closes audit item P1-5 from
// `docs/audits/2026-05-13-testing-devx-roast.md` together with the
// timing wrapper. The log is gitignored — these numbers are local
// dev signal, never a CI gate.
//
// Usage:
//   pnpm pre-commit:timings              # last 50 commits
//   pnpm pre-commit:timings -- --last 20 # last 20 commits
//   pnpm pre-commit:timings -- --all     # everything in the log
//
// Exit codes:
//   0 — printed a summary (or printed an "empty log" notice).
//   1 — unexpected error reading the log.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const LOG_PATH = join(REPO_ROOT, ".husky", ".pre-commit-timings.log");

function parseArgs(argv) {
  const args = { last: 50, all: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--all") {
      args.all = true;
    } else if (arg === "--last") {
      const next = argv[i + 1];
      const value = Number(next);
      if (!Number.isInteger(value) || value <= 0) {
        process.stderr.write(
          `error: --last expects a positive integer, got ${JSON.stringify(next)}\n`,
        );
        process.exit(1);
      }
      args.last = value;
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        [
          "Usage: pnpm pre-commit:timings [-- --last N | --all]",
          "",
          "Reads .husky/.pre-commit-timings.log and prints p50/p95/mean/max",
          "per stage for the last N records (default 50).",
          "",
        ].join("\n"),
      );
      process.exit(0);
    } else {
      process.stderr.write(`error: unknown arg ${JSON.stringify(arg)}\n`);
      process.exit(1);
    }
  }
  return args;
}

function readRecords() {
  if (!existsSync(LOG_PATH)) return [];
  const raw = readFileSync(LOG_PATH, "utf8");
  const records = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed.totalMs === "number") {
        records.push(parsed);
      }
    } catch {
      // Skip malformed lines — timing log is best-effort.
    }
  }
  return records;
}

/**
 * Compute the `p`-th percentile (0..100) of a sorted-ascending sample.
 * Uses linear interpolation between adjacent samples (the same recipe
 * Vitest reporters and most metrics dashboards use).
 */
function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  const frac = rank - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

function statsFor(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, x) => acc + x, 0);
  return {
    n: sorted.length,
    mean: sorted.length === 0 ? 0 : sum / sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: sorted.length === 0 ? 0 : sorted[sorted.length - 1],
  };
}

function formatMs(ms) {
  if (ms < 1000) return `${ms.toFixed(0)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function collectStageSamples(records) {
  const byStage = new Map();
  for (const rec of records) {
    if (!rec.stages || typeof rec.stages !== "object") continue;
    for (const [name, value] of Object.entries(rec.stages)) {
      if (!value || typeof value.ms !== "number") continue;
      const arr = byStage.get(name) ?? [];
      arr.push(value.ms);
      byStage.set(name, arr);
    }
  }
  return byStage;
}

function printReport({ records, totals, stages, source }) {
  if (records.length === 0) {
    process.stdout.write(
      [
        "# Pre-commit timing report",
        "",
        `Log: \`${source}\` — порожній або відсутній.`,
        "",
        "Зроби пару коммітів локально, потім запусти знову.",
        "",
      ].join("\n"),
    );
    return;
  }

  const firstTs = records[0].ts ?? "?";
  const lastTs = records[records.length - 1].ts ?? "?";

  const rows = [
    ["stage", "n", "p50", "p95", "mean", "max"],
    ["---", "---:", "---:", "---:", "---:", "---:"],
    [
      "**total**",
      String(totals.n),
      formatMs(totals.p50),
      formatMs(totals.p95),
      formatMs(totals.mean),
      formatMs(totals.max),
    ],
  ];
  for (const [name, stats] of stages) {
    rows.push([
      `\`${name}\``,
      String(stats.n),
      formatMs(stats.p50),
      formatMs(stats.p95),
      formatMs(stats.mean),
      formatMs(stats.max),
    ]);
  }

  process.stdout.write(
    [
      "# Pre-commit timing report",
      "",
      `Log: \`${source}\` · sample: ${records.length} commit(s) · range: ${firstTs} → ${lastTs}`,
      "",
      rows.map((cols) => `| ${cols.join(" | ")} |`).join("\n"),
      "",
      "_Per-stage rows show only stages whose subprocess emitted a `SERGEANT_TIMING_LOG`",
      "event (contract documented in `docs/02-engineering/development/pre-commit-timing.md`)._",
      "",
    ].join("\n"),
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const records = readRecords();
  const window = args.all ? records : records.slice(-args.last);

  const totals = statsFor(window.map((r) => r.totalMs));
  const stageSamples = collectStageSamples(window);
  const stageStats = [...stageSamples.entries()]
    .map(([name, samples]) => [name, statsFor(samples)])
    .sort((a, b) => b[1].p95 - a[1].p95);

  printReport({
    records: window,
    totals,
    stages: stageStats,
    source: ".husky/.pre-commit-timings.log",
  });
}

main();
