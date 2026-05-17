#!/usr/bin/env node
// scripts/changelog/cut-release.mjs
//
// Cut a release from the current `## [Unreleased]` section of CHANGELOG.md:
//   - rename the section to `## [YYYY-MM-DD]`
//   - insert a fresh empty `## [Unreleased]` block above it
//   - commit the change
//   - create a git tag `vYYYY.MM.DD` pointing at the new commit
//
// Initiative 0016 — author keeps writing rich manual narrative under
// Unreleased; this script just promotes it to a versioned snapshot.
// No auto-generation from commits, no semver bump.
//
// Usage:
//   pnpm changelog:cut              # cut for today (UTC date)
//   pnpm changelog:cut 2026-05-17   # cut with explicit date
//   pnpm changelog:cut --dry-run    # print planned diff, no side effects
//
// Validation gates (all fail with exit 1):
//   - Unreleased section missing
//   - Unreleased section has only headers, no bullets (refuses empty release)
//   - Working tree dirty (refuses to mix uncommitted work with release cut)
//   - Tag already exists locally or on origin
//
// Exit codes:
//   0  — cut succeeded (or dry-run completed)
//   1  — validation failure or I/O error

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "../..");
const CHANGELOG_PATH = resolve(REPO_ROOT, "CHANGELOG.md");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const dateArg = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));

const RELEASE_DATE = dateArg ?? new Date().toISOString().slice(0, 10);
const TAG = "v" + RELEASE_DATE.replaceAll("-", ".");

const RE_UNRELEASED = /^##\s+\[Unreleased\]\s*$/m;

// Empty Unreleased skeleton inserted at top after cut. Sections match
// Keep a Changelog 1.1.0 vocabulary (Added / Changed / Fixed / Removed /
// Deprecated / Security) — we ship Added / Changed / Fixed by default
// because those are the three sections used in ~all existing entries;
// author adds the others as needed.
const EMPTY_UNRELEASED = [
  "## [Unreleased]",
  "",
  "### Added",
  "",
  "### Changed",
  "",
  "### Fixed",
  "",
  "",
].join("\n");

// ── Validation helpers (exported for unit testing if added later) ──────────

/**
 * Find the byte offsets of the Unreleased section header and its content.
 * The content runs until the next `## [...]` heading or EOF.
 */
export function locateUnreleased(md) {
  const m = RE_UNRELEASED.exec(md);
  if (!m) {
    throw new Error(
      `CHANGELOG.md is missing a "## [Unreleased]" section header.`,
    );
  }
  const headerStart = m.index;
  const headerEnd = headerStart + m[0].length;
  // Find next `## […]` heading after this one.
  const nextSection = /\n## \[[^\]]+\]\s*$/m.exec(md.slice(headerEnd));
  const sectionEnd = nextSection
    ? headerEnd + nextSection.index + 1
    : md.length;
  return {
    headerStart,
    headerEnd,
    sectionEnd,
    content: md.slice(headerEnd, sectionEnd),
  };
}

/**
 * Check that the Unreleased content has at least one bullet line that
 * is not just a category header. Returns true if real content exists.
 */
export function hasRealContent(content) {
  for (const line of content.split(/\r?\n/)) {
    if (/^\s*[-*]\s+\S/.test(line)) return true;
  }
  return false;
}

/**
 * Apply the section rename + fresh Unreleased insertion. Pure — no I/O.
 */
export function rewrite(md, releaseDate) {
  const { headerStart, headerEnd, sectionEnd, content } = locateUnreleased(md);
  if (!hasRealContent(content)) {
    throw new Error(
      `Unreleased section has no bullet entries — refusing to cut an empty release.`,
    );
  }
  const before = md.slice(0, headerStart);
  const renamedHeader = `## [${releaseDate}]`;
  const renamedSection =
    renamedHeader + md.slice(headerEnd, sectionEnd);
  const after = md.slice(sectionEnd);
  return before + EMPTY_UNRELEASED + renamedSection + after;
}

// ── Git wrappers ────────────────────────────────────────────────────────────

function git(cmd) {
  return execSync(`git ${cmd}`, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function isWorkingTreeClean() {
  // `git status --porcelain` prints nothing if clean.
  return git("status --porcelain").length === 0;
}

function tagExists(tag) {
  // Local: `git tag -l <tag>` echoes the tag if present, empty otherwise.
  const local = git(`tag -l ${tag}`);
  if (local) return true;
  // Remote: ls-remote with the exact ref. Empty stdout = absent.
  try {
    const remote = git(`ls-remote --tags origin refs/tags/${tag}`);
    return remote.length > 0;
  } catch {
    // No origin / offline — fall back to local-only check.
    return false;
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
  // 1. Pre-flight validation
  if (!isWorkingTreeClean() && !DRY_RUN) {
    process.stderr.write(
      `Working tree is dirty. Commit or stash before cutting a release.\n`,
    );
    process.exit(1);
  }

  if (tagExists(TAG)) {
    process.stderr.write(
      `Tag ${TAG} already exists (local or origin). Pick a different date.\n`,
    );
    process.exit(1);
  }

  // 2. Rewrite CHANGELOG in-memory
  const before = readFileSync(CHANGELOG_PATH, "utf8");
  const after = rewrite(before, RELEASE_DATE);

  if (DRY_RUN) {
    process.stdout.write(
      `[dry-run] Would cut release ${TAG} (${RELEASE_DATE}).\n`,
    );
    process.stdout.write(
      `[dry-run] Would rewrite CHANGELOG.md: ${before.length} → ${after.length} bytes.\n`,
    );
    process.stdout.write(
      `[dry-run] Would create git tag ${TAG} on a new commit "chore(release): cut ${TAG}".\n`,
    );
    process.stdout.write(
      `[dry-run] Would NOT push — run \`git push --follow-tags origin main\` manually.\n`,
    );
    process.exit(0);
  }

  // 3. Write, commit, tag
  writeFileSync(CHANGELOG_PATH, after, "utf8");
  git("add CHANGELOG.md");
  git(`commit -m "chore(release): cut ${TAG}"`);
  git(`tag ${TAG} HEAD`);

  process.stdout.write(`✅ Cut release ${TAG} (${RELEASE_DATE}).\n`);
  process.stdout.write(`   Commit: $(git rev-parse --short HEAD)\n`);
  process.stdout.write(`   Tag:    ${TAG}\n`);
  process.stdout.write(
    `\nNext: push commit + tag together:\n  git push --follow-tags origin main\n`,
  );
}

const isMain = process.argv[1] === __filename;
if (isMain) main();
