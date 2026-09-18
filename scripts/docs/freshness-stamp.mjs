#!/usr/bin/env node
// scripts/docs/freshness-stamp.mjs
//
// Shared `--check` helper for docs generators that stamp the current date
// into their output (`> **Last validated:** <today> …` freshness headers,
// trust-badge `_оновлено <today>_`).
//
// Problem this solves: those generators render `new Date()` into the file,
// so an exact string comparison between the committed file and a fresh
// render goes red the day AFTER every regeneration — the gate fails on
// date-only drift even though no real content changed (#3302 pinned the
// author handle but left the date). Daily regeneration (`pnpm docs:gen-daily`)
// keeps bumping the on-disk stamp, so write mode stays as-is; only the
// `--check` comparison must ignore the volatile date lines.
//
// Usage in a generator's `--check` branch:
//
//   import { isStaleIgnoringDateStamp } from "./freshness-stamp.mjs";
//   if (isStaleIgnoringDateStamp(current, next)) { …fail… }
//
// Pure module, no dependencies — safe for the install-free docs-scripts
// test job.

// AI-CONTEXT: the freshness header is a single line, so masking the whole
// line also masks the derived `**Next review:**` date that lives on it.
// `> **Last validated:** 2026-06-09 by docs:gen-x. **Next review:** 2026-09-07.`
export const LAST_VALIDATED_LINE =
  /^>\s*\*\*Last (?:validated|touched):\*\*.*$/gm;

// Trust badge embeds the date mid-line next to meaningful state (the badge
// status), so mask only the date token, not the line:
// `> 🟢 **Docs trust: OK** — _оновлено 2026-06-11 via \`pnpm docs:gen-trust-badge\`_`
export const TRUST_BADGE_DATE = /_оновлено \d{4}-\d{2}-\d{2} via /g;

// Daily relative counter rendered by generate-today.mjs:
// `… _(due 2026-06-09, **2d overdue**)_` — the day count ticks every
// midnight, the meaningful state (which doc, which due date) stays in the
// comparison. Mirrors the freshness-dashboard precedent of ignoring daily
// relative counters in --check mode.
export const RELATIVE_OVERDUE_COUNTER = /\*\*\d+d overdue\*\*/g;

const PLACEHOLDER = "<volatile-date-stamp>";

/**
 * Replace every volatile date-stamp match with a fixed placeholder so two
 * renders that differ only in stamp dates compare equal.
 */
export function normalizeDateStamps(content, patterns = [LAST_VALIDATED_LINE]) {
  let out = content;
  for (const pattern of patterns) {
    out = out.replace(pattern, PLACEHOLDER);
  }
  return out;
}

/**
 * `--check` comparison: true when `current` (committed file) and `next`
 * (fresh render) differ in anything OTHER than the volatile date stamps.
 * A missing/empty `current` is always stale.
 */
export function isStaleIgnoringDateStamp(
  current,
  next,
  patterns = [LAST_VALIDATED_LINE],
) {
  return (
    normalizeDateStamps(current, patterns) !==
    normalizeDateStamps(next, patterns)
  );
}
