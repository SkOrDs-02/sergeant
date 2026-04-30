#!/usr/bin/env node
// scripts/docs/bump-last-validated.mjs
//
// Auto-bump the canonical freshness header on staged markdown files. Wired
// into Husky + lint-staged so a doc edit automatically refreshes
// `> **Last validated:** YYYY-MM-DD by @handle. **Next review:** YYYY-MM-DD.`
// — no more "I forgot to bump the header" PRs.
//
// What it does for each file passed on argv:
//   1. Skip if the path is in `excludeGlobs` (config-driven, same as
//      check-freshness).
//   2. Skip if the file has no canonical `> **Last validated:**` header.
//   3. Skip if today's date is already in the header (idempotent).
//   4. Replace the date with today (UTC ISO).
//   5. Replace the `by @handle` with the current committer's handle (resolved
//      via `scripts/docs/author-map.json` → email → @handle, falling back to
//      the email's local-part if unmapped).
//   6. Replace `Next review:` with today + cadenceDays from
//      `freshness-config.json` (default 90).
//
// Opt-out: set env var `SERGEANT_NO_BUMP=1` before `git commit` (e.g. for
// pure typo fixes that shouldn't reset the review clock). Per the
// `--no-verify`-is-forbidden rule we do **not** support skipping the hook,
// only skipping the date bump itself.
//
// Usage:
//   node scripts/docs/bump-last-validated.mjs path/to/file.md [...]
//   SERGEANT_NO_BUMP=1 git commit -am 'docs: typo'   # bypass bump, keep hook

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_CONFIG,
  matchesAnyGlob,
  readConfigFile,
} from "./freshness-config.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "../..");
const AUTHOR_MAP_PATH = resolve(__dirname, "author-map.json");

const HEADER_LINE_LIMIT = 15;

// ── Pure helpers (exported for tests) ────────────────────────────────────────

/** Today in YYYY-MM-DD UTC. */
export function todayISO(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/** Add `days` calendar days to an ISO date string. */
export function addDays(isoDate, days) {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Resolve a git committer email to a GitHub @handle via the author-map.
 * Falls back to the email's local-part if no mapping exists.
 *
 * Pure: takes the map and email as args; never reads disk.
 */
export function resolveHandle(emailToHandle, email) {
  if (!email) return null;
  const lower = email.toLowerCase();
  if (lower in emailToHandle) return emailToHandle[lower];
  // Fallback: local-part. Strips bot suffixes like `158243933+`.
  const local = lower.split("@")[0].replace(/^[0-9]+\+/, "");
  return local || null;
}

/**
 * Detect whether the canonical freshness header is present and, if so, return
 * the current date / handle / next-review fields it carries. Returns null
 * when no canonical header exists in the first N lines.
 */
const RE_FRESHNESS_LINE =
  /^(?<prefix>>\s*\*\*Last validated:\*\*\s*)(?<lastValidated>\d{4}-\d{2}-\d{2})(?<midA>\s+by\s+)@(?<handle>[A-Za-z0-9_\-.]+)(?<midB>\.\s*\*\*Next review:\*\*\s*)(?<nextReview>\d{4}-\d{2}-\d{2})(?<suffix>\.?)\s*$/m;

export function findHeaderLine(content, lineLimit = HEADER_LINE_LIMIT) {
  const head = content.split("\n").slice(0, lineLimit).join("\n");
  const m = RE_FRESHNESS_LINE.exec(head);
  if (!m) return null;
  return {
    raw: m[0],
    lastValidated: m.groups.lastValidated,
    handle: m.groups.handle,
    nextReview: m.groups.nextReview,
    prefix: m.groups.prefix,
    midA: m.groups.midA,
    midB: m.groups.midB,
    suffix: m.groups.suffix,
  };
}

/**
 * Pure: produce a new file content with the freshness header bumped.
 * Returns { content, changed }.
 *
 * `changed` is false (and content is unchanged) when:
 *   - the file has no canonical header;
 *   - the header is already at `today` AND the same handle.
 *
 * Note: when a file is *already today's* but the handle differs, we DO bump
 * the handle (small co-author update), but we do NOT recompute `nextReview`
 * because the doc was already validated today.
 */
export function bumpHeader({
  content,
  today,
  handle,
  cadenceDays,
  lineLimit = HEADER_LINE_LIMIT,
}) {
  const found = findHeaderLine(content, lineLimit);
  if (!found) return { content, changed: false };

  const sameDate = found.lastValidated === today;
  const sameHandle = handle == null || found.handle === handle;
  if (sameDate && sameHandle) return { content, changed: false };

  const newHandle = handle ?? found.handle;
  const newNextReview = sameDate
    ? found.nextReview
    : addDays(today, cadenceDays);

  const newLine =
    found.prefix +
    today +
    found.midA +
    "@" +
    newHandle +
    found.midB +
    newNextReview +
    found.suffix;

  return { content: content.replace(found.raw, newLine), changed: true };
}

// ── Side-effectful entry points ──────────────────────────────────────────────

function loadAuthorMap(path = AUTHOR_MAP_PATH) {
  if (!existsSync(path)) return {};
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return Object.fromEntries(
    Object.entries(raw.emailToHandle || {}).map(([k, v]) => [
      k.toLowerCase(),
      v,
    ]),
  );
}

function getCommitterEmail() {
  // Honour environment overrides (used by Husky in CI / when committing as a
  // bot). Falls back to `git config user.email`.
  const env =
    process.env.GIT_AUTHOR_EMAIL ||
    process.env.GIT_COMMITTER_EMAIL ||
    process.env.SERGEANT_BUMP_EMAIL;
  if (env) return env;
  try {
    return execSync("git config user.email", { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function getCadenceDays(filePath, config) {
  return (
    config.cadenceOverrides[filePath] ??
    config.defaultCadenceDays ??
    DEFAULT_CONFIG.defaultCadenceDays
  );
}

/**
 * Process a list of file paths in-place. Returns the list of paths that were
 * modified (so the caller can re-stage them).
 */
export function bumpFiles({
  paths,
  today,
  handle,
  config,
  rootDir = REPO_ROOT,
  log = () => {},
}) {
  const modified = [];
  for (const rel of paths) {
    if (matchesAnyGlob(rel, config.excludeGlobs)) {
      log(`  skip (excluded): ${rel}`);
      continue;
    }
    const full = resolve(rootDir, rel);
    if (!existsSync(full)) continue;
    const content = readFileSync(full, "utf8");
    const cadenceDays = getCadenceDays(rel, config);
    const { content: next, changed } = bumpHeader({
      content,
      today,
      handle,
      cadenceDays,
    });
    if (!changed) {
      log(`  skip (no-op): ${rel}`);
      continue;
    }
    writeFileSync(full, next);
    modified.push(rel);
    log(`  bumped: ${rel} → ${today} (next +${cadenceDays}d)`);
  }
  return modified;
}

// ── CLI ──────────────────────────────────────────────────────────────────────

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  if (process.env.SERGEANT_NO_BUMP) {
    console.log("[bump-last-validated] SERGEANT_NO_BUMP=1 — skipping.");
    process.exit(0);
  }
  const paths = process.argv.slice(2).filter((a) => a && !a.startsWith("-"));
  if (paths.length === 0) process.exit(0);

  const config = readConfigFile();
  const emailToHandle = loadAuthorMap();
  const email = getCommitterEmail();
  const handle = resolveHandle(emailToHandle, email);
  const today = todayISO();

  const modified = bumpFiles({
    paths,
    today,
    handle,
    config,
    log: (msg) => console.log(`[bump-last-validated] ${msg}`),
  });

  if (modified.length > 0) {
    // Re-stage the files so lint-staged sees the bumped content. lint-staged
    // already re-stages files that its tasks modify, so this is belt-and-
    // suspenders — but we keep it explicit so the script also works when
    // invoked standalone (`node scripts/docs/bump-last-validated.mjs file.md`).
    try {
      execSync(`git add -- ${modified.map((p) => `'${p}'`).join(" ")}`, {
        stdio: "ignore",
      });
    } catch {
      // best-effort; lint-staged will handle it
    }
  }
}
