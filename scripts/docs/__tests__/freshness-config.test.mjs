// scripts/docs/__tests__/freshness-config.test.mjs
//
// Unit tests for the freshness-config loader (PR-12.B).
// Run with: node --test scripts/docs/__tests__/freshness-config.test.mjs

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_CONFIG,
  DEFAULT_CADENCE_DAYS,
  globToRegex,
  matchesAnyGlob,
  hasFreshnessHeader,
  buildTrackedList,
  computeCoverageGaps,
} from "../freshness-config.mjs";

// ── globToRegex / matchesAnyGlob ─────────────────────────────────────────────

describe("globToRegex", () => {
  it("matches exact paths", () => {
    const re = globToRegex("docs/playbooks/INDEX.md");
    assert.equal(re.test("docs/playbooks/INDEX.md"), true);
    assert.equal(re.test("docs/playbooks/INDEX.md.bak"), false);
  });

  it("matches directory prefix with **", () => {
    const re = globToRegex("docs/adr/**");
    assert.equal(re.test("docs/adr/0001-foo.md"), true);
    assert.equal(re.test("docs/adr/sub/dir/file.md"), true);
    assert.equal(re.test("docs/audits/foo.md"), false);
  });

  it("matches **/X — leading wildcard", () => {
    const re = globToRegex("**/node_modules/**");
    assert.equal(re.test("node_modules/foo/README.md"), true);
    assert.equal(re.test("apps/web/node_modules/foo/README.md"), true);
    assert.equal(re.test("docs/foo.md"), false);
  });

  it("matches single * inside a segment", () => {
    const re = globToRegex("**/TEMPLATE*.md");
    assert.equal(re.test("docs/postmortems/TEMPLATE.md"), true);
    assert.equal(re.test("docs/adr/TEMPLATE-01.md"), true);
    assert.equal(re.test("docs/postmortems/foo.md"), false);
  });

  it("treats * as single-segment (no /)", () => {
    const re = globToRegex("docs/*.md");
    assert.equal(re.test("docs/README.md"), true);
    assert.equal(re.test("docs/sub/README.md"), false);
  });

  it("escapes regex metacharacters", () => {
    const re = globToRegex("docs/foo.bar+baz.md");
    assert.equal(re.test("docs/foo.bar+baz.md"), true);
    assert.equal(re.test("docs/fooXbar+baz.md"), false);
  });
});

describe("matchesAnyGlob", () => {
  it("returns true if any glob matches", () => {
    const globs = ["docs/adr/**", "**/TEMPLATE*.md"];
    assert.equal(matchesAnyGlob("docs/adr/0001.md", globs), true);
    assert.equal(matchesAnyGlob("docs/postmortems/TEMPLATE.md", globs), true);
    assert.equal(matchesAnyGlob("README.md", globs), false);
  });

  it("returns false on empty list", () => {
    assert.equal(matchesAnyGlob("foo.md", []), false);
  });
});

// ── hasFreshnessHeader ───────────────────────────────────────────────────────

describe("hasFreshnessHeader", () => {
  it("detects canonical header", () => {
    const md = [
      "# Title",
      "",
      "> **Last validated:** 2026-04-27 by @x. **Next review:** 2026-07-26.",
      "> **Status:** Active",
      "",
    ].join("\n");
    assert.equal(hasFreshnessHeader(md), true);
  });

  it("ignores legacy `Last reviewed:` (canonical-only check)", () => {
    const md = [
      "# Title",
      "",
      "> Last reviewed: 2026-04-27. Reviewer: @x",
      "",
    ].join("\n");
    assert.equal(hasFreshnessHeader(md), false);
  });

  it("ignores headers beyond the line limit", () => {
    const lines = Array.from({ length: 30 }, (_, i) => `Line ${i}`);
    lines[20] =
      "> **Last validated:** 2026-04-27 by @x. **Next review:** 2026-07-26.";
    assert.equal(hasFreshnessHeader(lines.join("\n")), false);
  });

  it("returns false on empty content", () => {
    assert.equal(hasFreshnessHeader(""), false);
  });
});

// ── buildTrackedList ─────────────────────────────────────────────────────────

describe("buildTrackedList", () => {
  const config = {
    ...DEFAULT_CONFIG,
    excludeGlobs: ["docs/adr/**", "**/TEMPLATE*.md"],
    cadenceOverrides: { "docs/observability/runbook.md": 60 },
  };

  const headerContent =
    "# x\n\n> **Last validated:** 2026-01-01 by @x. **Next review:** 2026-04-01.\n";
  const noHeaderContent = "# x\n\nNo header here.\n";

  it("auto-tracks every candidate that has a freshness header", () => {
    const candidates = ["README.md", "docs/governance/doc-freshness.md"];
    const readFile = () => headerContent;
    const tracked = buildTrackedList({ candidates, config, readFile });
    assert.equal(tracked.length, 2);
    assert.deepEqual(tracked.map((t) => t.source).sort(), ["header", "header"]);
  });

  it("applies cadence overrides", () => {
    const candidates = ["docs/observability/runbook.md"];
    const tracked = buildTrackedList({
      candidates,
      config,
      readFile: () => headerContent,
    });
    assert.equal(tracked[0].cadenceDays, 60);
  });

  it("uses default cadence when no override", () => {
    const candidates = ["docs/governance/doc-freshness.md"];
    const tracked = buildTrackedList({
      candidates,
      config,
      readFile: () => headerContent,
    });
    assert.equal(tracked[0].cadenceDays, DEFAULT_CADENCE_DAYS);
  });

  it("skips files matching excludeGlobs", () => {
    const candidates = [
      "docs/adr/0001-foo.md",
      "docs/playbooks/TEMPLATE-decision-tree.md",
      "README.md",
    ];
    const tracked = buildTrackedList({
      candidates,
      config,
      readFile: () => headerContent,
    });
    assert.deepEqual(
      tracked.map((t) => t.path),
      ["README.md"],
    );
  });

  it("skips files without a header", () => {
    const candidates = ["a.md", "b.md"];
    const readFile = (p) => (p === "a.md" ? headerContent : noHeaderContent);
    const tracked = buildTrackedList({ candidates, config, readFile });
    assert.deepEqual(
      tracked.map((t) => t.path),
      ["a.md"],
    );
  });

  it("force-includes explicitInclude entries", () => {
    const candidates = ["a.md"];
    const cfg = {
      ...config,
      explicitInclude: ["legacy/no-header.md"],
    };
    const readFile = (p) => (p === "a.md" ? headerContent : null);
    const tracked = buildTrackedList({ candidates, config: cfg, readFile });
    const legacy = tracked.find((t) => t.path === "legacy/no-header.md");
    assert.ok(legacy, "explicitInclude entry should be tracked");
    assert.equal(legacy.source, "explicit");
  });

  it("respects explicitExclude over header detection", () => {
    const candidates = ["a.md", "b.md"];
    const cfg = {
      ...config,
      explicitExclude: ["b.md"],
    };
    const tracked = buildTrackedList({
      candidates,
      config: cfg,
      readFile: () => headerContent,
    });
    assert.deepEqual(
      tracked.map((t) => t.path),
      ["a.md"],
    );
  });

  it("falls back to legacy allowlist for paths without a header", () => {
    const candidates = ["a.md"];
    const readFile = (p) => (p === "a.md" ? headerContent : null);
    const legacyAllowlist = [
      { path: "legacy.md", cadenceDays: 60 },
      { path: "a.md", cadenceDays: 30 }, // already tracked via header — skip
    ];
    const tracked = buildTrackedList({
      candidates,
      config,
      legacyAllowlist,
      readFile,
    });
    const legacy = tracked.find((t) => t.path === "legacy.md");
    assert.ok(legacy);
    assert.equal(legacy.source, "legacy");
    assert.equal(legacy.cadenceDays, 60);

    const a = tracked.find((t) => t.path === "a.md");
    assert.equal(a.source, "header"); // header wins over legacy
  });

  it("returns sorted results", () => {
    const candidates = ["z.md", "a.md", "m.md"];
    const tracked = buildTrackedList({
      candidates,
      config,
      readFile: () => headerContent,
    });
    assert.deepEqual(
      tracked.map((t) => t.path),
      ["a.md", "m.md", "z.md"],
    );
  });
});

// ── computeCoverageGaps ──────────────────────────────────────────────────────

describe("computeCoverageGaps", () => {
  const config = {
    ...DEFAULT_CONFIG,
    excludeGlobs: ["docs/adr/**", "apps/**/README.md"],
    explicitExclude: ["docs/legacy.md"],
  };
  const headerContent =
    "# x\n\n> **Last validated:** 2026-01-01 by @x. **Next review:** 2026-04-01.\n";
  const noHeaderContent = "# x\n\nNo header here.\n";

  it("flags non-excluded files without a header", () => {
    const candidates = [
      "README.md",
      "docs/foo.md",
      "docs/adr/0001.md",
      "apps/web/README.md",
      "docs/legacy.md",
    ];
    const readFile = (p) =>
      p === "README.md" || p === "docs/legacy.md"
        ? headerContent
        : noHeaderContent;
    const gaps = computeCoverageGaps({ candidates, config, readFile });
    assert.deepEqual(gaps, ["docs/foo.md"]);
  });

  it("returns empty array when all docs have headers", () => {
    const candidates = ["README.md", "docs/foo.md"];
    const gaps = computeCoverageGaps({
      candidates,
      config,
      readFile: () => headerContent,
    });
    assert.deepEqual(gaps, []);
  });
});
