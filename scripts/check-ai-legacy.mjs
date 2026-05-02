#!/usr/bin/env node
// scripts/check-ai-legacy.mjs
//
// Scan the repo for `// AI-LEGACY: expires YYYY-MM-DD` markers (Hard
// Rule #10 — see AGENTS.md and `sergeant-design/ai-marker-syntax`).
//
// Until this script existed, an expired `AI-LEGACY` marker silently rotted in
// the codebase: the ESLint rule only validates *syntax*, not the date, and the
// freshness pipeline only covers `*.md` docs. The result was an unbounded
// queue of "delete after YYYY-MM-DD" comments that nobody noticed.
//
// This script closes the loop:
//
//   • Walks every tracked source file (`*.ts`, `*.tsx`, `*.mjs`, `*.js`,
//     `*.cjs`, `*.md`, `*.yml`, `*.yaml`) under apps/, packages/, scripts/,
//     tools/, plus root files.
//   • Extracts every `AI-LEGACY: expires YYYY-MM-DD` marker.
//   • Classifies as expired (< today), due-soon (within 14 days), or fresh.
//   • In `--check` mode, exits 1 when any expired marker is found.
//   • In `--dashboard <path>` mode, writes a colour-coded HTML report
//     (mirrors `scripts/docs/generate-freshness-dashboard.mjs`).
//   • In `--issues` mode, opens one idempotent GitHub issue per expired
//     marker (file + line) — used by the weekly `ai-legacy-scan` workflow.
//
// The marker grammar matches the `sergeant-design/ai-marker-syntax` rule:
//
//     // AI-LEGACY: expires YYYY-MM-DD …optional rationale…
//
// Both line and block comments are supported. The date must be ISO-8601
// (zero-padded). A marker without an `expires` clause is reported as
// `malformed` (separate from `expired`) so the author can fix the syntax.
//
// Usage:
//   node scripts/check-ai-legacy.mjs                                        # human summary
//   node scripts/check-ai-legacy.mjs --check                                # CI gate (exit 1 on expired/malformed)
//   node scripts/check-ai-legacy.mjs --check --require-issue                # also fail on missing issue refs
//   node scripts/check-ai-legacy.mjs --json                                 # machine-readable
//   node scripts/check-ai-legacy.mjs --dashboard out.html                   # HTML report
//   GITHUB_TOKEN=... node scripts/check-ai-legacy.mjs --issues
//
// Environment:
//   GITHUB_TOKEN          required for `--issues`
//   GITHUB_REPOSITORY     `owner/repo` (defaults to `Skords-01/Sergeant`)
//   AI_LEGACY_DUE_SOON    days before expiry to show "due soon" (default 14)
//   DRY_RUN               when set, `--issues` skips the actual API calls

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");

// ── Constants ────────────────────────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_DUE_SOON_DAYS = 14;

// File extensions we consider "code-like" enough for AI markers. We deliberately
// **do not** scan markdown / YAML / HTML / CSS — those file types frequently
// reference the marker name in prose ("the AI-LEGACY: expires YYYY-MM-DD
// marker") and would create permanent false positives. The marker grammar is
// only meaningful inside `//` and `/* */` comments, which means TS/JS family
// only.
const SCAN_EXTS = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);

// Directory names we never descend into. Mirrors the freshness scanner's
// SKIP_DIRS plus a few code-specific outputs.
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".turbo",
  ".next",
  ".cache",
  "dist",
  "dist-server",
  "build",
  "coverage",
  ".nyc_output",
  "ios",
  "android",
  // Vendored skill libraries — owned upstream
  ".agents",
  ".claude",
]);

// File-level skips. The eslint plugin's own AI-marker tests intentionally
// contain malformed/expired examples; ditto the playbook that documents the
// marker grammar. Including them would create a permanent false positive.
const SKIP_FILES = new Set([
  "packages/eslint-plugin-sergeant-design/index.js",
  "packages/eslint-plugin-sergeant-design/__tests__/ai-marker-syntax.test.mjs",
  "scripts/check-ai-legacy.mjs",
  "scripts/__tests__/check-ai-legacy.test.mjs",
]);

// Directories whose entire contents are skipped — the AI-marker docs explain
// the syntax with deliberately-stale example dates that should never trigger
// the scanner.
const SKIP_FILE_PREFIXES = ["docs/playbooks/", "docs/planning/"];

// Marker regex — anchored to the canonical syntax enforced by the ESLint rule.
//
// The capture groups are:
//   1: ISO date (YYYY-MM-DD)
//   2: optional trailing rationale (everything after the date until end-of-line,
//      excluding any `*/` block-comment terminator).
const RX_MARKER =
  /AI-LEGACY:\s*expires\s+(\d{4}-\d{2}-\d{2})\b\.?\s*([^\n]*?)?\s*(?:\*\/|$)/gm;

// Catches `AI-LEGACY` without a parseable expiry — surfaced separately so the
// author knows to add one. Anchored to comment markers (`//`, `*`, `/*`) so
// occurrences inside string literals or identifiers are ignored.
// Excludes the well-formed case via negative look-ahead on `expires YYYY-MM-DD`.
const RX_MALFORMED =
  /(?:^|[^A-Za-z0-9_])(?:\/\/|\/\*|\*)\s*[^\n]{0,80}AI-LEGACY(?!:\s*expires\s+\d{4}-\d{2}-\d{2})[^A-Za-z0-9_]/gm;

const LABELS = ["tech-debt", "ai-legacy-expired"];

// ── Pure helpers (exported for tests) ────────────────────────────────────────

/** Today in YYYY-MM-DD UTC. Override for deterministic tests. */
export function todayISO(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/** Number of calendar days between two ISO dates (b - a). */
export function daysBetween(a, b) {
  const da = new Date(a + "T00:00:00Z");
  const db = new Date(b + "T00:00:00Z");
  return Math.round((db - da) / MS_PER_DAY);
}

/**
 * Classify a marker by its expiry date.
 * Returns "expired" | "due-soon" | "fresh".
 */
export function classifyExpiry(
  expires,
  { today = todayISO(), dueSoonDays = DEFAULT_DUE_SOON_DAYS } = {},
) {
  const delta = daysBetween(today, expires);
  if (delta < 0) return "expired";
  if (delta <= dueSoonDays) return "due-soon";
  return "fresh";
}

/**
 * Extract every AI-LEGACY marker from a source file. Returns a list of
 * `{ line, expires, note }` objects. Resets the regex `lastIndex` between
 * calls so the function is safe to invoke multiple times.
 */
export function extractMarkers(content) {
  const markers = [];
  RX_MARKER.lastIndex = 0;
  let match;
  while ((match = RX_MARKER.exec(content)) !== null) {
    const [, expires, rawNote = ""] = match;
    const offset = match.index;
    const line = content.slice(0, offset).split("\n").length;
    markers.push({ line, expires, note: rawNote.trim() });
  }
  return markers;
}

/** Detect malformed `AI-LEGACY` markers (no `expires YYYY-MM-DD`). */
export function extractMalformed(content) {
  // Skip files that look fine (no marker token at all).
  if (!/AI-LEGACY/.test(content)) return [];
  const malformed = [];
  RX_MALFORMED.lastIndex = 0;
  RX_MARKER.lastIndex = 0;

  // Build a set of well-formed offsets so we don't double-report them.
  const goodOffsets = new Set();
  let m;
  while ((m = RX_MARKER.exec(content)) !== null) {
    goodOffsets.add(m.index);
  }

  while ((m = RX_MALFORMED.exec(content)) !== null) {
    // Skip false positives where the malformed regex landed inside a
    // well-formed marker (`AI-LEGACY:` followed by `expires…`).
    if (goodOffsets.has(m.index)) continue;
    const offset = m.index;
    const line = content.slice(0, offset).split("\n").length;
    const snippetEnd = content.indexOf("\n", offset);
    const snippet = content
      .slice(offset, snippetEnd === -1 ? offset + 80 : snippetEnd)
      .trim();
    malformed.push({ line, snippet });
  }
  return malformed;
}

/** Build the issue marker comment for a given file/line/expires triple. */
export function legacyIssueMarker(filePath, line, expires) {
  return `<!-- ai-legacy:${filePath}:${line}:${expires} -->`;
}

/** Build the issue title for an expired marker. */
export function legacyIssueTitle(filePath, line, expires) {
  return `code: AI-LEGACY expired (${expires}) — ${filePath}:${line}`;
}

/** Build the issue body for an expired marker. */
export function legacyIssueBody(
  filePath,
  line,
  expires,
  note,
  daysExpired,
  slug = "Skords-01/Sergeant",
) {
  return [
    legacyIssueMarker(filePath, line, expires),
    "",
    `**File:** [\`${filePath}:${line}\`](https://github.com/${slug}/blob/main/${filePath}#L${line})`,
    `**Expired:** ${expires} (${daysExpired} day${daysExpired === 1 ? "" : "s"} ago)`,
    note ? `**Note:** ${note}` : "",
    "",
    "An `AI-LEGACY` marker has passed its `expires` date. Please either:",
    "",
    "1. **Remove the legacy code path** the marker was protecting and delete the marker.",
    "2. **Push the date out** with a brief PR-message rationale (e.g. blocked on upstream migration).",
    "",
    "Hard Rule #10 (lifecycle markers) — see [`AGENTS.md`](https://github.com/" +
      slug +
      "/blob/main/AGENTS.md#10-lifecycle-markers).",
  ]
    .filter(Boolean)
    .join("\n");
}

// ── File walker ──────────────────────────────────────────────────────────────

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(full);
    } else if (entry.isFile()) {
      // Cheap extension-based filter before stat() / read().
      const dot = entry.name.lastIndexOf(".");
      if (dot < 0) continue;
      const ext = entry.name.slice(dot);
      if (!SCAN_EXTS.has(ext)) continue;
      yield full;
    }
  }
}

export function gatherMarkers({
  rootDir = REPO_ROOT,
  today = todayISO(),
  dueSoonDays = DEFAULT_DUE_SOON_DAYS,
} = {}) {
  const findings = [];
  for (const file of walk(rootDir)) {
    const rel = relative(rootDir, file);
    if (SKIP_FILES.has(rel)) continue;
    if (SKIP_FILE_PREFIXES.some((p) => rel.startsWith(p))) continue;

    let content;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (!content.includes("AI-LEGACY")) continue;

    for (const m of extractMarkers(content)) {
      const status = classifyExpiry(m.expires, { today, dueSoonDays });
      findings.push({
        file: rel,
        line: m.line,
        expires: m.expires,
        note: m.note,
        issueRef: extractIssueRef(m.note),
        status,
        daysUntilExpiry: daysBetween(today, m.expires),
      });
    }
    for (const mm of extractMalformed(content)) {
      findings.push({
        file: rel,
        line: mm.line,
        expires: null,
        note: mm.snippet,
        status: "malformed",
        daysUntilExpiry: null,
      });
    }
  }
  // Stable sort: expired first, then by file/line.
  const order = { expired: 0, malformed: 1, "due-soon": 2, fresh: 3 };
  findings.sort((a, b) => {
    const ds = order[a.status] - order[b.status];
    if (ds !== 0) return ds;
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    return a.line - b.line;
  });
  return findings;
}

// ── HTML dashboard ───────────────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderHtml(findings, { today = todayISO() } = {}) {
  const totals = { expired: 0, malformed: 0, "due-soon": 0, fresh: 0 };
  for (const f of findings) totals[f.status]++;

  const rows = findings
    .map((f) => {
      const statusLabel =
        f.status === "expired"
          ? `Expired (${Math.abs(f.daysUntilExpiry)}d)`
          : f.status === "due-soon"
            ? `Due soon (${f.daysUntilExpiry}d)`
            : f.status === "malformed"
              ? "Malformed"
              : `Fresh (${f.daysUntilExpiry}d)`;
      return `<tr class="${f.status}">
  <td><code>${escapeHtml(f.file)}:${f.line}</code></td>
  <td class="status">${escapeHtml(statusLabel)}</td>
  <td>${escapeHtml(f.expires || "—")}</td>
  <td>${escapeHtml(f.note || "")}</td>
</tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Sergeant — AI-LEGACY Marker Dashboard (${escapeHtml(today)})</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 2rem; color: #111; }
  h1 { margin-top: 0; }
  .summary { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
  .summary .chip { padding: 0.5rem 0.75rem; border-radius: 6px; font-weight: 600; }
  .chip.fresh { background: #d4edda; color: #155724; }
  .chip.due-soon { background: #fff3cd; color: #856404; }
  .chip.expired { background: #f8d7da; color: #721c24; }
  .chip.malformed { background: #e2e3e5; color: #383d41; }
  table { border-collapse: collapse; width: 100%; font-size: 14px; }
  th, td { padding: 0.4rem 0.6rem; text-align: left; border-bottom: 1px solid #eee; vertical-align: top; }
  th { background: #f6f8fa; position: sticky; top: 0; }
  tr.expired { background: #fdecea; }
  tr.due-soon { background: #fff8e1; }
  tr.malformed { background: #f0f0f0; color: #444; }
  tr.fresh td.status { color: #155724; }
  tr.due-soon td.status { color: #856404; }
  tr.expired td.status { color: #721c24; }
  code { background: #f6f8fa; padding: 1px 4px; border-radius: 3px; font-size: 13px; }
  p.meta { color: #666; font-size: 13px; }
</style>
</head>
<body>
<h1>Sergeant — AI-LEGACY Marker Dashboard</h1>
<p class="meta">Generated <strong>${escapeHtml(today)}</strong> by <code>scripts/check-ai-legacy.mjs</code>. Marker syntax enforced by <code>sergeant-design/ai-marker-syntax</code>.</p>
<div class="summary">
  <div class="chip fresh">Fresh: ${totals.fresh}</div>
  <div class="chip due-soon">Due soon: ${totals["due-soon"]}</div>
  <div class="chip expired">Expired: ${totals.expired}</div>
  <div class="chip malformed">Malformed: ${totals.malformed}</div>
</div>
<table>
<thead>
<tr>
  <th>Location</th>
  <th>Status</th>
  <th>Expires</th>
  <th>Note</th>
</tr>
</thead>
<tbody>
${rows || '<tr><td colspan="4">No AI-LEGACY markers found.</td></tr>'}
</tbody>
</table>
</body>
</html>
`;
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
            color: label === "tech-debt" ? "5319e7" : "d93f0b",
          }),
        });
      } catch {
        // Race-creation tolerated.
      }
    }
  }
}

async function findExistingIssue(filePath, line, expires) {
  const slug = repoSlug();
  const marker = legacyIssueMarker(filePath, line, expires);
  const q = encodeURIComponent(
    `repo:${slug} is:issue is:open in:body "${marker}"`,
  );
  const data = await githubFetch(`/search/issues?q=${q}&per_page=1`);
  return data.total_count > 0 ? data.items[0] : null;
}

async function createIssue(finding, daysExpired) {
  const slug = repoSlug();
  return githubFetch(`/repos/${slug}/issues`, {
    method: "POST",
    body: JSON.stringify({
      title: legacyIssueTitle(finding.file, finding.line, finding.expires),
      body: legacyIssueBody(
        finding.file,
        finding.line,
        finding.expires,
        finding.note,
        daysExpired,
        slug,
      ),
      labels: LABELS,
    }),
  });
}

// ── Issue-reference validation ───────────────────────────────────────────────

// Recognises any of:
//   #123              bare issue number
//   GH-123            GitHub shorthand
//   issues/123        path fragment (full URL also matches)
const RX_ISSUE_REF = /#\d+|GH-\d+|issues\/\d+/i;

/**
 * Returns the issue reference found in the marker's rationale note, or
 * `null` if none is present.
 *
 * Hard Rule #10 requires every `AI-LEGACY` marker to include a tracking
 * issue so the work is never invisible. Example:
 *
 *     // AI-LEGACY: expires 2026-09-01 #1234 migrate to new SDK
 */
export function extractIssueRef(note) {
  if (!note) return null;
  const m = RX_ISSUE_REF.exec(note);
  return m ? m[0] : null;
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    check: false,
    json: false,
    issues: false,
    dashboard: null,
    requireIssue: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--check") args.check = true;
    else if (a === "--json") args.json = true;
    else if (a === "--issues") args.issues = true;
    else if (a === "--require-issue") args.requireIssue = true;
    else if (a === "--dashboard") args.dashboard = argv[++i];
    else if (a.startsWith("--dashboard=")) args.dashboard = a.split("=", 2)[1];
  }
  return args;
}

function printHumanSummary(findings) {
  const totals = { expired: 0, malformed: 0, "due-soon": 0, fresh: 0 };
  for (const f of findings) totals[f.status]++;
  const noIssue = findings.filter(
    (f) => f.status !== "malformed" && !f.issueRef,
  );

  console.log(`AI-LEGACY scan — ${findings.length} marker(s) found`);
  console.log(
    `  expired: ${totals.expired}    due-soon: ${totals["due-soon"]}    fresh: ${totals.fresh}    malformed: ${totals.malformed}    no-issue-ref: ${noIssue.length}`,
  );
  console.log("");

  if (totals.expired) {
    console.log("Expired:");
    for (const f of findings.filter((x) => x.status === "expired")) {
      console.log(
        `  ❌ ${f.file}:${f.line}  expires=${f.expires}  (${Math.abs(f.daysUntilExpiry)}d ago)${f.note ? ` — ${f.note}` : ""}`,
      );
    }
  }
  if (totals.malformed) {
    console.log("Malformed (missing `expires YYYY-MM-DD`):");
    for (const f of findings.filter((x) => x.status === "malformed")) {
      console.log(`  ⚠  ${f.file}:${f.line}  ${f.note}`);
    }
  }
  if (noIssue.length) {
    console.log("No issue reference (add `#NNN` to the marker rationale):");
    for (const f of noIssue) {
      console.log(
        `  ⚠  ${f.file}:${f.line}  expires=${f.expires}${f.note ? ` — ${f.note}` : ""}`,
      );
    }
  }
  if (totals["due-soon"]) {
    console.log("Due soon:");
    for (const f of findings.filter((x) => x.status === "due-soon")) {
      console.log(
        `  ⏳ ${f.file}:${f.line}  expires=${f.expires}  (${f.daysUntilExpiry}d)${f.note ? ` — ${f.note}` : ""}`,
      );
    }
  }
}

async function maybeCreateIssues(findings) {
  const dryRun = Boolean(process.env.DRY_RUN);
  const expired = findings.filter((f) => f.status === "expired");
  if (!expired.length) {
    console.log("No expired AI-LEGACY markers — nothing to file.");
    return;
  }
  if (!dryRun) await ensureLabels();
  let created = 0;
  let skipped = 0;
  for (const f of expired) {
    if (dryRun) {
      console.log(
        `[dry-run] would file issue for ${f.file}:${f.line} (expires=${f.expires})`,
      );
      continue;
    }
    const existing = await findExistingIssue(f.file, f.line, f.expires);
    if (existing) {
      skipped++;
      continue;
    }
    await createIssue(f, Math.abs(f.daysUntilExpiry));
    created++;
  }
  console.log(
    `AI-LEGACY issues — created: ${created}, skipped (already open): ${skipped}.`,
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dueSoonDays = Number(
    process.env.AI_LEGACY_DUE_SOON || DEFAULT_DUE_SOON_DAYS,
  );
  const findings = gatherMarkers({ dueSoonDays });

  if (args.dashboard) {
    const out = resolve(REPO_ROOT, args.dashboard);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, renderHtml(findings));
    console.log(`Wrote ${relative(REPO_ROOT, out)}`);
  }

  if (args.json) {
    process.stdout.write(JSON.stringify({ findings }, null, 2) + "\n");
  } else if (!args.dashboard) {
    printHumanSummary(findings);
  }

  if (args.issues) {
    await maybeCreateIssues(findings);
  }

  if (args.check) {
    const expired = findings.filter((f) => f.status === "expired").length;
    const malformed = findings.filter((f) => f.status === "malformed").length;
    const noIssue = args.requireIssue
      ? findings.filter((f) => f.status !== "malformed" && !f.issueRef).length
      : 0;
    if (expired || malformed || noIssue) {
      const parts = [];
      if (expired) parts.push(`${expired} expired`);
      if (malformed) parts.push(`${malformed} malformed`);
      if (noIssue) parts.push(`${noIssue} without issue ref (--require-issue)`);
      console.error(
        `\n❌ AI-LEGACY violations: ${parts.join(", ")} — see above.`,
      );
      process.exit(1);
    }
    console.log("\n✅ All AI-LEGACY markers are within their expiry window.");
  }
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
