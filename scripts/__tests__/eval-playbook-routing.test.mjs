// node --test scripts/__tests__/eval-playbook-routing.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import {
  keywordsFromFilename,
  scorePromptAgainstPlaybook,
  rankPlaybooks,
  collectPlaybookFiles,
  validateGoldenSet,
  evalCase,
} from "../eval-playbook-routing.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const SCRIPT_PATH = resolve(__dirname, "..", "eval-playbook-routing.mjs");

function makePlaybooksDir(files) {
  const dir = mkdtempSync(join(tmpdir(), "eval-pb-test-"));
  for (const f of files) {
    writeFileSync(join(dir, f), `# Playbook: ${f}\n`);
  }
  return dir;
}

const SAMPLE_PLAYBOOKS = [
  "add-api-endpoint.md",
  "add-sql-migration.md",
  "fix-failing-ci.md",
  "release.md",
  "write-e2e-test.md",
];

test("keywordsFromFilename splits and filters stop words", () => {
  assert.deepEqual(keywordsFromFilename("add-api-endpoint.md"), [
    "add",
    "api",
    "endpoint",
  ]);
  assert.deepEqual(keywordsFromFilename("fix-failing-ci.md"), [
    "fix",
    "failing",
    "ci",
  ]);
  assert.deepEqual(keywordsFromFilename("release.md"), ["release"]);
});

test("scorePromptAgainstPlaybook counts keyword hits", () => {
  const score = scorePromptAgainstPlaybook(
    "Add a new REST API endpoint to the server.",
    "add-api-endpoint.md",
  );
  assert.ok(score >= 2, `expected ≥2, got ${score}`);
});

test("scorePromptAgainstPlaybook returns 0 for unrelated prompt", () => {
  const score = scorePromptAgainstPlaybook(
    "Rotate secrets and revoke expired tokens.",
    "add-sql-migration.md",
  );
  assert.equal(score, 0);
});

test("rankPlaybooks returns expected playbook first", () => {
  const ranked = rankPlaybooks(
    "Add a new REST API endpoint with typed response shape.",
    SAMPLE_PLAYBOOKS,
  );
  assert.equal(ranked[0]?.file, "add-api-endpoint.md");
});

test("rankPlaybooks tie-breaks by filename length (shorter first)", () => {
  const files = ["release-web-and-api.md", "release.md"];
  const ranked = rankPlaybooks(
    "Ship a production release: tag and deploy.",
    files,
  );
  assert.equal(ranked[0]?.file, "release.md");
});

test("collectPlaybookFiles excludes README, INDEX, and _TEMPLATE", () => {
  const dir = makePlaybooksDir([
    "README.md",
    "INDEX.md",
    "playbook-catalog.md",
    "_TEMPLATE-decision-tree.md",
    "add-api-endpoint.md",
  ]);
  try {
    const files = collectPlaybookFiles(dir);
    assert.ok(files.includes("add-api-endpoint.md"));
    assert.ok(!files.includes("README.md"));
    assert.ok(!files.includes("INDEX.md"));
    assert.ok(!files.includes("playbook-catalog.md"));
    assert.ok(!files.includes("_TEMPLATE-decision-tree.md"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("validateGoldenSet passes a minimal valid golden file", () => {
  const dir = makePlaybooksDir(["add-api-endpoint.md", "fix-failing-ci.md"]);
  try {
    const cases = Array.from({ length: 8 }, (_, i) => ({
      id: `case-${i}`,
      kind: "match",
      prompt: "Add a new REST API endpoint to the server.",
      expectedPlaybook: "add-api-endpoint.md",
    }));
    const result = validateGoldenSet({ schemaVersion: 1, cases }, [
      "add-api-endpoint.md",
      "fix-failing-ci.md",
    ]);
    assert.equal(result.ok, true, result.errors.join("\n"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("validateGoldenSet fails when schemaVersion is wrong", () => {
  const result = validateGoldenSet(
    {
      schemaVersion: 2,
      cases: Array.from({ length: 8 }, (_, i) => ({
        id: `case-${i}`,
        kind: "match",
        prompt: "Add a new REST API endpoint to the server.",
        expectedPlaybook: "add-api-endpoint.md",
      })),
    },
    ["add-api-endpoint.md"],
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("schemaVersion")));
});

test("validateGoldenSet fails when fewer than 8 cases", () => {
  const result = validateGoldenSet(
    {
      schemaVersion: 1,
      cases: [
        {
          id: "case-1",
          kind: "match",
          prompt: "Add an endpoint.",
          expectedPlaybook: "add-api-endpoint.md",
        },
      ],
    },
    ["add-api-endpoint.md"],
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("at least 8")));
});

test("validateGoldenSet fails on duplicate ids", () => {
  const result = validateGoldenSet(
    {
      schemaVersion: 1,
      cases: Array.from({ length: 8 }, () => ({
        id: "dup",
        kind: "match",
        prompt: "Add a new REST API endpoint.",
        expectedPlaybook: "add-api-endpoint.md",
      })),
    },
    ["add-api-endpoint.md"],
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("duplicate id")));
});

test("validateGoldenSet fails when expectedPlaybook does not exist in dir", () => {
  const result = validateGoldenSet(
    {
      schemaVersion: 1,
      cases: Array.from({ length: 8 }, (_, i) => ({
        id: `case-${i}`,
        kind: "match",
        prompt: "Add a new REST API endpoint.",
        expectedPlaybook: "nonexistent-playbook.md",
      })),
    },
    ["add-api-endpoint.md"],
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("nonexistent-playbook.md")));
});

test("evalCase match: returns ok=true when top match equals expectedPlaybook", () => {
  const result = evalCase(
    {
      id: "test",
      kind: "match",
      prompt: "Add a new REST API endpoint.",
      expectedPlaybook: "add-api-endpoint.md",
    },
    SAMPLE_PLAYBOOKS,
  );
  assert.equal(result.ok, true);
  assert.equal(result.id, "test");
});

test("evalCase match: returns ok=false when top match differs", () => {
  const result = evalCase(
    {
      id: "test",
      kind: "match",
      prompt: "Run a SQL migration with no numbering gaps.",
      expectedPlaybook: "add-api-endpoint.md",
    },
    SAMPLE_PLAYBOOKS,
  );
  assert.equal(result.ok, false);
  assert.match(result.reason, /expected top match/);
});

test("evalCase anti-match: ok=true when forbidden does not appear as top", () => {
  const result = evalCase(
    {
      id: "test",
      kind: "anti-match",
      prompt: "Add a new REST API endpoint.",
      expectedPlaybook: "add-api-endpoint.md",
      forbiddenPlaybooks: ["add-sql-migration.md"],
    },
    SAMPLE_PLAYBOOKS,
  );
  assert.equal(result.ok, true);
});

test("evalCase anti-match: ok=false when forbidden appears as top", () => {
  const result = evalCase(
    {
      id: "test",
      kind: "anti-match",
      prompt: "Add a sequential SQL migration with no numbering gaps.",
      expectedPlaybook: "add-api-endpoint.md",
      forbiddenPlaybooks: ["add-sql-migration.md"],
    },
    SAMPLE_PLAYBOOKS,
  );
  assert.equal(result.ok, false);
  assert.match(result.reason, /forbidden playbook/);
});

test("CLI passes against the real repo golden file", () => {
  const result = spawnSync(process.execPath, [SCRIPT_PATH], {
    cwd: REPO_ROOT,
    encoding: "utf-8",
  });
  assert.equal(
    result.status,
    0,
    `stderr: ${result.stderr}\nstdout: ${result.stdout}`,
  );
  assert.match(result.stdout, /OK/);
});
