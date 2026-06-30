// scripts/__tests__/ci-bump-harness-version.test.mjs
//
// Unit tests for the harness-version bumper.
// Run with: node --test scripts/__tests__/ci-bump-harness-version.test.mjs

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  readFileSync,
  writeFileSync,
  mkdtempSync,
  rmSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";

const SCRIPT = join(process.cwd(), "scripts/ci-bump-harness-version.mjs");

function runBumper({ files, registry }) {
  const dir = mkdtempSync(join(tmpdir(), "harness-bump-"));
  const kilo = join(dir, ".kilo");
  mkdirSync(kilo, { recursive: true });
  writeFileSync(
    join(kilo, "harness-versions.json"),
    JSON.stringify(registry, null, 2),
  );
  for (const f of files) {
    const full = join(dir, f);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, "x");
  }
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: "t",
    GIT_AUTHOR_EMAIL: "t@e",
    GIT_COMMITTER_NAME: "t",
    GIT_COMMITTER_EMAIL: "t@e",
    GIT_TERMINAL_PROMPT: "0",
  };
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir, env });
  execFileSync("git", ["config", "user.email", "t@e"], { cwd: dir, env });
  execFileSync("git", ["config", "user.name", "t"], { cwd: dir, env });
  execFileSync("git", ["add", "-A"], { cwd: dir, env });
  execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: dir, env });
  for (const f of files) {
    writeFileSync(join(dir, f), "y");
  }
  execFileSync("git", ["add", "-A"], { cwd: dir, env });
  execFileSync("git", ["commit", "-q", "-m", "change"], { cwd: dir, env });

  let out = "";
  try {
    out = execFileSync("node", [SCRIPT], {
      cwd: dir,
      env: { ...env, BUMP_BASE_REF: "HEAD~1", BUMP_HEAD_REF: "HEAD" },
      encoding: "utf8",
    });
  } catch (err) {
    out = `${err.stdout || ""}${err.stderr || ""}`;
    throw err;
  }
  const updated = JSON.parse(
    readFileSync(join(kilo, "harness-versions.json"), "utf8"),
  );
  rmSync(dir, { recursive: true, force: true });
  return { out, updated };
}

const baseRegistry = {
  schemaVersion: 1,
  current: "0.1.0",
  versions: {
    "0.1.0": {
      releasedAt: "2026-06-29",
      changes: [],
      agentsTestedWith: [],
      passRateBaseline: null,
    },
  },
  abExperiments: {},
};

describe("ci-bump-harness-version", () => {
  it("bumps minor on AGENTS.md change (0.1.0 -> 0.2.0)", () => {
    const { updated, out } = runBumper({
      files: ["AGENTS.md"],
      registry: baseRegistry,
    });
    assert.match(out, /0\.1\.0 -> 0\.2\.0/);
    assert.equal(updated.current, "0.2.0");
  });

  it("bumps minor on new skill file (0.1.0 -> 0.2.0)", () => {
    const { updated } = runBumper({
      files: [".agents/skills/sergeant-foo/SKILL.md"],
      registry: baseRegistry,
    });
    assert.equal(updated.current, "0.2.0");
  });

  it("bumps major on Hard Rule change (0.1.0 -> 1.0.0)", () => {
    const { updated, out } = runBumper({
      files: ["docs/04-governance/governance/rules/01-foo.md"],
      registry: baseRegistry,
    });
    assert.match(out, /0\.1\.0 -> 1\.0\.0/);
    assert.equal(updated.current, "1.0.0");
  });

  it("bumps minor on eslint-plugin change (0.1.0 -> 0.2.0)", () => {
    const { updated } = runBumper({
      files: ["packages/eslint-plugin-sergeant-design/src/rules/foo.ts"],
      registry: baseRegistry,
    });
    assert.equal(updated.current, "0.2.0");
  });

  it("bumps patch on unrelated doc edit (0.1.0 -> 0.1.1)", () => {
    const { updated, out } = runBumper({
      files: ["docs/04-governance/governance/some-other.md"],
      registry: baseRegistry,
    });
    assert.match(out, /0\.1\.0 -> 0\.1\.1/);
    assert.equal(updated.current, "0.1.1");
  });

  it("bumps patch on .husky change (0.1.0 -> 0.1.1)", () => {
    const { updated } = runBumper({
      files: [".husky/pre-commit"],
      registry: baseRegistry,
    });
    assert.equal(updated.current, "0.1.1");
  });

  it("writes an entry into versions[next]", () => {
    const { updated } = runBumper({
      files: ["AGENTS.md"],
      registry: baseRegistry,
    });
    assert.ok(updated.versions["0.2.0"]);
    assert.match(updated.versions["0.2.0"].releasedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(Array.isArray(updated.versions["0.2.0"].changes));
    assert.match(
      updated.versions["0.2.0"].changes[0],
      /bump from 0\.1\.0 -> 0\.2\.0/,
    );
  });
});
