#!/usr/bin/env node
/**
 * report-shell-tax.mjs — measure ongoing maintenance cost of the
 * Capacitor shell (`apps/mobile-shell/`).
 *
 * Initiative: docs/initiatives/0002-mobile-platform-decision.md (Phase 1).
 * ADR: docs/adr/0010-mobile-dual-track-capacitor-expo.md
 *      § Sunset schedule (T₀ 2026-09-01, T₁ 2026-11-30, T₂ 2026-12-30).
 *
 * Why: ADR-0010 status is `accepted-with-sunset` — `apps/mobile-shell/`
 * is on a locked-in deprecation timeline, but until T₂ the maintainer
 * keeps paying for shell PRs (Capacitor bumps, Android signing pipeline,
 * iOS release scaffolding, Sentry triage). The ADR's Exit dashboard
 * (three binary lighthouses) is qualitative; this script gives a
 * *quantitative* baseline so cost is visible at every sprint review.
 *
 * What it counts (from `git log`):
 *   - commits that touched `apps/mobile-shell/**` (`shell_commits`)
 *   - distinct files in those touches (`shell_files`)
 *   - distinct authors (`shell_authors`)
 *   - top-15 hottest files by touch count (`top_files`)
 *
 * Usage:
 *   node scripts/report-shell-tax.mjs                 # default: last 90 days
 *   node scripts/report-shell-tax.mjs --since 30      # last 30 days
 *   node scripts/report-shell-tax.mjs --since 6.months # any git --since spec
 *   node scripts/report-shell-tax.mjs --json          # machine-readable
 *
 * Exit codes:
 *   0 — report printed; CI may grep stdout but never fails on cost.
 *   2 — git invocation failed (likely shallow clone or no .git).
 *   3 — bad CLI arg.
 *
 * Notes:
 *   - The script does NOT fail on high counts. The whole point is to
 *     publish the number; gating decisions live in the ADR Exit
 *     dashboard, not in this script.
 *   - Stdout is fully deterministic (sorted) so weekly cron diffs
 *     against last week's report cleanly.
 *   - Designed to work on a *partial* clone too: if `git rev-parse
 *     --is-shallow-repository` returns `true` we print a one-line
 *     warning so the consumer knows the count is a lower bound.
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");
const SHELL_PATHSPEC = "apps/mobile-shell/";
const TOP_FILES_LIMIT = 15;
const DEFAULT_SINCE_DAYS = 90;

function parseArgs(argv) {
  const out = { since: `${DEFAULT_SINCE_DAYS}.days.ago`, json: false };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") {
      out.json = true;
      continue;
    }
    if (arg === "--since") {
      const val = argv[++i];
      if (!val) {
        process.stderr.write("--since requires a value\n");
        process.exit(3);
      }
      // Accept either a bare number (days) or a git --since spec.
      out.since = /^\d+$/.test(val) ? `${val}.days.ago` : val;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        [
          "report-shell-tax — quantify maintenance cost of apps/mobile-shell.",
          "",
          "Usage:",
          "  report-shell-tax [--since <DAYS|git-since-spec>] [--json]",
          "",
          "Defaults:",
          `  --since ${DEFAULT_SINCE_DAYS}    (~last quarter)`,
          "",
          "See docs/initiatives/0002-mobile-platform-decision.md and",
          "docs/adr/0010-mobile-dual-track-capacitor-expo.md § Sunset schedule.",
          "",
        ].join("\n"),
      );
      process.exit(0);
    }
    process.stderr.write(`Unknown argument: ${arg}\n`);
    process.exit(3);
  }
  return out;
}

function git(args, opts = {}) {
  return execSync(`git ${args}`, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GIT_PAGER: "cat" },
    ...opts,
  });
}

function isShallowClone() {
  try {
    return git("rev-parse --is-shallow-repository").trim() === "true";
  } catch {
    return false;
  }
}

function collectShellTouches(sinceSpec) {
  // `--name-only --pretty=format:%H%x09%an` produces one record per
  // commit:
  //   <sha>\t<author>
  //   <file1>
  //   <file2>
  //   <blank line>
  // We restrict to apps/mobile-shell/ via pathspec so only matching
  // commits are emitted in the first place.
  const raw = git(
    `log --since='${sinceSpec}' --name-only --pretty=format:%H%x09%an -- ${SHELL_PATHSPEC}`,
  );
  const records = [];
  let current = null;
  for (const line of raw.split("\n")) {
    if (!line.length) {
      if (current) {
        records.push(current);
        current = null;
      }
      continue;
    }
    if (current === null) {
      const tabIdx = line.indexOf("\t");
      if (tabIdx === -1) continue;
      current = {
        sha: line.slice(0, tabIdx),
        author: line.slice(tabIdx + 1),
        files: [],
      };
      continue;
    }
    current.files.push(line);
  }
  if (current) records.push(current);
  return records;
}

function summarize(records) {
  const fileTouches = new Map();
  const authors = new Set();
  const fileSet = new Set();
  for (const rec of records) {
    authors.add(rec.author);
    for (const f of rec.files) {
      if (!f.startsWith(SHELL_PATHSPEC)) continue; // pathspec was a path filter on `git log`, not on file lines
      fileSet.add(f);
      fileTouches.set(f, (fileTouches.get(f) ?? 0) + 1);
    }
  }
  const topFiles = Array.from(fileTouches.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, TOP_FILES_LIMIT)
    .map(([file, count]) => ({ file, touches: count }));
  return {
    shell_commits: records.length,
    shell_files: fileSet.size,
    shell_authors: authors.size,
    top_files: topFiles,
  };
}

function formatHumanReport({ since, summary, shallow }) {
  const lines = [];
  lines.push(`# Shell tax report (${SHELL_PATHSPEC})`);
  lines.push("");
  lines.push(`Range: --since ${since}`);
  if (shallow) {
    lines.push(
      "Note: shallow clone detected — counts are a *lower bound*. Run `git fetch --unshallow` for full history.",
    );
  }
  lines.push("");
  lines.push(`shell_commits: ${summary.shell_commits}`);
  lines.push(`shell_files:   ${summary.shell_files}`);
  lines.push(`shell_authors: ${summary.shell_authors}`);
  lines.push("");
  if (summary.top_files.length > 0) {
    lines.push(`top_files (top ${TOP_FILES_LIMIT} by touch count):`);
    const widest = summary.top_files.reduce(
      (n, x) => Math.max(n, x.file.length),
      0,
    );
    for (const { file, touches } of summary.top_files) {
      lines.push(`  ${file.padEnd(widest)}  ${String(touches).padStart(4)}`);
    }
  } else {
    lines.push("top_files: (none)");
  }
  lines.push("");
  lines.push(
    "Context: ADR-0010 § Sunset schedule (T₀ 2026-09-01 / T₁ 2026-11-30 / T₂ 2026-12-30).",
  );
  lines.push(
    "Source initiative: docs/initiatives/0002-mobile-platform-decision.md.",
  );
  return lines.join("\n");
}

function main() {
  const args = parseArgs(process.argv);
  let shallow = false;
  let records;
  try {
    shallow = isShallowClone();
    records = collectShellTouches(args.since);
  } catch (err) {
    process.stderr.write(
      `git log failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(2);
  }
  const summary = summarize(records);
  if (args.json) {
    const payload = {
      since: args.since,
      pathspec: SHELL_PATHSPEC,
      shallow,
      ...summary,
      generated_at: new Date().toISOString(),
    };
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }
  process.stdout.write(
    `${formatHumanReport({ since: args.since, summary, shallow })}\n`,
  );
}

main();
