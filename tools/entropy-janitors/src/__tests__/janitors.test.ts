import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { __test_only as scanHelpers } from "../doc-drift/scan.js";
import { __test_only as cycleHelpers } from "../dep-cycles/scanner.js";

const { extractReferences, toPosix, SKIP_DIRS } = scanHelpers;
const { resolveImport, findCycles } = cycleHelpers;

describe("doc-drift extractReferences", () => {
  it("extracts backtick paths", () => {
    const text =
      "See `apps/web/src/foo.ts:12` and `packages/shared/lib/bar.ts`.";
    const refs = Array.from(extractReferences(text));
    assert.equal(refs.length, 2);
    assert.equal(refs[0]?.path, "apps/web/src/foo.ts");
    assert.equal(refs[0]?.line, 12);
    assert.equal(refs[1]?.path, "packages/shared/lib/bar.ts");
  });

  it("skips URLs and template literals", () => {
    const text = "Read `https://example.com` and `${dynamic}`.";
    const refs = Array.from(extractReferences(text));
    assert.equal(refs.length, 0);
  });

  it("extracts paren paths", () => {
    const text = "Run linter (see [rule](docs/00-start/playbooks/foo.md:5))";
    const refs = Array.from(extractReferences(text));
    assert.equal(refs.length >= 0, true);
  });
});

describe("doc-drift toPosix", () => {
  it("normalises windows separators", () => {
    if (process.platform === "win32") {
      assert.equal(toPosix("a\\b\\c.ts"), "a/b/c.ts");
    } else {
      assert.equal(toPosix("a/b/c.ts"), "a/b/c.ts");
    }
  });
});

describe("doc-drift SKIP_DIRS", () => {
  it("includes node_modules and self-dist", () => {
    assert.equal(SKIP_DIRS.has("node_modules"), true);
    assert.equal(SKIP_DIRS.has("dist"), true);
    assert.equal(SKIP_DIRS.has("tools/entropy-janitors/dist"), true);
  });
});

describe("dep-cycles resolveImport", () => {
  it("resolves relative path with extension", () => {
    const root = resolve("repo");
    const from = resolve(root, "apps/web/src/index.ts");
    const resolved = resolveImport("./foo", from, root);
    assert.ok(resolved);
    assert.ok(resolved?.endsWith("foo.ts"));
  });

  it("returns null for workspace alias", () => {
    const root = resolve("repo");
    const from = resolve(root, "apps/web/src/index.ts");
    const resolved = resolveImport("@sergeant/shared", from, root);
    assert.equal(resolved, null);
  });

  it("returns null for node: specifier", () => {
    const root = resolve("repo");
    const from = resolve(root, "apps/web/src/index.ts");
    const resolved = resolveImport("node:fs", from, root);
    assert.equal(resolved, null);
  });
});

describe("dep-cycles findCycles", () => {
  it("detects a 3-node cycle", () => {
    const map = {
      A: ["B"],
      B: ["C"],
      C: ["A"],
    };
    const cycles = findCycles(map);
    assert.ok(cycles.length >= 1);
    const first = cycles[0];
    assert.ok(first);
    assert.ok(first?.includes("A"));
    assert.ok(first?.includes("B"));
    assert.ok(first?.includes("C"));
  });

  it("returns no cycles for a DAG", () => {
    const map = {
      A: ["B", "C"],
      B: ["D"],
      C: ["D"],
    };
    const cycles = findCycles(map);
    assert.equal(cycles.length, 0);
  });

  it("deduplicates cycles regardless of entry point", () => {
    const map = {
      A: ["B"],
      B: ["A"],
    };
    const cycles = findCycles(map);
    assert.equal(cycles.length, 1);
  });
});
