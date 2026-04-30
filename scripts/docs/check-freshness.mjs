#!/usr/bin/env node
// scripts/docs/check-freshness.mjs
//
// Nightly CI script. For every tracked markdown file with a canonical
// `> **Last validated:**` header, parses the "Last validated" / "Next review"
// dates and opens a GitHub issue for every overdue document.
//
// Tracking is **auto-discovered** by `freshness-config.mjs`: any `*.md` under
// the repo with a freshness header is included at the default cadence; per-file
// overrides live in `freshness-config.json`. The legacy `freshness-allowlist.json`
// is still honoured during the migration and listed entries without a header
// are still nagged about (so dropping the header is also visible).
//
// Idempotent: if an open issue with marker `<!-- doc-freshness:<path> -->`
// already exists, the script skips that path.
//
// Supports two header formats:
//   1. Canonical:  `> **Last validated:** YYYY-MM-DD by @user. **Next review:** YYYY-MM-DD.`
//   2. Legacy:     `> Last reviewed: YYYY-MM-DD. Reviewer: @user`
//      (legacy has no explicit Next review — the script uses cadenceDays from
//      the config / legacy allowlist)
//
// Usage:
//   GITHUB_TOKEN=... node scripts/docs/check-freshness.mjs
//   DRY_RUN=1 node scripts/docs/check-freshness.mjs        # print what would happen
//   node scripts/docs/check-freshness.mjs --check-coverage # CI gate: every
//     non-excluded `.md` must have a header (exits 1 on gaps)
//
// Environment:
//   GITHUB_TOKEN          — required (unless DRY_RUN / --check-coverage)
//   GITHUB_REPOSITORY     — "owner/repo" (auto-set by Actions; defaults to Skords-01/Sergeant)
//   DRY_RUN               — if truthy, skip issue creation

import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadConfig,
  computeCoverageGaps,
  listTrackedMarkdown,
  readConfigFile,
} from "./freshness-config.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "../..");

// ── Constants ────────────────────────────────────────────────────────────────

const HEADER_LINE_LIMIT = 15;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const LABELS = ["documentation", "freshness-overdue"];

// ── Header regexes ───────────────────────────────────────────────────────────
//
// Canonical format (preferred):
//   > **Last validated:** 2026-04-27 by @Skords-01. **Next review:** 2026-07-26.
//
// Legacy format (AGENTS.md-style, before PR-11.A):
//   > Last reviewed: 2026-04-27. Reviewer: @Skords-01

const RE_CANONICAL_VALIDATED =
  /\*\*Last validated:\*\*\s*(\d{4}-\d{2}-\d{2})\b/;
const RE_CANONICAL_NEXT_REVIEW = /\*\*Next review:\*\*\s*(\d{4}-\d{2}-\d{2})\b/;
const RE_LEGACY_REVIEWED = /Last reviewed:\s*(\d{4}-\d{2}-\d{2})\b/;

// ── Pure helpers (exported for tests) ────────────────────────────────────────

/**
 * Parse the freshness header from the first N lines of a markdown file.
 * Returns { lastValidated: string|null, nextReview: string|null, format: 'canonical'|'legacy'|null }
 */
export function parseHeader(content, lineLimit = HEADER_LINE_LIMIT) {
  const lines = content.split("\n").slice(0, lineLimit).join("\n");

  // Try canonical format first
  const validatedMatch = RE_CANONICAL_VALIDATED.exec(lines);
  const nextReviewMatch = RE_CANONICAL_NEXT_REVIEW.exec(lines);

  if (validatedMatch) {
    return {
      lastValidated: validatedMatch[1],
      nextReview: nextReviewMatch ? nextReviewMatch[1] : null,
      format: "canonical",
    };
  }

  // Fallback to legacy format
  const legacyMatch = RE_LEGACY_REVIEWED.exec(lines);
  if (legacyMatch) {
    return {
      lastValidated: legacyMatch[1],
      nextReview: null,
      format: "legacy",
    };
  }

  return { lastValidated: null, nextReview: null, format: null };
}

/** Add `days` calendar days to an ISO date string. */
export function addDays(isoDate, days) {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Compute the effective next-review date from the header + allowlist cadence. */
export function effectiveNextReview(header, cadenceDays) {
  if (header.nextReview) return header.nextReview;
  if (header.lastValidated) return addDays(header.lastValidated, cadenceDays);
  return null;
}

/** Return true if `nextReview` is strictly before `todayISO`. */
export function isOverdue(nextReview, todayISO) {
  return nextReview < todayISO;
}

/** Number of days between two ISO date strings. */
export function daysBetween(a, b) {
  const da = new Date(a + "T00:00:00Z");
  const db = new Date(b + "T00:00:00Z");
  return Math.round((db - da) / MS_PER_DAY);
}

/** Today in YYYY-MM-DD UTC. */
export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Build the freshness marker comment for a given path. */
export function freshnessMarker(filePath) {
  return `<!-- doc-freshness:${filePath} -->`;
}

/** Build the issue title for an overdue doc. */
export function issueTitle(filePath) {
  return `docs: freshness overdue — ${filePath}`;
}

/** Build the issue body for an overdue doc. */
export function issueBody(filePath, lastValidated, nextReview, daysOverdue) {
  const marker = freshnessMarker(filePath);
  return [
    marker,
    "",
    `**File:** [\`${filePath}\`](https://github.com/${repoSlug()}/blob/main/${filePath})`,
    `**Last validated:** ${lastValidated || "unknown"}`,
    `**Next review was:** ${nextReview}`,
    `**Days overdue:** ${daysOverdue}`,
    "",
    "Please review and update the freshness header:",
    "```",
    `> **Last validated:** YYYY-MM-DD by @you. **Next review:** YYYY-MM-DD.`,
    "```",
    "",
    "Then close this issue.",
  ].join("\n");
}

// ── GitHub helpers ───────────────────────────────────────────────────────────

function repoSlug() {
  return process.env.GITHUB_REPOSITORY || "Skords-01/Sergeant";
}

async function githubFetch(path, opts = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is required");
  const url = `https://api.github.com${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status}: ${text}`);
  }
  return res.json();
}

/** Search for an existing open issue with the doc-freshness marker. */
export async function findExistingIssue(filePath) {
  const slug = repoSlug();
  const marker = freshnessMarker(filePath);
  const q = encodeURIComponent(
    `repo:${slug} is:issue is:open in:body "${marker}"`,
  );
  const data = await githubFetch(`/search/issues?q=${q}&per_page=1`);
  return data.total_count > 0 ? data.items[0] : null;
}

/** Ensure labels exist (create if missing). */
async function ensureLabels() {
  const slug = repoSlug();
  for (const label of LABELS) {
    try {
      await githubFetch(`/repos/${slug}/labels/${encodeURIComponent(label)}`);
    } catch {
      try {
        await githubFetch(`/repos/${slug}/labels`, {
          method: "POST",
          body: JSON.stringify({
            name: label,
            color: label === "documentation" ? "0075ca" : "d93f0b",
          }),
        });
      } catch {
        // label may already exist from a race; ignore
      }
    }
  }
}

/** Create a GitHub issue for an overdue doc. */
export async function createIssue(
  filePath,
  lastValidated,
  nextReview,
  daysOverdue,
) {
  const slug = repoSlug();
  return githubFetch(`/repos/${slug}/issues`, {
    method: "POST",
    body: JSON.stringify({
      title: issueTitle(filePath),
      body: issueBody(filePath, lastValidated, nextReview, daysOverdue),
      labels: LABELS,
    }),
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

export async function run() {
  const { tracked } = loadConfig({ rootDir: REPO_ROOT });
  const today = todayISO();
  const dryRun = Boolean(process.env.DRY_RUN);
  const results = [];

  if (!dryRun) {
    await ensureLabels();
  }

  for (const entry of tracked) {
    const filePath = entry.path;
    const cadence = entry.cadenceDays;
    const fullPath = resolve(REPO_ROOT, filePath);

    let content;
    try {
      content = readFileSync(fullPath, "utf8");
    } catch {
      console.warn(`[WARN] File not found: ${filePath}`);
      results.push({ path: filePath, status: "missing" });
      continue;
    }

    const header = parseHeader(content);
    if (!header.lastValidated) {
      console.warn(`[WARN] No freshness header in: ${filePath}`);
      results.push({ path: filePath, status: "no-header" });
      continue;
    }

    const nextReview = effectiveNextReview(header, cadence);
    if (!nextReview) {
      results.push({ path: filePath, status: "no-next-review" });
      continue;
    }

    if (!isOverdue(nextReview, today)) {
      results.push({ path: filePath, status: "fresh", nextReview });
      continue;
    }

    const daysOver = daysBetween(nextReview, today);
    console.log(
      `[OVERDUE] ${filePath} — next review was ${nextReview} (${daysOver}d ago)`,
    );

    if (dryRun) {
      results.push({
        path: filePath,
        status: "overdue-dry",
        nextReview,
        daysOverdue: daysOver,
      });
      continue;
    }

    const existing = await findExistingIssue(filePath);
    if (existing) {
      console.log(`  ↳ Issue already open: #${existing.number} — skipping`);
      results.push({
        path: filePath,
        status: "overdue-existing",
        issueNumber: existing.number,
      });
      continue;
    }

    const issue = await createIssue(
      filePath,
      header.lastValidated,
      nextReview,
      daysOver,
    );
    console.log(`  ↳ Created issue #${issue.number}: ${issue.html_url}`);
    results.push({
      path: filePath,
      status: "overdue-created",
      issueNumber: issue.number,
    });
  }

  return results;
}

/**
 * `--check-coverage` mode: exit non-zero if any non-excluded `.md` file is
 * missing a freshness header. Used as a CI gate so freshness coverage doesn't
 * silently drop when a new doc lands without a header.
 */
export function runCoverage({ rootDir = REPO_ROOT } = {}) {
  const config = readConfigFile();
  const candidates = listTrackedMarkdown(rootDir);
  const readFile = (path) => {
    const full = resolve(rootDir, path);
    return existsSync(full) ? readFileSync(full, "utf8") : null;
  };
  const gaps = computeCoverageGaps({ candidates, config, readFile });
  return gaps;
}

// Run when executed directly
const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  if (process.argv.includes("--check-coverage")) {
    const gaps = runCoverage();
    if (gaps.length > 0) {
      console.error(
        `\n[FAIL] ${gaps.length} markdown file(s) without a freshness header:`,
      );
      for (const g of gaps) console.error(`  - ${g}`);
      console.error(
        "\nAdd `> **Last validated:** YYYY-MM-DD by @you. **Next review:** YYYY-MM-DD.`",
      );
      console.error(
        "or list the path in `scripts/docs/freshness-config.json` → `explicitExclude` if it should be opted out.",
      );
      process.exit(1);
    }
    console.log("All tracked markdown files have a freshness header.");
    process.exit(0);
  }
  run()
    .then((results) => {
      const overdue = results.filter((r) => r.status.startsWith("overdue"));
      if (overdue.length > 0) {
        console.log(`\n${overdue.length} overdue doc(s) processed.`);
      } else {
        console.log("\nAll tracked docs are fresh.");
      }
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
