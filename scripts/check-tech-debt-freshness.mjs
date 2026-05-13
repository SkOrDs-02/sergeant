#!/usr/bin/env node
// scripts/check-tech-debt-freshness.mjs
//
// CI guard for `docs/tech-debt/frontend.md` (and any other tech-debt
// pages the team wants to track). Closes audit PR-3.E.
//
// Why a marker, not `git log`?
//   The doc is a living burn-down tracker, not a generic file. Any
//   touch (typo, format-only edit, mass-rename) would silently reset a
//   timestamp-based check. Instead we read the explicit "freshness
//   marker" line at the top of the file:
//
//       > **Оновлено YYYY-MM-DD.** …
//       > **Last reviewed: YYYY-MM-DD by @user.** …
//
//   The marker forces a deliberate edit on each review and works on
//   shallow CI checkouts (no `fetch-depth: 0` required).
//
// Usage:
//   pnpm lint:tech-debt-freshness
//   FRESHNESS_THRESHOLD_DAYS=90 node scripts/check-tech-debt-freshness.mjs
//   TECH_DEBT_FILES="docs/tech-debt/frontend.md,docs/tech-debt/backend.md" \
//     node scripts/check-tech-debt-freshness.mjs
//
// Exits 1 on staleness or a missing/unparseable marker, 0 otherwise.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DEFAULT_THRESHOLD_DAYS = 60;
const DEFAULT_FILES = [
  "docs/tech-debt/frontend.md",
  "docs/tech-debt/backend.md",
  "docs/tech-debt/mobile.md",
];
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ── Marker grammar ──────────────────────────────────────────────────────────
//
// Match any of (case-insensitive):
//   `> **Оновлено YYYY-MM-DD.** …`
//   `> **Last reviewed: YYYY-MM-DD by …**`
//   `> **Last validated:** YYYY-MM-DD by …` (canonical repo freshness header)
//   `Last reviewed: YYYY-MM-DD by …` (AGENTS.md style — no quote prefix)
//
// We pick the **first** matching date in the file head (first 30 lines)
// so the doc author has a single, obvious place to edit.

const ISO_DATE_RE = /\d{4}-\d{2}-\d{2}/;
const MARKER_PATTERNS = [
  /^>\s*\*\*Оновлено\s+(\d{4}-\d{2}-\d{2})\b/im,
  /^>\s*\*\*Last reviewed:\s*(\d{4}-\d{2}-\d{2})\b/im,
  /^>\s*\*\*Last validated:\*\*\s*(\d{4}-\d{2}-\d{2})\b/im,
  /^Last reviewed:\s*(\d{4}-\d{2}-\d{2})\b/im,
];
const HEADER_LINE_LIMIT = 30;

// ── Pure helpers (exported for tests) ────────────────────────────────────────

/**
 * Parse `FRESHNESS_THRESHOLD_DAYS`. Falls back to `DEFAULT_THRESHOLD_DAYS`
 * for missing/invalid input. Negative or zero values are invalid.
 */
export function parseFreshnessThreshold(
  raw,
  fallback = DEFAULT_THRESHOLD_DAYS,
) {
  if (raw === undefined || raw === null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

/**
 * Parse `TECH_DEBT_FILES` (comma-separated paths). Empty entries skipped.
 * Falls back to the default list when nothing is provided.
 */
export function parseTechDebtFiles(raw, fallback = DEFAULT_FILES) {
  if (raw === undefined || raw === null || raw === "") return [...fallback];
  const parts = String(raw)
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [...fallback];
}

/**
 * Extract the freshness marker date from the head of `content`. Returns
 * `{ date, line }` (1-indexed) or `null` when no marker is present.
 *
 * Only the first `HEADER_LINE_LIMIT` lines are scanned: a deliberate
 * convention so reviewers always know where to update.
 */
export function extractMarkerDate(content) {
  const head = content.split("\n").slice(0, HEADER_LINE_LIMIT).join("\n");
  for (const re of MARKER_PATTERNS) {
    const m = head.match(re);
    if (m && ISO_DATE_RE.test(m[1])) {
      // Reconstruct 1-indexed line number for the matched marker.
      const idx = head.indexOf(m[0]);
      const line = head.slice(0, idx).split("\n").length;
      return { date: m[1], line };
    }
  }
  return null;
}

/**
 * Whole-day distance between two ISO-date strings (`YYYY-MM-DD`).
 * Returns a non-negative integer; later precedes earlier → 0.
 */
export function daysBetween(earlierIso, laterIso) {
  const a = new Date(`${earlierIso}T00:00:00Z`);
  const b =
    laterIso instanceof Date ? laterIso : new Date(`${laterIso}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  const ms = b.getTime() - a.getTime();
  return Math.max(0, Math.floor(ms / MS_PER_DAY));
}

/**
 * `true` iff `now - markerDate > thresholdDays`. Equal-to-threshold is
 * still considered fresh (boundary inclusive). Future-dated markers are
 * also fresh (treated as zero days old).
 */
export function isStale(markerIso, now, thresholdDays) {
  if (!markerIso) return false;
  const days = daysBetween(markerIso, now);
  if (days === null) return false;
  return days > thresholdDays;
}

// ── File loader (mockable for tests) ─────────────────────────────────────────

/** Reads the file synchronously. Returns `null` when the file is missing. */
export function loadFile(path) {
  try {
    return readFileSync(path, "utf8");
  } catch (e) {
    if (e?.code === "ENOENT") return null;
    throw e;
  }
}

// ── CLI runner ───────────────────────────────────────────────────────────────

/**
 * Programmatic entry point. Returns `{ ok, thresholdDays, results }`.
 * Each result is `{ file, markerDate, markerLine, daysSince, stale, error }`.
 */
export function run({
  files = parseTechDebtFiles(process.env.TECH_DEBT_FILES),
  thresholdDays = parseFreshnessThreshold(process.env.FRESHNESS_THRESHOLD_DAYS),
  now = new Date(),
  read = loadFile,
} = {}) {
  const nowIso = isoDateUTC(now);
  const results = files.map((file) => {
    const content = read(file);
    if (content === null) {
      return {
        file,
        markerDate: null,
        markerLine: null,
        daysSince: null,
        stale: false,
        error: "file_not_found",
      };
    }
    const marker = extractMarkerDate(content);
    if (marker === null) {
      return {
        file,
        markerDate: null,
        markerLine: null,
        daysSince: null,
        stale: false,
        error: "marker_missing",
      };
    }
    const daysSince = daysBetween(marker.date, nowIso);
    return {
      file,
      markerDate: marker.date,
      markerLine: marker.line,
      daysSince,
      stale: isStale(marker.date, nowIso, thresholdDays),
      error: null,
    };
  });
  const ok =
    results.every((r) => !r.stale) && results.every((r) => r.error === null);
  return { ok, thresholdDays, results };
}

/** Format a `Date` as `YYYY-MM-DD` in UTC. Exposed for symmetry/tests. */
export function isoDateUTC(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatReport({ ok, thresholdDays, results }) {
  const lines = [];
  lines.push(`Tech-debt freshness check — threshold: ${thresholdDays} day(s).`);
  for (const r of results) {
    if (r.error === "file_not_found") {
      lines.push(`❌ ${r.file}: file not found.`);
    } else if (r.error === "marker_missing") {
      lines.push(
        `❌ ${r.file}: no freshness marker found in the first ` +
          `${HEADER_LINE_LIMIT} lines. Add one of:\n` +
          `     > **Оновлено YYYY-MM-DD.** <reason>\n` +
          `     > **Last reviewed: YYYY-MM-DD by @handle.**`,
      );
    } else if (r.stale) {
      lines.push(
        `❌ ${r.file}:${r.markerLine}: marker dated ${r.markerDate} ` +
          `(${r.daysSince} day(s) ago > ${thresholdDays}). ` +
          `Re-validate the page and bump the date.`,
      );
    } else {
      lines.push(
        `✅ ${r.file}:${r.markerLine}: marker dated ${r.markerDate} ` +
          `(${r.daysSince} day(s) ago).`,
      );
    }
  }
  if (!ok) {
    lines.push("");
    lines.push(
      "Tech-debt pages are living trackers. Re-read the page, update " +
        "any stale numbers / statuses, then bump the marker date in the " +
        "header to reset the clock. To dial the threshold, set " +
        "`FRESHNESS_THRESHOLD_DAYS` (default 60).",
    );
  }
  return lines.join("\n");
}

// ── Entry point ──────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  const result = run();
  const report = formatReport(result);
  if (result.ok) {
    console.log(report);
  } else {
    console.error(report);
    process.exit(1);
  }
}
