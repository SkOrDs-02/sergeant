// scripts/__tests__/ci-dedupe-gate.test.mjs
//
// Shape-regression tests for the `pnpm dedupe --check` CI gate added in
// audit item P2-1 (docs/90-work/audits/2026-05-13-testing-devx-roast.md).
//
// The gate itself is a single line in `.github/workflows/ci.yml`, which is
// cheap to remove or weaken (e.g. by a copy-paste refactor that wraps it in
// `continue-on-error: true` to "unblock CI"). These tests parse the workflow
// at the string level and assert two invariants:
//
//   1. happy path — a step inside the `check` job runs `pnpm dedupe --check`.
//   2. edge case — that step is fail-stop: no `continue-on-error: true`, no
//      shell `|| true` / `|| exit 0` escape that would silently swallow a
//      non-zero exit code from pnpm.
//
// We deliberately use a small, dependency-free YAML walker — pulling in
// `yaml` or `js-yaml` as a devDep just for one workflow shape test would be
// a worse trade than a 30-line scanner.
//
// Run with:  node --test scripts/__tests__/ci-dedupe-gate.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKFLOW_PATH = resolve(
  __dirname,
  "..",
  "..",
  ".github",
  "workflows",
  "ci.yml",
);

/**
 * Extracts the YAML block under a top-level `<jobName>:` key inside the
 * `jobs:` mapping. Returns the raw text between the job header and the next
 * sibling job header (lines that match `^  [a-z]` at the same indent level).
 *
 * We rely on the canonical 2-space indent that the repo's prettier config
 * enforces for `.github/workflows/*.yml` — any drift here would itself be a
 * lint failure long before this test runs.
 */
function extractJobBlock(workflow, jobName) {
  const lines = workflow.split("\n");
  const headerRe = new RegExp(`^  ${jobName}:\\s*$`);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headerRe.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ {2}[a-zA-Z_][a-zA-Z0-9_-]*:\s*$/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

/**
 * Splits a job block into individual step blocks. Each step starts with a
 * `- name:` or `- uses:` token at the 6-space indent that the workflow uses
 * inside `steps:`. Returns the array of raw step texts (including their
 * leading `-`).
 */
function extractSteps(jobBlock) {
  const lines = jobBlock.split("\n");
  const steps = [];
  let current = null;
  for (const line of lines) {
    if (/^ {6}- (name|uses):/.test(line)) {
      if (current !== null) steps.push(current);
      current = line;
    } else if (current !== null) {
      current += "\n" + line;
    }
  }
  if (current !== null) steps.push(current);
  return steps;
}

const WORKFLOW = readFileSync(WORKFLOW_PATH, "utf-8");
const CHECK_JOB = extractJobBlock(WORKFLOW, "check");

test("happy path: `check` job contains a `pnpm dedupe --check` step", () => {
  assert.ok(
    CHECK_JOB,
    "expected `.github/workflows/ci.yml` to declare a `check:` job under `jobs:`",
  );

  const steps = extractSteps(CHECK_JOB);
  assert.ok(
    steps.length > 0,
    "expected `check` job to declare at least one step",
  );

  const dedupeSteps = steps.filter((s) =>
    /^\s*run:\s*pnpm dedupe --check\s*$/m.test(s),
  );
  assert.equal(
    dedupeSteps.length,
    1,
    "expected exactly one `pnpm dedupe --check` step in the `check` job — " +
      "P2-1 gate from docs/90-work/audits/2026-05-13-testing-devx-roast.md",
  );

  const installIdx = steps.findIndex((s) =>
    /^\s*run:\s*pnpm install --frozen-lockfile\s*$/m.test(s),
  );
  const dedupeIdx = steps.findIndex((s) =>
    /^\s*run:\s*pnpm dedupe --check\s*$/m.test(s),
  );
  assert.ok(
    installIdx !== -1,
    "expected `check` job to install deps before any other step",
  );
  assert.ok(
    dedupeIdx > installIdx,
    "expected `pnpm dedupe --check` to run AFTER `pnpm install --frozen-lockfile` — " +
      "dedupe needs a resolved tree to inspect",
  );
});

test("edge case: dedupe step is fail-stop (no continue-on-error / `|| true`)", () => {
  assert.ok(CHECK_JOB, "expected `check:` job to exist (see previous test)");

  const dedupeStep = extractSteps(CHECK_JOB).find((s) =>
    /^\s*run:\s*pnpm dedupe --check\s*$/m.test(s),
  );
  assert.ok(
    dedupeStep,
    "expected a `pnpm dedupe --check` step (see previous test)",
  );

  assert.doesNotMatch(
    dedupeStep,
    /continue-on-error:\s*true/,
    "P2-1 gate must NOT set `continue-on-error: true` — that silently swallows " +
      "the lockfile-drift signal we just added the step to catch",
  );

  assert.doesNotMatch(
    dedupeStep,
    /\|\|\s*(true|exit\s+0|:)\s*$/m,
    "P2-1 gate must NOT pipe a `|| true` / `|| exit 0` escape — see above",
  );

  // Sanity: the step must NOT live inside an `if:` guard that disables it on
  // pull_request events (the only event class we currently run CI on). We
  // accept generic guards like the `audit-exception` label gate used by the
  // `pnpm audit` steps above; just assert the literal `if: false` /
  // `if: github.event_name != 'pull_request'` foot-guns are absent.
  assert.doesNotMatch(
    dedupeStep,
    /if:\s*false/,
    "P2-1 gate must not be disabled with `if: false`",
  );
  assert.doesNotMatch(
    dedupeStep,
    /if:\s*github\.event_name\s*!=\s*['"]pull_request['"]/,
    "P2-1 gate must not be scoped away from pull_request events",
  );
});
