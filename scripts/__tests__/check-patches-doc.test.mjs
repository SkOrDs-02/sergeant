// scripts/__tests__/check-patches-doc.test.mjs
//
// Unit tests for the `patches/` freshness-gate (PR-20 / M4).
// Run with: node --test scripts/__tests__/check-patches-doc.test.mjs

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  extractPatchedDeps,
  patchKeyToFilename,
  extractTableBlock,
  parseTable,
  unwrapCode,
  validate,
} from "../check-patches-doc.mjs";

// ── extractPatchedDeps ───────────────────────────────────────────────────────

describe("extractPatchedDeps", () => {
  it("returns sorted keys when present", () => {
    const pkg = {
      pnpm: {
        patchedDependencies: {
          "react@18.2.0": "patches/react.patch",
          "@expo/cli@0.22.28": "patches/@expo__cli@0.22.28.patch",
        },
      },
    };
    assert.deepEqual(extractPatchedDeps(pkg), [
      "@expo/cli@0.22.28",
      "react@18.2.0",
    ]);
  });

  it("returns [] when pnpm.patchedDependencies is missing", () => {
    assert.deepEqual(extractPatchedDeps({}), []);
    assert.deepEqual(extractPatchedDeps({ pnpm: {} }), []);
  });
});

// ── patchKeyToFilename ───────────────────────────────────────────────────────

describe("patchKeyToFilename", () => {
  it("converts pnpm keys to on-disk filenames", () => {
    assert.equal(
      patchKeyToFilename("@expo/cli@0.22.28"),
      "@expo__cli@0.22.28.patch",
    );
    assert.equal(patchKeyToFilename("react@18.2.0"), "react@18.2.0.patch");
    assert.equal(
      patchKeyToFilename("@scope/sub/inner@1.0.0"),
      "@scope__sub__inner@1.0.0.patch",
    );
  });
});

// ── extractTableBlock ────────────────────────────────────────────────────────

describe("extractTableBlock", () => {
  it("extracts content between LINT markers", () => {
    const readme = [
      "# Title",
      "intro",
      "<!-- LINT:patches:table:start -->",
      "table content",
      "<!-- LINT:patches:table:end -->",
      "outro",
    ].join("\n");
    assert.equal(extractTableBlock(readme), "table content");
  });

  it("returns null when markers are missing", () => {
    assert.equal(extractTableBlock("# Title\n"), null);
  });

  it("returns null when markers are reversed", () => {
    const readme = [
      "<!-- LINT:patches:table:end -->",
      "x",
      "<!-- LINT:patches:table:start -->",
    ].join("\n");
    assert.equal(extractTableBlock(readme), null);
  });
});

// ── parseTable ───────────────────────────────────────────────────────────────

describe("parseTable", () => {
  it("parses a well-formed table into row objects", () => {
    const block = [
      "| Patch | Reason | Owner |",
      "| --- | --- | --- |",
      "| `a.patch` | bug | @x |",
      "| `b.patch` | other | @y |",
    ].join("\n");
    const t = parseTable(block);
    assert.deepEqual(t.header, ["Patch", "Reason", "Owner"]);
    assert.equal(t.rows.length, 2);
    assert.equal(t.rows[0].Patch, "`a.patch`");
    assert.equal(t.rows[1].Owner, "@y");
  });

  it("returns null for blocks with no separator row", () => {
    const block = ["| Patch | Reason |", "| `a.patch` | bug |"].join("\n");
    assert.equal(parseTable(block), null);
  });

  it("flags a malformed row with __malformed marker", () => {
    const block = [
      "| Patch | Reason | Owner |",
      "| --- | --- | --- |",
      "| `a.patch` | bug |", // missing Owner cell
    ].join("\n");
    const t = parseTable(block);
    assert.equal(t.rows.length, 1);
    assert.ok(t.rows[0].__malformed);
  });

  it("returns null for empty input", () => {
    assert.equal(parseTable(""), null);
    assert.equal(parseTable(null), null);
  });
});

// ── unwrapCode ───────────────────────────────────────────────────────────────

describe("unwrapCode", () => {
  it("strips wrapping backticks", () => {
    assert.equal(unwrapCode("`a.patch`"), "a.patch");
  });

  it("returns the original when no backticks", () => {
    assert.equal(unwrapCode("a.patch"), "a.patch");
  });

  it("returns empty string for falsy input", () => {
    assert.equal(unwrapCode(""), "");
    assert.equal(unwrapCode(undefined), "");
    assert.equal(unwrapCode(null), "");
  });
});

// ── validate ─────────────────────────────────────────────────────────────────

describe("validate (integration of all three checks)", () => {
  const happyTable = parseTable(
    [
      "| Patch | Reason | Upstream | Drop when | Owner |",
      "| --- | --- | --- | --- | --- |",
      "| `@expo__cli@0.22.28.patch` | tar v7 ESM crash | https://example/issue/1 | Expo CLI 0.23.x | @Skords-01 |",
    ].join("\n"),
  );

  it("passes when patches/, package.json, and README are all in sync", () => {
    const result = validate({
      patchFiles: ["@expo__cli@0.22.28.patch"],
      patchedDeps: ["@expo/cli@0.22.28"],
      table: happyTable,
    });
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.deepEqual(result.errors, []);
  });

  it("fails when a patch file has no documented row", () => {
    const result = validate({
      patchFiles: ["@expo__cli@0.22.28.patch", "react@18.2.0.patch"],
      patchedDeps: ["@expo/cli@0.22.28", "react@18.2.0"],
      table: happyTable,
    });
    assert.equal(result.ok, false);
    assert.ok(
      result.errors.some((e) =>
        e.includes('no row found for patch file "react@18.2.0.patch"'),
      ),
      JSON.stringify(result.errors),
    );
  });

  it("fails when a row has an empty mandatory cell (Owner)", () => {
    const t = parseTable(
      [
        "| Patch | Reason | Upstream | Drop when | Owner |",
        "| --- | --- | --- | --- | --- |",
        "| `@expo__cli@0.22.28.patch` | tar v7 ESM crash | https://example/issue/1 | Expo CLI 0.23.x |  |",
      ].join("\n"),
    );
    const result = validate({
      patchFiles: ["@expo__cli@0.22.28.patch"],
      patchedDeps: ["@expo/cli@0.22.28"],
      table: t,
    });
    assert.equal(result.ok, false);
    assert.ok(
      result.errors.some((e) => e.includes('empty "Owner" cell')),
      JSON.stringify(result.errors),
    );
  });

  it("fails when README block markers are missing (table === null)", () => {
    const result = validate({
      patchFiles: ["@expo__cli@0.22.28.patch"],
      patchedDeps: ["@expo/cli@0.22.28"],
      table: null,
    });
    assert.equal(result.ok, false);
    assert.ok(
      result.errors.some((e) =>
        e.includes("missing or malformed LINT:patches:table block"),
      ),
      JSON.stringify(result.errors),
    );
  });

  it("fails when pnpm.patchedDependencies references a missing patch file", () => {
    const result = validate({
      patchFiles: ["@expo__cli@0.22.28.patch"],
      patchedDeps: ["@expo/cli@0.22.28", "react@18.2.0"],
      table: happyTable,
    });
    assert.equal(result.ok, false);
    assert.ok(
      result.errors.some(
        (e) =>
          e.includes('"react@18.2.0.patch"') && e.includes("does not exist"),
      ),
      JSON.stringify(result.errors),
    );
  });

  it("fails when an orphan patch file is not in pnpm.patchedDependencies", () => {
    const result = validate({
      patchFiles: ["@expo__cli@0.22.28.patch", "stale.patch"],
      patchedDeps: ["@expo/cli@0.22.28"],
      // Add a row for the orphan so we don't hit "no row" error first.
      table: parseTable(
        [
          "| Patch | Reason | Upstream | Drop when | Owner |",
          "| --- | --- | --- | --- | --- |",
          "| `@expo__cli@0.22.28.patch` | x | y | z | @a |",
          "| `stale.patch` | x | y | z | @a |",
        ].join("\n"),
      ),
    });
    assert.equal(result.ok, false);
    assert.ok(
      result.errors.some(
        (e) => e.includes("orphan patch") && e.includes("stale.patch"),
      ),
      JSON.stringify(result.errors),
    );
  });

  it("fails when a documented row points to a non-existent patch file", () => {
    const t = parseTable(
      [
        "| Patch | Reason | Upstream | Drop when | Owner |",
        "| --- | --- | --- | --- | --- |",
        "| `ghost.patch` | x | y | z | @a |",
      ].join("\n"),
    );
    const result = validate({
      patchFiles: [],
      patchedDeps: [],
      table: t,
    });
    assert.equal(result.ok, false);
    assert.ok(
      result.errors.some(
        (e) =>
          e.includes('"ghost.patch"') && e.includes("does not exist on disk"),
      ),
      JSON.stringify(result.errors),
    );
  });

  it("fails when a required column is missing from the header", () => {
    const t = parseTable(
      [
        "| Patch | Reason | Owner |",
        "| --- | --- | --- |",
        "| `a.patch` | x | @a |",
      ].join("\n"),
    );
    const result = validate({
      patchFiles: ["a.patch"],
      patchedDeps: [],
      table: t,
    });
    assert.equal(result.ok, false);
    assert.ok(
      result.errors.some((e) =>
        e.includes('missing required column "Upstream"'),
      ),
      JSON.stringify(result.errors),
    );
  });
});
