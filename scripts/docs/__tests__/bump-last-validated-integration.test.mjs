// scripts/docs/__tests__/bump-last-validated-integration.test.mjs
//
// Integration tests for bumpFiles — uses a tmpdir + the real fs.
// Run with:
//   node --test scripts/docs/__tests__/bump-last-validated-integration.test.mjs

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { bumpFiles } from "../bump-last-validated.mjs";
import { DEFAULT_CONFIG } from "../freshness-config.mjs";

const HEADER = (date, handle, next) =>
  `# Doc\n\n> **Last validated:** ${date} by @${handle}. **Next review:** ${next}.\n> **Status:** Active\n\nbody\n`;

describe("bumpFiles (integration)", () => {
  let dir;
  const config = {
    ...DEFAULT_CONFIG,
    cadenceOverrides: { "docs/runbook.md": 60 },
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "bump-last-validated-"));
    mkdirSync(join(dir, "docs"), { recursive: true });
    mkdirSync(join(dir, "docs/adr"), { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("bumps a single file and reports it as modified", () => {
    const rel = "docs/foo.md";
    writeFileSync(join(dir, rel), HEADER("2026-01-01", "old", "2026-04-01"));
    const modified = bumpFiles({
      paths: [rel],
      today: "2026-04-30",
      handle: "new",
      config,
      rootDir: dir,
    });
    assert.deepEqual(modified, [rel]);
    const after = readFileSync(join(dir, rel), "utf8");
    assert.match(
      after,
      /\*\*Last validated:\*\* 2026-04-30 by @new\. \*\*Next review:\*\* 2026-07-29\./,
    );
  });

  it("uses cadenceOverrides per file", () => {
    const rel = "docs/runbook.md";
    writeFileSync(join(dir, rel), HEADER("2026-01-01", "old", "2026-04-01"));
    bumpFiles({
      paths: [rel],
      today: "2026-04-30",
      handle: "new",
      config,
      rootDir: dir,
    });
    const after = readFileSync(join(dir, rel), "utf8");
    // 60-day cadence override
    assert.match(after, /\*\*Next review:\*\* 2026-06-29\./);
  });

  it("skips excluded paths (ADR)", () => {
    const rel = "docs/adr/0001-foo.md";
    const original = HEADER("2026-01-01", "old", "2026-04-01");
    writeFileSync(join(dir, rel), original);
    const modified = bumpFiles({
      paths: [rel],
      today: "2026-04-30",
      handle: "new",
      config,
      rootDir: dir,
    });
    assert.deepEqual(modified, []);
    assert.equal(readFileSync(join(dir, rel), "utf8"), original);
  });

  it("skips files without a header", () => {
    const rel = "docs/no-header.md";
    const original = "# Doc\n\nNo header.\n";
    writeFileSync(join(dir, rel), original);
    const modified = bumpFiles({
      paths: [rel],
      today: "2026-04-30",
      handle: "new",
      config,
      rootDir: dir,
    });
    assert.deepEqual(modified, []);
    assert.equal(readFileSync(join(dir, rel), "utf8"), original);
  });

  it("is idempotent (no-op on already-today header with same handle)", () => {
    const rel = "docs/today.md";
    const original = HEADER("2026-04-30", "new", "2026-07-29");
    writeFileSync(join(dir, rel), original);
    const modified = bumpFiles({
      paths: [rel],
      today: "2026-04-30",
      handle: "new",
      config,
      rootDir: dir,
    });
    assert.deepEqual(modified, []);
    assert.equal(readFileSync(join(dir, rel), "utf8"), original);
  });

  it("processes multiple files in one call", () => {
    writeFileSync(
      join(dir, "docs/a.md"),
      HEADER("2026-01-01", "old", "2026-04-01"),
    );
    writeFileSync(
      join(dir, "docs/b.md"),
      HEADER("2026-02-01", "old", "2026-05-02"),
    );
    const modified = bumpFiles({
      paths: ["docs/a.md", "docs/b.md"],
      today: "2026-04-30",
      handle: "new",
      config,
      rootDir: dir,
    });
    assert.deepEqual(modified.sort(), ["docs/a.md", "docs/b.md"]);
  });

  it("silently skips missing files", () => {
    const modified = bumpFiles({
      paths: ["docs/does-not-exist.md"],
      today: "2026-04-30",
      handle: "new",
      config,
      rootDir: dir,
    });
    assert.deepEqual(modified, []);
  });
});
