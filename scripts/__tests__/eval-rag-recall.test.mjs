// scripts/__tests__/eval-rag-recall.test.mjs
//
// Integration tests for `scripts/eval-rag-recall.mjs` (PR-22 RAG quality gate).
//
// Run with:  node --test scripts/__tests__/eval-rag-recall.test.mjs

import { describe, it, after, before } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), "..", "..");
const SCRIPT = join(REPO_ROOT, "scripts", "eval-rag-recall.mjs");

function runCli(args) {
  const result = spawnSync("node", [SCRIPT, ...args], {
    encoding: "utf-8",
    cwd: REPO_ROOT,
  });
  let parsed = null;
  if (
    result.stdout &&
    (result.status === 0 || result.status === 1 || result.status === 2)
  ) {
    try {
      parsed = JSON.parse(result.stdout);
    } catch {
      parsed = null;
    }
  }
  return {
    exitCode: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    parsed,
  };
}

describe("eval-rag-recall.mjs — mock mode", () => {
  it("повертає pass + exit 0 за дефолтних threshold-ів", () => {
    const r = runCli([]);
    assert.equal(r.exitCode, 0);
    assert.notEqual(r.parsed, null);
    assert.equal(r.parsed.status, "pass");
    assert.ok(Math.abs(r.parsed.aggregate.mean - 1.0) < 1e-9);
    assert.ok(r.parsed.aggregate.count >= 50);
  });

  it("emit-ить thresholds і perDomain breakdown", () => {
    const r = runCli(["--mode=mock"]);
    assert.deepEqual(r.parsed.thresholds, { warn: 0.5, kill: 0.4 });
    const domains = Object.keys(r.parsed.perDomain);
    assert.ok(domains.length >= 7);
    for (const stats of Object.values(r.parsed.perDomain)) {
      assert.ok(stats.mean >= 0 && stats.mean <= 1);
    }
  });
});

describe("eval-rag-recall.mjs — simulate mode", () => {
  it("simulate-recall=0.45 → status=warn, exit=1", () => {
    const r = runCli(["--mode=simulate", "--simulate-recall=0.45"]);
    assert.equal(r.exitCode, 1);
    assert.equal(r.parsed.status, "warn");
    assert.ok(r.parsed.aggregate.mean < 0.5);
    assert.ok(r.parsed.aggregate.mean >= 0.4);
  });

  it("simulate-recall=0.3 → status=kill, exit=2", () => {
    const r = runCli(["--mode=simulate", "--simulate-recall=0.3"]);
    assert.equal(r.exitCode, 2);
    assert.equal(r.parsed.status, "kill");
    assert.ok(r.parsed.aggregate.mean < 0.4);
  });

  it("simulate-recall=0 → mean=0 + kill", () => {
    const r = runCli(["--mode=simulate", "--simulate-recall=0"]);
    assert.equal(r.exitCode, 2);
    assert.equal(r.parsed.aggregate.mean, 0);
  });

  it("custom thresholds: warn=0.8, kill=0.7 — mock mean=1.0 → pass", () => {
    const r = runCli(["--warn=0.8", "--kill=0.7"]);
    assert.equal(r.parsed.status, "pass");
    assert.equal(r.exitCode, 0);
  });
});

describe("eval-rag-recall.mjs — --output writes JSON file", () => {
  let tmpDir;

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "eval-rag-recall-test-"));
  });

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("пише валідний JSON summary на диск", () => {
    const outputPath = join(tmpDir, "summary.json");
    const r = runCli([`--output=${outputPath}`]);
    assert.equal(r.exitCode, 0);
    const onDisk = JSON.parse(readFileSync(outputPath, "utf-8"));
    assert.equal(onDisk.status, "pass");
    assert.ok(onDisk.queries.length >= 50);
  });
});

describe("eval-rag-recall.mjs — error handling", () => {
  it("--mode=live → exit 3 (placeholder для PR-20)", () => {
    const r = runCli(["--mode=live"]);
    assert.equal(r.exitCode, 3);
    assert.match(r.stderr, /not implemented/i);
  });

  it("invalid --mode → exit 3", () => {
    const r = runCli(["--mode=bogus"]);
    assert.equal(r.exitCode, 3);
    assert.match(r.stderr, /invalid --mode/i);
  });

  it("invalid --warn (>1) → exit 3", () => {
    const r = runCli(["--warn=1.5"]);
    assert.equal(r.exitCode, 3);
  });

  it("--kill > --warn → exit 3", () => {
    const r = runCli(["--warn=0.4", "--kill=0.6"]);
    assert.equal(r.exitCode, 3);
  });
});
