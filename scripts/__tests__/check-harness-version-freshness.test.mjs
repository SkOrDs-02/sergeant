// node --test scripts/__tests__/check-harness-version-freshness.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { checkFreshness } from "../check-harness-version-freshness.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const SCRIPT_PATH = resolve(
  __dirname,
  "..",
  "check-harness-version-freshness.mjs",
);

function makeRoot(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), "harness-fresh-test-"));
  mkdirSync(join(root, ".kilo"), { recursive: true });

  const registry = {
    schemaVersion: 1,
    current: "1.0.0",
    versions: {
      "1.0.0": { releasedAt: "2026-07-20", changes: ["initial"] },
    },
    abExperiments: {},
    ...overrides.registry,
  };
  writeFileSync(
    join(root, ".kilo", "harness-versions.json"),
    JSON.stringify(registry, null, 2),
  );

  const agentsMd =
    overrides.agentsMd ??
    "# AGENTS.md\n\n## Harness version\n\n- **Current:** see `current` field in `.kilo/harness-versions.json`.\n";
  writeFileSync(join(root, "AGENTS.md"), agentsMd);

  mkdirSync(join(root, "docs", "90-work", "planning"), { recursive: true });
  const v1Doc =
    overrides.v1Doc ??
    "# Harness Engineering v1\n\n(schemaVersion 1, поточна `1.0.0` — promoted 2026-07-20)\n";
  writeFileSync(
    join(root, "docs", "90-work", "planning", "harness-engineering-v1.md"),
    v1Doc,
  );

  return root;
}

test("passes for a healthy repo fixture", () => {
  const root = makeRoot();
  try {
    const result = checkFreshness(root);
    assert.equal(result.ok, true, result.errors.join("\n"));
    assert.deepEqual(result.errors, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fails when .kilo/harness-versions.json is missing", () => {
  const root = mkdtempSync(join(tmpdir(), "harness-fresh-test-"));
  try {
    const result = checkFreshness(root);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("harness-versions.json")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fails when schemaVersion is not 1", () => {
  const root = makeRoot({
    registry: {
      schemaVersion: 2,
      current: "1.0.0",
      versions: { "1.0.0": { releasedAt: "2026-07-20", changes: [] } },
      abExperiments: {},
    },
  });
  try {
    const result = checkFreshness(root);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("schemaVersion")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fails when current version is not in the versions map", () => {
  const root = makeRoot({
    registry: {
      schemaVersion: 1,
      current: "9.9.9",
      versions: { "1.0.0": { releasedAt: "2026-07-20", changes: [] } },
      abExperiments: {},
    },
  });
  try {
    const result = checkFreshness(root);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('"9.9.9"')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fails when versions[current].releasedAt is missing", () => {
  const root = makeRoot({
    registry: {
      schemaVersion: 1,
      current: "1.0.0",
      versions: { "1.0.0": { changes: ["no date"] } },
      abExperiments: {},
    },
  });
  try {
    const result = checkFreshness(root);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("releasedAt")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fails when AGENTS.md hardcodes a different version", () => {
  const root = makeRoot({
    agentsMd: "# AGENTS.md\n\n## Harness version\n\n- current `0.5.0`\n",
  });
  try {
    const result = checkFreshness(root);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("AGENTS.md")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fails when AGENTS.md contains stale 0.1.7 current ref", () => {
  const root = makeRoot({
    agentsMd: "# AGENTS.md\n\n- Current `0.1.7`\n",
  });
  try {
    const result = checkFreshness(root);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("0.1.7")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fails when harness-engineering-v1.md contains stale 0.1.7 current ref", () => {
  const root = makeRoot({
    v1Doc: "# Harness Engineering v1\n\nSchemaVersion 1, поточна `0.1.7`.\n",
  });
  try {
    const result = checkFreshness(root);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("0.1.7")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("warns when harness-engineering-v1.md version differs from current but is not 0.1.7", () => {
  const root = makeRoot({
    v1Doc:
      "# Harness Engineering v1\n\n(поточна `0.9.0` — promoted 2026-01-01)\n",
    registry: {
      schemaVersion: 1,
      current: "1.0.0",
      versions: { "1.0.0": { releasedAt: "2026-07-20", changes: [] } },
      abExperiments: {},
    },
  });
  try {
    const result = checkFreshness(root);
    // 0.9.0 mismatch is a warning (not blocking error)
    assert.ok(result.warnings.some((w) => w.includes("0.9.0")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI passes against the real repo", () => {
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
