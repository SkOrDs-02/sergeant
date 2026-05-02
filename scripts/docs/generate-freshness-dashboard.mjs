#!/usr/bin/env node
// scripts/docs/generate-freshness-dashboard.mjs
//
// Generate an HTML dashboard summarising every doc in the freshness allowlist:
//   file | status | last validated | next review | days until overdue | owner
// Colour-coded: green (fresh, > 30d headroom), yellow (≤ 30d), red (overdue).
//
// Designed as a CI artifact: `docs-freshness.yml` uploads the HTML so any
// engineer can download it and audit the full doc set in one click, instead of
// grepping issues or the allowlist.
//
// Usage:
//   node scripts/docs/generate-freshness-dashboard.mjs
//   OUTPUT=./dist/freshness-dashboard.html node scripts/docs/generate-freshness-dashboard.mjs
//
// Exits 0 regardless of overdue counts (dashboard is a report, not a gate).
// The existing docs-freshness.yml job still creates issues for overdue docs.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseHeader,
  effectiveNextReview,
  daysBetween,
  todayISO,
} from "./check-freshness.mjs";
import { loadConfig } from "./freshness-config.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "../..");
const DEFAULT_OUTPUT = resolve(REPO_ROOT, "dist/freshness-dashboard.html");

const YELLOW_THRESHOLD_DAYS = 30;

// ── Pure helpers (exported for tests) ────────────────────────────────────────

/**
 * Classify a doc's freshness:
 * - "missing": file does not exist
 * - "no-header": file exists but no Last validated header
 * - "overdue": next review < today
 * - "due-soon": next review within YELLOW_THRESHOLD_DAYS
 * - "fresh": plenty of headroom
 */
export function classify(
  entry,
  { today = todayISO(), yellow = YELLOW_THRESHOLD_DAYS } = {},
) {
  if (entry.status === "missing") return "missing";
  if (entry.status === "no-header") return "no-header";
  if (!entry.nextReview) return "no-header";
  const delta = daysBetween(today, entry.nextReview);
  if (delta < 0) return "overdue";
  if (delta <= yellow) return "due-soon";
  return "fresh";
}

/** HTML-escape a string. */
export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function gatherEntries(
  tracked,
  { today = todayISO(), repoRoot = REPO_ROOT } = {},
) {
  const results = [];
  for (const item of tracked) {
    const filePath = item.path;
    const cadence = item.cadenceDays || 90;
    const fullPath = resolve(repoRoot, filePath);
    if (!existsSync(fullPath)) {
      results.push({ path: filePath, cadence, status: "missing" });
      continue;
    }
    const content = readFileSync(fullPath, "utf8");
    const header = parseHeader(content);
    if (!header.lastValidated) {
      results.push({ path: filePath, cadence, status: "no-header" });
      continue;
    }
    const nextReview = effectiveNextReview(header, cadence);
    // Extract owner (@handle) from the header line. Falls back to null.
    const ownerMatch =
      /by\s+(@[A-Za-z0-9_\-.]+)/.exec(
        content.split("\n").slice(0, 15).join("\n"),
      ) ||
      /Reviewer:\s*(@[A-Za-z0-9_\-.]+)/.exec(
        content.split("\n").slice(0, 15).join("\n"),
      );
    const owner = ownerMatch ? ownerMatch[1] : null;
    const delta = nextReview ? daysBetween(today, nextReview) : null;
    results.push({
      path: filePath,
      cadence,
      source: item.source,
      status: "present",
      lastValidated: header.lastValidated,
      nextReview,
      owner,
      daysUntilOverdue: delta,
      format: header.format,
    });
  }
  return results;
}

/** Render the HTML report. */
export function renderHtml(entries, { today = todayISO() } = {}) {
  const totals = {
    fresh: 0,
    dueSoon: 0,
    overdue: 0,
    missing: 0,
    noHeader: 0,
  };

  const rows = entries
    .map((e) => {
      const cls = classify(e, { today });
      if (cls === "fresh") totals.fresh++;
      else if (cls === "due-soon") totals.dueSoon++;
      else if (cls === "overdue") totals.overdue++;
      else if (cls === "missing") totals.missing++;
      else if (cls === "no-header") totals.noHeader++;

      const statusLabel =
        cls === "missing"
          ? "Missing"
          : cls === "no-header"
            ? "No header"
            : cls === "overdue"
              ? `Overdue (${Math.abs(e.daysUntilOverdue)}d)`
              : cls === "due-soon"
                ? `Due soon (${e.daysUntilOverdue}d)`
                : `Fresh (${e.daysUntilOverdue}d)`;

      return `<tr class="${cls}">
  <td><code>${escapeHtml(e.path)}</code></td>
  <td class="status">${escapeHtml(statusLabel)}</td>
  <td>${escapeHtml(e.lastValidated || "—")}</td>
  <td>${escapeHtml(e.nextReview || "—")}</td>
  <td class="num">${e.daysUntilOverdue == null ? "—" : e.daysUntilOverdue}</td>
  <td>${escapeHtml(e.owner || "—")}</td>
  <td class="num">${e.cadence}</td>
</tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Sergeant — Docs Freshness Dashboard (${escapeHtml(today)})</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 2rem; color: #111; }
  h1 { margin-top: 0; }
  .summary { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
  .summary .chip { padding: 0.5rem 0.75rem; border-radius: 6px; font-weight: 600; }
  .chip.fresh { background: #d4edda; color: #155724; }
  .chip.due-soon { background: #fff3cd; color: #856404; }
  .chip.overdue { background: #f8d7da; color: #721c24; }
  .chip.missing, .chip.no-header { background: #e2e3e5; color: #383d41; }
  table { border-collapse: collapse; width: 100%; font-size: 14px; }
  th, td { padding: 0.4rem 0.6rem; text-align: left; border-bottom: 1px solid #eee; }
  th { background: #f6f8fa; position: sticky; top: 0; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  tr.overdue { background: #fdecea; }
  tr.due-soon { background: #fff8e1; }
  tr.missing, tr.no-header { background: #f0f0f0; color: #666; }
  tr.fresh td.status { color: #155724; }
  tr.due-soon td.status { color: #856404; }
  tr.overdue td.status { color: #721c24; }
  code { background: #f6f8fa; padding: 1px 4px; border-radius: 3px; font-size: 13px; }
  p.meta { color: #666; font-size: 13px; }
</style>
</head>
<body>
<h1>Sergeant — Docs Freshness Dashboard</h1>
<p class="meta">Generated <strong>${escapeHtml(today)}</strong> by <code>scripts/docs/generate-freshness-dashboard.mjs</code>. Data source: auto-discovered <code>**/*.md</code> + <code>scripts/docs/freshness-config.json</code>.</p>
<div class="summary">
  <div class="chip fresh">Fresh: ${totals.fresh}</div>
  <div class="chip due-soon">Due soon (≤${YELLOW_THRESHOLD_DAYS}d): ${totals.dueSoon}</div>
  <div class="chip overdue">Overdue: ${totals.overdue}</div>
  <div class="chip no-header">No header: ${totals.noHeader}</div>
  <div class="chip missing">Missing: ${totals.missing}</div>
</div>
<table>
<thead>
<tr>
  <th>File</th>
  <th>Status</th>
  <th>Last validated</th>
  <th>Next review</th>
  <th class="num">Days until overdue</th>
  <th>Owner</th>
  <th class="num">Cadence (d)</th>
</tr>
</thead>
<tbody>
${rows}
</tbody>
</table>
</body>
</html>
`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const outPath = process.env.OUTPUT || DEFAULT_OUTPUT;
  const { tracked } = loadConfig({ rootDir: REPO_ROOT });
  const entries = gatherEntries(tracked);
  const html = renderHtml(entries);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html);
  const rel = relative(REPO_ROOT, outPath);
  console.log(`✅Wrote ${rel} — ${entries.length} docs tracked.`);
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) main();
