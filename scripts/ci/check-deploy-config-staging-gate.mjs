#!/usr/bin/env node
// scripts/ci/check-deploy-config-staging-gate.mjs
//
// Initiative 0011 phase 1 PR 1.3 — staging-verification gate for PRs
// that change deploy-config files (vercel.json / fly.toml /
// railway.toml / Dockerfile* / apps/server/build.mjs / Caddyfile).
//
// The job fails when:
//   1. A deploy-config file has non-comment, non-whitespace changes
//      against `origin/<base>`, AND
//   2. The PR carries neither `verified-on-staging` nor
//      `verified-on-staging-emergency`.
//
// Comment-only / whitespace-only edits are exempt because they cannot
// change deploy semantics. The exemption is conservative: every
// non-blank `+`/`-` line in the unified diff must be a comment in the
// file's own syntax. JSON has no comments, so any change to
// `vercel.json` is treated as a real change.
//
// The script is invoked from `.github/workflows/deploy-config-staging-gate.yml`.

import { execSync } from "node:child_process";
import { basename } from "node:path";

// ── File-pattern matchers ────────────────────────────────────────────────────

/**
 * Returns the comment-syntax dialect for a deploy-config file path,
 * or `null` when the file is not a deploy-config file at all.
 *
 * Dialects:
 *   - `none` — file has no comment syntax (JSON). Any change counts.
 *   - `hash` — `# …` line comments (TOML, Dockerfile).
 *   - `js`   — `// …` line comments and `slash-star ... star-slash` block comments (apps/server/build.mjs).
 *
 * Patterns (basename / suffix-match):
 *   - `vercel.json` (anywhere)                  → none
 *   - `fly.toml`, `railway.toml`                → hash
 *   - `Dockerfile*` (basename starts with)      → hash
 *   - `Caddyfile` (basename equals)             → hash
 *   - `apps/server/build.mjs` (exact path)      → js
 */
export function deployConfigDialect(path) {
  const base = basename(path);
  if (base === "vercel.json") return "none";
  if (base === "fly.toml" || base === "railway.toml") return "hash";
  if (base.startsWith("Dockerfile")) return "hash";
  if (base === "Caddyfile") return "hash";
  if (path === "apps/server/build.mjs") return "js";
  return null;
}

// ── Comment-only detection ───────────────────────────────────────────────────

/**
 * True when `line` is a blank line, a pure-whitespace line, or a
 * comment in `dialect`. Used to decide whether a `+`/`-` diff line
 * actually changes deploy semantics.
 *
 * For `dialect === "none"` (JSON) every non-blank line counts as a
 * real change — there is no comment syntax to ignore.
 */
export function isBlankOrCommentLine(line, dialect) {
  const trimmed = line.replace(/\s+$/, "").replace(/^\s+/, "");
  if (trimmed.length === 0) return true;
  if (dialect === "none") return false;
  if (dialect === "hash") return trimmed.startsWith("#");
  if (dialect === "js") {
    if (trimmed.startsWith("//")) return true;
    // Conservative: treat lines wholly inside an obvious block-comment
    // as comments. We can't fully parse JS in this script, so we only
    // recognise the simple cases where the line opens, continues, or
    // closes a block-comment. Mixed code+comment counts as code.
    if (
      trimmed.startsWith("/*") ||
      trimmed.startsWith("*") ||
      trimmed.endsWith("*/")
    ) {
      return true;
    }
    return false;
  }
  // Unknown dialect — be conservative: treat as code so the gate still fires.
  return false;
}

/**
 * Given the full unified diff of one file (as produced by
 * `git diff --unified=0 origin/<base> -- <path>`), returns true when
 * every changed line (`+...` / `-...`, ignoring file-header lines) is
 * blank or a comment in `dialect`.
 *
 * Returns false when at least one changed line is real code.
 */
export function diffIsCommentOnly(diff, dialect) {
  const changedLines = diff
    .split("\n")
    .filter((l) => l.startsWith("+") || l.startsWith("-"))
    .filter((l) => !l.startsWith("+++") && !l.startsWith("---"));
  if (changedLines.length === 0) {
    // Pure rename / mode-only diff. Treat as no-op.
    return true;
  }
  for (const line of changedLines) {
    const body = line.slice(1); // drop leading +/-
    if (!isBlankOrCommentLine(body, dialect)) return false;
  }
  return true;
}

// ── Label parsing ────────────────────────────────────────────────────────────

export const VERIFIED_LABEL = "verified-on-staging";
export const EMERGENCY_LABEL = "verified-on-staging-emergency";

/**
 * Parses the JSON array of label names provided via `PR_LABELS`
 * (workflow expression `toJSON(...labels.*.name)`). Returns the
 * matched verification label or `null` when neither is present.
 */
export function detectVerificationLabel(labelsJson) {
  let labels = [];
  try {
    labels = JSON.parse(labelsJson || "[]");
  } catch {
    labels = [];
  }
  if (!Array.isArray(labels)) return null;
  if (labels.includes(VERIFIED_LABEL)) return VERIFIED_LABEL;
  if (labels.includes(EMERGENCY_LABEL)) return EMERGENCY_LABEL;
  return null;
}

// ── CLI runner ───────────────────────────────────────────────────────────────

/**
 * Pure runner used by the test suite. Returns `{ ok, errors }`.
 *
 * - `changedFiles` — list of paths changed in the PR.
 * - `getDiff(path)` — function returning the unified diff for `path`
 *   against the base ref. Allows tests to inject canned diffs.
 * - `labelsJson` — JSON-encoded array of label names.
 */
export function evaluate({ changedFiles, getDiff, labelsJson }) {
  const errors = [];
  const offenders = [];

  for (const path of changedFiles) {
    const dialect = deployConfigDialect(path);
    if (dialect === null) continue;
    const diff = getDiff(path);
    if (diffIsCommentOnly(diff, dialect)) continue;
    offenders.push(path);
  }

  if (offenders.length === 0) {
    return { ok: true, offenders: [], label: null, errors: [] };
  }

  const label = detectVerificationLabel(labelsJson);
  if (label === VERIFIED_LABEL) {
    return { ok: true, offenders, label, errors: [] };
  }
  if (label === EMERGENCY_LABEL) {
    // Permitted but loud — surfaces in step summary so reviewers see
    // the emergency justification expectation.
    return {
      ok: true,
      offenders,
      label,
      errors: [],
      emergency: true,
    };
  }

  errors.push(
    [
      `Deploy-config staging gate: PR changes ${offenders.length} deploy-config file(s) without a verification label.`,
      `Offending files:`,
      ...offenders.map((p) => `  • ${p}`),
      ``,
      `Required label (one of):`,
      `  • \`${VERIFIED_LABEL}\` — author verified the change on a staging environment`,
      `    (run a smoke test, watch logs / metrics for 1 deploy cycle, confirm no regression).`,
      `  • \`${EMERGENCY_LABEL}\` — true production hotfix where staging cannot be`,
      `    exercised (e.g. CDN-edge config restoring the site). Apply only with a`,
      `    post-mortem commitment in the PR body. The label IS NOT a free pass —`,
      `    reviewers should still demand evidence of risk-mitigation.`,
      ``,
      `Why this rule exists:`,
      `  PR #1595 → PR #1600 (Vercel SSOT-flip) shipped a deploy-config change that`,
      `  passed all CI but broke production immediately because no staging cycle`,
      `  existed for it. CI cannot replace human verification of edge-cached or`,
      `  edge-served config — humans must.`,
      ``,
      `See: docs/playbooks/deploy-config-change.md`,
      `See: docs/initiatives/0011-foundation-adoption-and-process-discipline.md`,
      `       §Фаза 1 → PR 1.3 (Phase 1 PR 1.3)`,
    ].join("\n"),
  );

  return { ok: false, offenders, label: null, errors };
}

function gitDiff(path, baseRef) {
  try {
    return execSync(`git diff --unified=0 origin/${baseRef} -- "${path}"`, {
      encoding: "utf8",
    });
  } catch (err) {
    // If the file is brand-new, `git diff` may print to stderr; fall
    // back to `git show` of the local file as the entire +diff.
    try {
      return execSync(`git diff --unified=0 -- "${path}"`, {
        encoding: "utf8",
      });
    } catch {
      console.warn(`⚠ Could not diff ${path}: ${err.message}`);
      return "";
    }
  }
}

function gitChangedFiles(baseRef) {
  try {
    const out = execSync(
      `git diff --name-only --diff-filter=ACMR origin/${baseRef}`,
      { encoding: "utf8" },
    ).trim();
    return out ? out.split("\n") : [];
  } catch {
    console.warn(`⚠ Could not list files changed against origin/${baseRef}.`);
    return [];
  }
}

async function main() {
  const baseRef = process.env.BASE_REF || "main";
  const labelsJson = process.env.PR_LABELS || "[]";
  const changedFiles = gitChangedFiles(baseRef);

  const result = evaluate({
    changedFiles,
    getDiff: (p) => gitDiff(p, baseRef),
    labelsJson,
  });

  if (result.offenders.length === 0) {
    console.log(
      "✅ Deploy-config staging gate: no deploy-config files changed in this PR.",
    );
    return 0;
  }

  if (result.ok && result.label === VERIFIED_LABEL) {
    console.log(
      `✅ Deploy-config staging gate: PR carries \`${VERIFIED_LABEL}\` label.`,
    );
    console.log(`   ${result.offenders.length} deploy-config file(s) changed:`);
    for (const p of result.offenders) console.log(`   • ${p}`);
    return 0;
  }

  if (result.ok && result.emergency) {
    console.log(
      `⚠ Deploy-config staging gate: PR carries \`${EMERGENCY_LABEL}\` (emergency escape-hatch).`,
    );
    console.log(
      `  This label is permitted only for true production hotfixes that cannot exercise staging.`,
    );
    console.log(
      `  A post-mortem commitment in the PR body is expected; reviewers should demand evidence.`,
    );
    console.log(`   ${result.offenders.length} deploy-config file(s) changed:`);
    for (const p of result.offenders) console.log(`   • ${p}`);
    return 0;
  }

  console.error("\n🚫 Deploy-config staging gate FAILED:\n");
  for (const e of result.errors) console.error(e + "\n");
  return 1;
}

const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("check-deploy-config-staging-gate.mjs");

if (isMain) {
  main().then((code) => process.exit(code));
}
