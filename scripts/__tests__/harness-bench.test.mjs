// node --test scripts/__tests__/harness-bench.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import {
  collectSkillSlugs,
  validateTasks,
  runBench,
  buildSkillKeywordMap,
  scoreTask,
} from "../harness-bench.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const SCRIPT_PATH = resolve(__dirname, "..", "harness-bench.mjs");

function makeSkillsDir(root, slugs) {
  for (const slug of slugs) {
    const dir = join(root, ".agents", "skills", slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "SKILL.md"),
      `---\nname: ${slug}\n---\n# ${slug}\n`,
    );
  }
}

function minimalTask(overrides = {}) {
  return {
    id: "test-task-1",
    title: "Test task",
    prompt:
      "Add a new server API route that serializes bigint fields correctly.",
    expectedSkills: ["sergeant-start-here", "sergeant-server-api"],
    expectedPlaybook: null,
    surface: "server",
    acceptance: "server route works; bigint coerced",
    ...overrides,
  };
}

const BASE_SLUGS = [
  "sergeant-start-here",
  "sergeant-server-api",
  "sergeant-web-ui",
];

test("collectSkillSlugs returns directories with SKILL.md", () => {
  const root = mkdtempSync(join(tmpdir(), "harness-bench-test-"));
  try {
    makeSkillsDir(root, ["sergeant-start-here", "sergeant-web-ui"]);
    const slugs = collectSkillSlugs(root);
    assert.deepEqual(slugs, ["sergeant-start-here", "sergeant-web-ui"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("validateTasks passes a valid minimal golden file", () => {
  const tasks = Array.from({ length: 10 }, (_, i) =>
    minimalTask({ id: `task-${i}` }),
  );
  const result = validateTasks({ schemaVersion: 1, tasks }, BASE_SLUGS);
  assert.equal(result.ok, true, result.errors.join("\n"));
});

test("validateTasks fails when schemaVersion is wrong", () => {
  const tasks = Array.from({ length: 10 }, (_, i) =>
    minimalTask({ id: `task-${i}` }),
  );
  const result = validateTasks({ schemaVersion: 2, tasks }, BASE_SLUGS);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("schemaVersion")));
});

test("validateTasks fails when fewer than 10 tasks", () => {
  const tasks = [minimalTask()];
  const result = validateTasks({ schemaVersion: 1, tasks }, BASE_SLUGS);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("at least 10")));
});

test("validateTasks fails on duplicate ids", () => {
  const tasks = Array.from({ length: 10 }, () => minimalTask({ id: "dup" }));
  const result = validateTasks({ schemaVersion: 1, tasks }, BASE_SLUGS);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("duplicate id")));
});

test("validateTasks fails when a skill slug does not exist", () => {
  const tasks = Array.from({ length: 10 }, (_, i) =>
    minimalTask({ id: `task-${i}`, expectedSkills: ["nonexistent-skill"] }),
  );
  const result = validateTasks({ schemaVersion: 1, tasks }, BASE_SLUGS);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("nonexistent-skill")));
});

test("validateTasks fails when surface is invalid", () => {
  const tasks = Array.from({ length: 10 }, (_, i) =>
    minimalTask({ id: `task-${i}`, surface: "invalid" }),
  );
  const result = validateTasks({ schemaVersion: 1, tasks }, BASE_SLUGS);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("surface")));
});

test("validateTasks fails when acceptance is missing", () => {
  const tasks = Array.from({ length: 10 }, (_, i) =>
    minimalTask({ id: `task-${i}`, acceptance: "" }),
  );
  const result = validateTasks({ schemaVersion: 1, tasks }, BASE_SLUGS);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("acceptance")));
});

test("scoreTask gives full score for surface-mapped skill and start-here", () => {
  const keywordMap = buildSkillKeywordMap(BASE_SLUGS);
  const task = minimalTask({
    expectedSkills: ["sergeant-start-here", "sergeant-server-api"],
    surface: "server",
  });
  const score = scoreTask(task, keywordMap);
  assert.equal(score, 1);
});

test("scoreTask uses keyword matching when surface does not directly map skill", () => {
  const slugs = ["sergeant-start-here", "sergeant-data-and-migrations"];
  const keywordMap = buildSkillKeywordMap(slugs);
  const task = minimalTask({
    expectedSkills: ["sergeant-start-here", "sergeant-data-and-migrations"],
    surface: "cross",
    prompt:
      "Create a sequential SQL migration with no numbering gaps for an outbox table.",
  });
  const score = scoreTask(task, keywordMap);
  assert.equal(
    score,
    1,
    "migration keywords should match via extra keyword map",
  );
});

test("scoreTask returns partial score when a skill cannot be matched", () => {
  const slugs = ["sergeant-start-here", "sergeant-web-ui"];
  const keywordMap = buildSkillKeywordMap(slugs);
  const task = minimalTask({
    expectedSkills: ["sergeant-start-here", "sergeant-web-ui"],
    surface: "cross",
    prompt:
      "A prompt with absolutely no matching keywords for web or ui at all.",
  });
  const score = scoreTask(task, keywordMap);
  // sergeant-start-here always matches; sergeant-web-ui may not
  assert.ok(score >= 0.5 && score <= 1);
});

test("runBench returns ok=true when all tasks pass", () => {
  const slugs = ["sergeant-start-here", "sergeant-server-api"];
  const tasks = Array.from({ length: 10 }, (_, i) =>
    minimalTask({
      id: `task-${i}`,
      expectedSkills: ["sergeant-start-here", "sergeant-server-api"],
      surface: "server",
    }),
  );
  const result = runBench({ schemaVersion: 1, tasks }, slugs);
  assert.equal(result.ok, true);
  assert.equal(result.passed, 10);
  assert.equal(result.failed, 0);
});

test("runBench returns ok=false when pass rate < 70%", () => {
  const slugs = [
    "sergeant-start-here",
    "sergeant-web-ui",
    "sergeant-mobile-expo",
  ];
  // Create tasks that will fail: cross surface with skills that don't keyword-match the prompt
  const tasks = Array.from({ length: 10 }, (_, i) => ({
    id: `fail-task-${i}`,
    title: "Unmatchable task",
    prompt:
      "zzz completely unrelated content with no harness signals at all zzz",
    expectedSkills: ["sergeant-web-ui", "sergeant-mobile-expo"],
    expectedPlaybook: null,
    surface: "cross",
    acceptance: "n/a",
  }));
  const result = runBench({ schemaVersion: 1, tasks }, slugs);
  assert.equal(result.ok, false);
  assert.ok(result.passRate < 0.7);
});

test("CLI passes against the real repo golden file", () => {
  const result = spawnSync(process.execPath, [SCRIPT_PATH, "--json"], {
    cwd: REPO_ROOT,
    encoding: "utf-8",
  });
  const parsed = JSON.parse(result.stdout);
  assert.equal(result.status, 0, JSON.stringify(parsed, null, 2));
  assert.equal(parsed.ok, true);
  assert.ok(parsed.total >= 10, `expected ≥10 tasks, got ${parsed.total}`);
  assert.ok(parsed.passRate >= 0.7);
});
