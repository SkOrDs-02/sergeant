#!/usr/bin/env node
/**
 * Checks pnpm-overrides.md for stale entries: any `Last reviewed:` date older
 * than 90 days triggers a warning on stdout. Exits with code 0 always — this
 * is a warning-only lint, not a hard block.
 *
 * Run via `pnpm lint:overrides`.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const overridesDocPath = join(repoRoot, "pnpm-overrides.md");

if (!existsSync(overridesDocPath)) {
  console.warn(
    "[check-pnpm-overrides-staleness] WARNING: pnpm-overrides.md not found. " +
      "Create it per docs/governance/pnpm-overrides-policy.md.",
  );
  process.exit(0);
}

const content = readFileSync(overridesDocPath, "utf8");

// Parse "Last reviewed: YYYY-MM-DD" lines
const reviewedPattern = /\*\*Last reviewed:\*\*\s+(\d{4}-\d{2}-\d{2})/g;
const sectionPattern = /^## (`[^`]+`)/gm;

// Collect section headings in order
const sections = [];
let sectionMatch;
while ((sectionMatch = sectionPattern.exec(content)) !== null) {
  sections.push({ name: sectionMatch[1], index: sectionMatch.index });
}

// Collect review dates in order
const reviewDates = [];
let reviewMatch;
while ((reviewMatch = reviewedPattern.exec(content)) !== null) {
  reviewDates.push({ date: reviewMatch[1], index: reviewMatch.index });
}

const STALE_DAYS = 90;
const now = Date.now();
const warnings = [];

for (let i = 0; i < reviewDates.length; i++) {
  const { date, index } = reviewDates[i];

  // Find the closest preceding section heading
  let sectionName = "(unknown)";
  for (let j = sections.length - 1; j >= 0; j--) {
    if (sections[j].index < index) {
      sectionName = sections[j].name;
      break;
    }
  }

  const reviewedAt = new Date(date).getTime();
  if (Number.isNaN(reviewedAt)) {
    warnings.push(
      `  - ${sectionName}: unparseable date "${date}" — please fix.`,
    );
    continue;
  }

  const ageDays = Math.floor((now - reviewedAt) / (1000 * 60 * 60 * 24));
  if (ageDays > STALE_DAYS) {
    warnings.push(
      `  - ${sectionName}: last reviewed ${date} (${ageDays} days ago) — review overdue.`,
    );
  }
}

if (warnings.length > 0) {
  console.warn(
    `\n[check-pnpm-overrides-staleness] WARNING — ${warnings.length} stale override(s):\n`,
  );
  for (const w of warnings) console.warn(w);
  console.warn(
    "\nUpdate `Last reviewed:` dates in pnpm-overrides.md after reviewing each entry.",
  );
} else {
  const checked = reviewDates.length;
  console.log(
    `[check-pnpm-overrides-staleness] OK — ${checked} override(s) reviewed within ${STALE_DAYS} days.`,
  );
}

// Exit 0 always — warning only.
process.exit(0);
