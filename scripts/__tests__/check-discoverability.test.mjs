// scripts/__tests__/check-discoverability.test.mjs
//
// Tests for the discoverability gate:
//   1. Pure-function tests for `extractLinks`, `resolveTarget`,
//      `findShortestPath`, and `checkRoutes` against ad-hoc fixture trees.
//   2. An integration test that runs the real script (`--json`) against
//      the real repo and asserts every configured row resolves — i.e.
//      the script we just wrote is consistent with the doc surface we
//      actually ship today.
//
// Run with:  node --test scripts/__tests__/check-discoverability.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  extractLinks,
  resolveTarget,
  findShortestPath,
  checkRoutes,
} from "../check-discoverability.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const SCRIPT_PATH = resolve(__dirname, "..", "check-discoverability.mjs");

function buildFixture(files) {
  const dir = mkdtempSync(join(tmpdir(), "discoverability-test-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

test("extractLinks ignores fenced code and image syntax", () => {
  const md = [
    "Hi [a](./a.md) and ![img](./img.png) and [b](./b.md).",
    "```",
    "[ignored](./ignored.md)",
    "```",
    "Inline `[notalink](./n.md)` survives.",
  ].join("\n");
  const links = extractLinks(md).map((l) => l.target);
  assert.deepEqual(links, ["./a.md", "./b.md"]);
});

test("resolveTarget normalizes relative + repo-root-anchored paths", () => {
  const root = "/repo";
  const source = "/repo/docs/a/b.md";
  assert.equal(resolveTarget(source, "../c.md", root), "docs/c.md");
  assert.equal(resolveTarget(source, "/AGENTS.md", root), "AGENTS.md");
  assert.equal(resolveTarget(source, "https://x", root), null);
  assert.equal(resolveTarget(source, "#section", root), null);
  assert.equal(resolveTarget(source, "./c.md#anchor", root), "docs/a/c.md");
  assert.equal(
    resolveTarget(source, "../../escape.md", root),
    "escape.md",
    "exactly-at-root paths are kept",
  );
  assert.equal(
    resolveTarget(source, "../../../bad.md", root),
    null,
    "outside-root paths are rejected",
  );
});

test("findShortestPath: 1-hop direct link", () => {
  const dir = buildFixture({
    "AGENTS.md": "[link](./docs/a.md)",
    "docs/a.md": "# a",
  });
  try {
    const r = findShortestPath(dir, ["AGENTS.md"], "docs/a.md", 2);
    assert.ok(r, "must reach docs/a.md");
    assert.equal(r.hops, 1);
    assert.deepEqual(r.path, ["AGENTS.md", "docs/a.md"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("findShortestPath: 2-hop chain succeeds", () => {
  const dir = buildFixture({
    "AGENTS.md": "[hub](./docs/hub.md)",
    "docs/hub.md": "[deep](./deep.md)",
    "docs/deep.md": "# deep",
  });
  try {
    const r = findShortestPath(dir, ["AGENTS.md"], "docs/deep.md", 2);
    assert.ok(r);
    assert.equal(r.hops, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("findShortestPath: 3-hop chain fails when budget is 2", () => {
  const dir = buildFixture({
    "AGENTS.md": "[a](./a.md)",
    "a.md": "[b](./b.md)",
    "b.md": "[c](./c.md)",
    "c.md": "# c",
  });
  try {
    const r = findShortestPath(dir, ["AGENTS.md"], "c.md", 2);
    assert.equal(r, null, "must not reach c.md within 2 hops");
    const r3 = findShortestPath(dir, ["AGENTS.md"], "c.md", 3);
    assert.ok(r3, "must reach c.md within 3 hops");
    assert.equal(r3.hops, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("findShortestPath: directory link expands to README.md", () => {
  const dir = buildFixture({
    "README.md": "[playbooks](./docs/playbooks)",
    "docs/playbooks/README.md": "# playbooks",
  });
  try {
    const r = findShortestPath(
      dir,
      ["README.md"],
      "docs/playbooks/README.md",
      1,
    );
    assert.ok(r, "directory link must resolve to README.md");
    assert.equal(r.hops, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("findShortestPath: links to a non-md leaf count as a hop", () => {
  const dir = buildFixture({
    "AGENTS.md": "[rules](./docs/rules.json)",
    "docs/rules.json": "{}",
  });
  try {
    const r = findShortestPath(dir, ["AGENTS.md"], "docs/rules.json", 1);
    assert.ok(r);
    assert.equal(r.hops, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("checkRoutes: missing entrypoint reports as `missing-entrypoints`", () => {
  const dir = buildFixture({
    "docs/x.md": "# x",
  });
  try {
    const report = checkRoutes(
      dir,
      [
        {
          role: "test",
          reason: "no-entry",
          entrypoints: ["DOES_NOT_EXIST.md"],
          target: "docs/x.md",
        },
      ],
      2,
    );
    assert.equal(report.failures.length, 0);
    assert.equal(report.checked.length, 1);
    assert.equal(report.checked[0].status, "missing-entrypoints");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("checkRoutes: missing target reports as `missing-target`", () => {
  const dir = buildFixture({
    "AGENTS.md": "# a",
  });
  try {
    const report = checkRoutes(
      dir,
      [
        {
          role: "test",
          reason: "no-target",
          entrypoints: ["AGENTS.md"],
          target: "docs/missing.md",
        },
      ],
      2,
    );
    assert.equal(report.failures.length, 0);
    assert.equal(report.checked[0].status, "missing-target");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("checkRoutes: unreachable target reports as failure with route metadata", () => {
  const dir = buildFixture({
    "AGENTS.md": "[a](./a.md)",
    "a.md": "[b](./b.md)",
    "b.md": "[c](./c.md)",
    "c.md": "# c",
  });
  try {
    const report = checkRoutes(
      dir,
      [
        {
          role: "test",
          reason: "too-far",
          entrypoints: ["AGENTS.md"],
          target: "c.md",
        },
      ],
      2,
    );
    assert.equal(report.failures.length, 1);
    const f = report.failures[0];
    assert.equal(f.role, "test");
    assert.equal(f.target, "c.md");
    assert.equal(f.maxHops, 2);
    assert.deepEqual(f.entrypoints, ["AGENTS.md"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("checkRoutes: per-row maxHops override is honored", () => {
  const dir = buildFixture({
    "AGENTS.md": "[a](./a.md)",
    "a.md": "[b](./b.md)",
    "b.md": "[c](./c.md)",
    "c.md": "# c",
  });
  try {
    const report = checkRoutes(
      dir,
      [
        {
          role: "test",
          reason: "needs-extra-budget",
          entrypoints: ["AGENTS.md"],
          target: "c.md",
          maxHops: 3,
        },
      ],
      2,
    );
    assert.equal(report.failures.length, 0);
    assert.equal(report.checked[0].status, "reachable");
    assert.equal(report.checked[0].hops, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI: real repo passes the configured discoverability matrix", () => {
  const r = spawnSync(
    process.execPath,
    [SCRIPT_PATH, "--json", "--root", REPO_ROOT],
    { encoding: "utf-8" },
  );
  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch {
    assert.fail(
      `expected JSON output, got status=${r.status}\n--- stdout ---\n${r.stdout}\n--- stderr ---\n${r.stderr}`,
    );
  }
  assert.equal(
    r.status,
    0,
    `discoverability check must pass against the real repo. failures:\n${JSON.stringify(parsed.failures, null, 2)}`,
  );
  assert.ok(parsed.ok);
  assert.ok(Array.isArray(parsed.checked) && parsed.checked.length > 0);
});
