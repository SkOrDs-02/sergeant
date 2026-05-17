#!/usr/bin/env node
// scripts/docs/generate-today.mjs
//
// Daily brief generator. Scans the same open-work set as
// `generate-open-work.mjs`, applies a "what should I work on today?"
// priority filter, and renders `docs/today.md` — a single-page artifact
// the maintainer opens in the morning to decide what to give agents.
//
// Sections of `today.md`:
//   1. Top items — up to N (default 5) actionable documents with a
//      `Phase X next` / `Stage X pending` / `Phase X blocked` / similar
//      marker in their Status header, sorted by file mtime descending
//      (most recently touched = freshest context).
//   2. Overdue review — documents whose `Next review:` date is in the past.
//   3. WIP warnings — per-tracker count vs limits, surfaced only when at
//      least one tracker is at soft or hard.
//   4. Quick links — open-work, freshness dashboard, hard rules.
//
// Usage:
//   node scripts/docs/generate-today.mjs            # write `docs/today.md`
//   node scripts/docs/generate-today.mjs --check    # CI gate (fail on diff)
//
// Exit codes:
//   0  — write succeeded OR --check confirms no diff
//   1  — --check diff detected OR I/O error
//
// Designed to be safe to run from a daily cron — the output is fully
// deterministic given the same input set, so idempotent commits are easy.

import { readFileSync, writeFileSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  collectOpenWork,
  TRACKERS,
} from "./generate-open-work.mjs";
import { evaluate, loadLimits } from "./check-wip-limits.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "../..");
const OUTPUT_PATH = resolve(REPO_ROOT, "docs/today.md");

const args = new Set(process.argv.slice(2));
const CHECK_MODE = args.has("--check");

// How many top-priority items to surface. Beyond ~7 the human brain
// stops ranking — Dunbar's local working-set rule of thumb.
const TOP_N = 7;

// Detect "next phase / next stage" markers in Status text. Order of
// keywords is intentional: `blocked` surfaces first because unblocking
// is usually the highest-leverage action of the day.
//
// Examples this catches:
//   "Phase 2 next" / "Stage 13 IN PROGRESS" / "Phase 5.1 pending"
//   "Phase 7 blocked" / "Stage 4 to do"
const RE_PHASE_NEXT =
  /(?:Phase|Stage)\s+([\d.]+)[^\n]{0,60}?(blocked|next|pending|in\s+progress|todo|to\s+do)/i;

// Detect `Next review:` date in `> **Last validated:** … **Next review:** YYYY-MM-DD …`
const RE_NEXT_REVIEW =
  /\*\*Next review:\*\*\s*(\d{4}-\d{2}-\d{2})/;

const TODAY = new Date().toISOString().slice(0, 10);

// ── Priority extraction ─────────────────────────────────────────────────────

/**
 * Inspect a status string and return `{ phase, kind }` for the first
 * "next phase" marker found, or `null` if the status carries no
 * actionable phase signal. `kind` is normalised to lowercase, with
 * "in progress" canonicalised to a single token.
 */
export function extractNextPhase(status) {
  const m = RE_PHASE_NEXT.exec(status);
  if (!m) return null;
  const kind = m[2].toLowerCase().replace(/\s+/g, " ");
  return { phase: m[1], kind };
}

/**
 * For a list of open-work entries (already produced by `collectOpenWork`),
 * pull the ones that carry a `Phase/Stage X next/pending/...` marker.
 * Each kept entry is decorated with `{ priorityPhase, priorityKind, mtimeMs }`
 * for downstream sorting.
 */
export function pickPriorityItems(report, repoRoot = REPO_ROOT) {
  const out = [];
  for (const { tracker, entries } of report) {
    for (const e of entries) {
      const sig = extractNextPhase(e.rawStatus);
      if (!sig) continue;
      let mtimeMs = 0;
      try {
        mtimeMs = statSync(resolve(repoRoot, e.relPath)).mtimeMs;
      } catch {
        // file vanished between collect and stat — skip silently
        continue;
      }
      out.push({
        tracker,
        ...e,
        priorityPhase: sig.phase,
        priorityKind: sig.kind,
        mtimeMs,
      });
    }
  }
  // `blocked` sorts above `next/pending/in progress` because unblocking
  // is usually the constraint. Within the same kind bucket, freshest
  // file mtime wins (recently touched = warm context).
  const kindRank = { blocked: 0 };
  out.sort((a, b) => {
    const ka = kindRank[a.priorityKind] ?? 1;
    const kb = kindRank[b.priorityKind] ?? 1;
    if (ka !== kb) return ka - kb;
    return b.mtimeMs - a.mtimeMs;
  });
  return out.slice(0, TOP_N);
}

// ── Overdue review detection ────────────────────────────────────────────────

/**
 * Walk every open-work entry and return the ones whose `Next review:`
 * date has already passed (`< today`). Returns `{ relPath, title, nextReview }`.
 */
export function pickOverdueReview(report, today = TODAY, repoRoot = REPO_ROOT) {
  const out = [];
  for (const { tracker, entries } of report) {
    for (const e of entries) {
      let body;
      try {
        body = readFileSync(resolve(repoRoot, e.relPath), "utf8");
      } catch {
        continue;
      }
      const m = RE_NEXT_REVIEW.exec(body);
      if (!m) continue;
      const due = m[1];
      if (due >= today) continue;
      out.push({
        tracker,
        relPath: e.relPath,
        linkPath: e.linkPath,
        title: e.title,
        nextReview: due,
      });
    }
  }
  // Oldest overdue first — these have rotted the longest.
  out.sort((a, b) => (a.nextReview < b.nextReview ? -1 : 1));
  return out;
}

// ── Markdown rendering ──────────────────────────────────────────────────────

function fmtPriorityItem(item) {
  // Phase descriptor — kept unformatted so the outer "**…**" wrap below
  // does not produce nested bold markers (which render as literal `**`
  // in many viewers).
  const phase =
    item.priorityKind === "in progress"
      ? `Phase ${item.priorityPhase} в роботі`
      : item.priorityKind === "blocked"
        ? `Phase ${item.priorityPhase} blocked 🚧`
        : `Phase ${item.priorityPhase} — ${item.priorityKind}`;
  return `- [\`${item.linkPath}\`](./${item.linkPath}) — ${item.title} → **${phase}** _(${item.tracker.title})_`;
}

function fmtOverdueItem(item) {
  const daysOver = Math.floor(
    (Date.parse(TODAY) - Date.parse(item.nextReview)) / 86_400_000,
  );
  return `- [\`${item.linkPath}\`](./${item.linkPath}) — ${item.title} _(due ${item.nextReview}, **${daysOver}d overdue**)_`;
}

function fmtWIPRow(row) {
  const ind =
    row.severity === "fail"
      ? "🔴 HARD"
      : row.severity === "warn"
        ? "🟡 SOFT"
        : "🟢 ok";
  return `| ${ind} | ${row.tracker.title} | ${row.count} | ${row.soft ?? "—"} / ${row.hard ?? "—"} |`;
}

function render({ priority, overdue, wipRows }) {
  const lines = [];
  lines.push("# Сьогодні в роботі");
  lines.push("");
  lines.push(
    `> **Last validated:** ${TODAY} by docs:gen-today. **Next review:** ${TODAY}.`,
  );
  lines.push(`> **Status:** Reference`);
  lines.push("");
  lines.push(
    "<!-- AUTO-GENERATED FILE. Do not edit by hand. Regenerate via `pnpm docs:gen-today`. -->",
  );
  lines.push("");
  lines.push(
    "Daily brief — згенеровано з [`open-work.md`](./open-work.md) + freshness даних. Фокус: що **зараз** дати агентам у роботу і що передивитися. Деталі — клікай на лінки.",
  );
  lines.push("");

  // ── Top priority ────────────────────────────────────────────────────────
  lines.push(`## Топ-${TOP_N} на сьогодні`);
  lines.push("");
  if (priority.length === 0) {
    lines.push(
      "_Нема items з `Phase X next` / `Stage X IN PROGRESS` / `Phase X blocked` маркерами. Або все закрито, або status headers потребують уточнення (Rule #10)._",
    );
  } else {
    lines.push(
      "Sorted: `blocked` items first, потім за `mtime` desc (свіже = warm context).",
    );
    lines.push("");
    for (const item of priority) lines.push(fmtPriorityItem(item));
  }
  lines.push("");

  // ── Overdue review ──────────────────────────────────────────────────────
  lines.push(`## Прострочений review (${overdue.length})`);
  lines.push("");
  if (overdue.length === 0) {
    lines.push("_Жодного документа не пропустило `Next review:` дату. 🎉_");
  } else {
    lines.push(
      "Документи, чия `Next review:` дата минула. Або bump date після швидкого re-read, або переведи в `Status: Closed`/`Archived`.",
    );
    lines.push("");
    const TOP_OVERDUE = 15;
    for (const item of overdue.slice(0, TOP_OVERDUE)) {
      lines.push(fmtOverdueItem(item));
    }
    if (overdue.length > TOP_OVERDUE) {
      lines.push("");
      lines.push(
        `_… ще ${overdue.length - TOP_OVERDUE} — див. [freshness dashboard](./governance/freshness-dashboard.html)._`,
      );
    }
  }
  lines.push("");

  // ── WIP warnings ────────────────────────────────────────────────────────
  const worst = wipRows.some((r) => r.severity === "fail")
    ? "fail"
    : wipRows.some((r) => r.severity === "warn")
      ? "warn"
      : "ok";
  lines.push(`## WIP load — ${worst === "ok" ? "🟢 healthy" : worst === "warn" ? "🟡 over soft" : "🔴 OVER HARD"}`);
  lines.push("");
  if (worst === "ok") {
    lines.push(
      "Усі trackers під soft-лімітом. Заводь нові ініціативи / аудити вільно.",
    );
  } else {
    lines.push(
      "Принаймні один tracker перевищив soft або hard. Подумай чи закрити старе перед відкриттям нового.",
    );
    lines.push("");
    lines.push("| Severity | Tracker | Active | Soft / Hard |");
    lines.push("| --- | --- | --- | --- |");
    for (const row of wipRows) {
      if (row.severity === "ok" || row.severity === "none") continue;
      lines.push(fmtWIPRow(row));
    }
  }
  lines.push("");

  // ── Quick links ─────────────────────────────────────────────────────────
  lines.push("## Quick links");
  lines.push("");
  lines.push("- [`open-work.md`](./open-work.md) — повний rollup усіх 7 trackers");
  lines.push(
    "- [`governance/freshness-dashboard.html`](./governance/freshness-dashboard.html) — повний freshness огляд",
  );
  lines.push("- [`AGENTS.md`](../AGENTS.md) — repo policy + hard rules + routing");
  lines.push("- [`README.md`](./README.md) — docs index (genre-grouped)");
  lines.push("");

  return lines.join("\n") + "\n";
}

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
  const report = collectOpenWork(REPO_ROOT, TRACKERS);
  const limits = loadLimits();
  const wipRows = evaluate(report, limits);

  const priority = pickPriorityItems(report);
  const overdue = pickOverdueReview(report);
  const next = render({ priority, overdue, wipRows });

  if (CHECK_MODE) {
    let current = "";
    try {
      current = readFileSync(OUTPUT_PATH, "utf8");
    } catch {
      // missing file is a check failure
    }
    if (current !== next) {
      process.stderr.write(
        `docs:gen-today --check: docs/today.md is stale. Run \`pnpm docs:gen-today\`.\n`,
      );
      process.exit(1);
    }
    process.exit(0);
  }

  writeFileSync(OUTPUT_PATH, next, "utf8");
  process.stdout.write(
    `wrote docs/today.md — ${priority.length} priority items, ${overdue.length} overdue\n`,
  );
}

const isMain = process.argv[1] === __filename;
if (isMain) main();
