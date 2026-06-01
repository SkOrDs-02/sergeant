// Unit tests for the eslint-print-config-diff normaliser and snapshot path
// builder. We don't exercise the actual `eslint --print-config` spawn here
// — that costs ~20s × 8 fixtures and belongs to the CI lint job, not unit
// tests.
//
// Run with:
//   node --test scripts/__tests__/eslint-print-config-diff.test.mjs

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sep } from "node:path";

import {
  normaliseConfig,
  snapshotPathFor,
  FIXTURES,
} from "../eslint-print-config-diff.mjs";

describe("normaliseConfig — path stripping", () => {
  const repoRoot = "/home/runner/work/Sergeant/Sergeant";

  it("replaces repoRoot prefix with <repo> sentinel", () => {
    const input = { file: `${repoRoot}/apps/web/src/main.tsx` };
    const out = normaliseConfig(input, repoRoot);
    assert.equal(out.file, "<repo>/apps/web/src/main.tsx");
  });

  it("normalises native path separators to forward slashes", () => {
    const winRoot = "C:\\repo";
    const input = { file: "C:\\repo\\apps\\web\\file.ts" };
    const out = normaliseConfig(input, winRoot);
    assert.equal(out.file, "<repo>/apps/web/file.ts");
  });

  it("leaves non-repoRoot strings untouched (other than slash conversion)", () => {
    const input = { rule: "no-unused-vars", message: "var X is unused" };
    const out = normaliseConfig(input, repoRoot);
    assert.deepEqual(out, input);
  });

  it("strips paths recursively inside arrays and nested objects", () => {
    const input = {
      rules: { foo: ["error", { src: `${repoRoot}/x.ts` }] },
      files: [`${repoRoot}/a.ts`, `${repoRoot}/b.ts`],
    };
    const out = normaliseConfig(input, repoRoot);
    assert.equal(out.rules.foo[1].src, "<repo>/x.ts");
    assert.deepEqual(out.files, ["<repo>/a.ts", "<repo>/b.ts"]);
  });
});

describe("normaliseConfig — key sorting", () => {
  it("sorts object keys recursively for stable snapshots", () => {
    const input = { z: 1, a: { y: 2, b: 3 } };
    const out = normaliseConfig(input);
    assert.deepEqual(Object.keys(out), ["a", "z"]);
    assert.deepEqual(Object.keys(out.a), ["b", "y"]);
  });

  it("preserves array element order (only keys are sorted)", () => {
    const input = { rules: ["c", "a", "b"] };
    const out = normaliseConfig(input);
    assert.deepEqual(out.rules, ["c", "a", "b"]);
  });
});

describe("normaliseConfig — internal key drop", () => {
  it("drops the `cwd` key (varies by runner)", () => {
    const input = { cwd: "/home/runner/work", rules: {} };
    const out = normaliseConfig(input);
    assert.equal("cwd" in out, false);
    assert.equal("rules" in out, true);
  });
});

describe("normaliseConfig — primitives", () => {
  it("passes null and undefined through unchanged", () => {
    assert.equal(normaliseConfig(null), null);
    assert.equal(normaliseConfig(undefined), undefined);
  });

  it("preserves numbers and booleans", () => {
    const out = normaliseConfig({ enabled: true, level: 2 });
    assert.deepEqual(out, { enabled: true, level: 2 });
  });
});

describe("snapshotPathFor — slug generation", () => {
  it("converts slashes to double-underscore", () => {
    const out = snapshotPathFor("apps/web/src/main.tsx");
    assert.match(out, /apps__web__src__main\.tsx\.json$/);
  });

  it("escapes parens (Expo Router segment dirs)", () => {
    const out = snapshotPathFor("apps/mobile/app/(tabs)/index.tsx");
    assert.match(out, /apps__mobile__app___tabs___index\.tsx\.json$/);
  });

  it("emits paths under scripts/__fixtures__/eslint-print-config", () => {
    const out = snapshotPathFor("x.ts");
    const forward = out.split(sep).join("/");
    assert.match(
      forward,
      /scripts\/__fixtures__\/eslint-print-config\/x\.ts\.json$/,
    );
  });
});

describe("FIXTURES — coverage invariants", () => {
  it("covers every monorepo surface called out in PR-31 § Spliting strategy", () => {
    const expected = [
      "server",
      "web",
      "mobile",
      "mobile-shell",
      "shared",
      "api-client",
      "eslint-plugin-sergeant-design",
      "openclaw",
    ];
    const got = FIXTURES.map((f) => f.surface).sort();
    assert.deepEqual(got, [...expected].sort());
  });

  it("each fixture has a unique surface label", () => {
    const surfaces = FIXTURES.map((f) => f.surface);
    assert.equal(new Set(surfaces).size, surfaces.length);
  });

  it("each fixture path uses forward slashes (cross-platform)", () => {
    for (const f of FIXTURES) {
      assert.equal(f.path.includes("\\"), false, `${f.surface}: ${f.path}`);
    }
  });
});
