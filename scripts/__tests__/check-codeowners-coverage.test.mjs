// scripts/__tests__/check-codeowners-coverage.test.mjs
//
// Integration tests for the CODEOWNERS coverage checker. We exec the real
// script against fixture repos so the CLI surface (which CI invokes) is the
// thing under test.
//
// Run with:  node --test scripts/__tests__/check-codeowners-coverage.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = resolve(__dirname, "..", "check-codeowners-coverage.mjs");
const SCRIPT_SRC = readFileSync(SCRIPT_PATH, "utf-8");

// The script computes `ROOT = resolve(__dirname, "..")`, so we copy it into
// `<fixture>/scripts/` to make `<fixture>/` the perceived repo root.
function buildFixture() {
  const dir = mkdtempSync(join(tmpdir(), "codeowners-test-"));
  const root = join(dir, "repo");
  mkdirSync(join(root, "scripts"), { recursive: true });
  const scriptDest = join(root, "scripts", "check-codeowners-coverage.mjs");
  writeFileSync(scriptDest, SCRIPT_SRC);
  return { dir, root, scriptDest };
}

function runScript(scriptDest) {
  const r = spawnSync(process.execPath, [scriptDest, "--json"], {
    encoding: "utf-8",
  });
  return { ...r, json: r.stdout ? safeParse(r.stdout) : null };
}

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

test("file path with /-anchored rule is reported as owned", () => {
  const { dir, root, scriptDest } = buildFixture();
  try {
    mkdirSync(join(root, ".github"), { recursive: true });
    const codeowners = [
      "/AGENTS.md @owner",
      "/CLAUDE.md @owner",
      "/DEVIN.md @owner",
      "/CONTRIBUTING.md @owner",
      "/README.md @owner",
      "/.github/CODEOWNERS @owner",
    ].join("\n");
    writeFileSync(join(root, ".github", "CODEOWNERS"), codeowners + "\n");
    for (const f of [
      "AGENTS.md",
      "CLAUDE.md",
      "DEVIN.md",
      "CONTRIBUTING.md",
      "README.md",
    ]) {
      writeFileSync(join(root, f), "x");
    }

    const r = runScript(scriptDest);
    assert.ok(r.json, `expected JSON output, got: ${r.stdout}\n${r.stderr}`);
    const owned = r.json.checked.filter((c) => c.status === "owned");
    for (const f of ["AGENTS.md", "CLAUDE.md", "DEVIN.md", "CONTRIBUTING.md"]) {
      assert.ok(
        owned.some((c) => c.path === f),
        `${f} should be reported owned, got: ${JSON.stringify(r.json.checked)}`,
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("tree with directory pattern is reported as fully owned", () => {
  const { dir, root, scriptDest } = buildFixture();
  try {
    mkdirSync(join(root, ".github", "workflows"), { recursive: true });
    mkdirSync(join(root, "docs", "playbooks"), { recursive: true });
    writeFileSync(
      join(root, ".github", "CODEOWNERS"),
      [
        "/.github/workflows/ @owner",
        "/docs/playbooks/ @owner",
        "/.github/CODEOWNERS @owner",
      ].join("\n") + "\n",
    );
    writeFileSync(join(root, ".github", "workflows", "ci.yml"), "name: ci");
    writeFileSync(join(root, ".github", "workflows", "lint.yaml"), "name: l");
    writeFileSync(join(root, "docs", "playbooks", "x.md"), "# x");
    writeFileSync(join(root, "docs", "playbooks", "y.md"), "# y");

    const r = runScript(scriptDest);
    assert.ok(r.json);
    const wf = r.json.checked.find((c) => c.path === ".github/workflows");
    assert.equal(wf?.status, "owned");
    assert.equal(wf?.files, 2);
    const pb = r.json.checked.find((c) => c.path === "docs/playbooks");
    assert.equal(pb?.status, "owned");
    assert.equal(pb?.files, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("tree with one uncovered file fails with kind=tree-partial", () => {
  const { dir, root, scriptDest } = buildFixture();
  try {
    mkdirSync(join(root, ".github", "workflows"), { recursive: true });
    mkdirSync(join(root, "docs", "playbooks"), { recursive: true });
    writeFileSync(
      join(root, ".github", "CODEOWNERS"),
      ["/docs/playbooks/ @owner", "/.github/CODEOWNERS @owner"].join("\n") +
        "\n",
    );
    writeFileSync(join(root, ".github", "workflows", "ci.yml"), "name: ci");
    writeFileSync(join(root, "docs", "playbooks", "x.md"), "# x");

    const r = runScript(scriptDest);
    assert.equal(r.status, 1, "must exit 1 when coverage is partial");
    assert.ok(r.json);
    const fail = r.json.failures.find((f) => f.path === ".github/workflows");
    assert.ok(fail, "must report .github/workflows as failing");
    assert.equal(fail.kind, "tree-partial");
    assert.deepEqual(fail.uncovered, [".github/workflows/ci.yml"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("missing required file is recorded as 'missing' but does not fail", () => {
  const { dir, root, scriptDest } = buildFixture();
  try {
    mkdirSync(join(root, ".github"), { recursive: true });
    // Own all *present* required paths so the only failure mode in this
    // fixture would be the missing files (AGENTS.md, etc.).
    writeFileSync(
      join(root, ".github", "CODEOWNERS"),
      ["/.github/CODEOWNERS @owner", "/scripts/ @owner"].join("\n") + "\n",
    );
    const r = runScript(scriptDest);
    assert.equal(
      r.status,
      0,
      `missing files should not fail the script — got stderr: ${r.stderr}`,
    );
    assert.ok(r.json);
    const missing = r.json.checked.filter((c) => c.status === "missing");
    assert.ok(
      missing.some((c) => c.path === "AGENTS.md"),
      "AGENTS.md should be marked missing in this fixture",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("non-anchored bare filename pattern matches at any depth", () => {
  const { dir, root, scriptDest } = buildFixture();
  try {
    // CODEOWNERS exists but covers nothing. Use the script's MUST_BE_OWNED
    // entry for `.github/CODEOWNERS` itself: rule below matches it.
    mkdirSync(join(root, ".github"), { recursive: true });
    writeFileSync(join(root, ".github", "CODEOWNERS"), "CODEOWNERS @owner\n");
    const r = runScript(scriptDest);
    assert.ok(r.json);
    const codeownersEntry = r.json.checked.find(
      (c) => c.path === ".github/CODEOWNERS",
    );
    assert.equal(codeownersEntry?.status, "owned");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
