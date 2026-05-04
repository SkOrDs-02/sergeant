// scripts/ci/__tests__/check-deploy-config-staging-gate.test.mjs
//
// Tests for initiative 0011 phase 1 PR 1.3 — deploy-config staging gate.
// Run with: node --test scripts/ci/__tests__/check-deploy-config-staging-gate.test.mjs

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  deployConfigDialect,
  isBlankOrCommentLine,
  diffIsCommentOnly,
  detectVerificationLabel,
  evaluate,
  VERIFIED_LABEL,
  EMERGENCY_LABEL,
} from "../check-deploy-config-staging-gate.mjs";

// ── deployConfigDialect ──────────────────────────────────────────────────────

describe("deployConfigDialect", () => {
  it("matches vercel.json (any path) as 'none'", () => {
    assert.equal(deployConfigDialect("apps/web/vercel.json"), "none");
    assert.equal(deployConfigDialect("vercel.json"), "none");
    assert.equal(deployConfigDialect("nested/deep/vercel.json"), "none");
  });

  it("matches fly.toml and railway.toml as 'hash'", () => {
    assert.equal(deployConfigDialect("fly.toml"), "hash");
    assert.equal(deployConfigDialect("railway.toml"), "hash");
    assert.equal(deployConfigDialect("ops/grafana-alloy/railway.toml"), "hash");
  });

  it("matches Dockerfile and Dockerfile.* as 'hash'", () => {
    assert.equal(deployConfigDialect("Dockerfile"), "hash");
    assert.equal(deployConfigDialect("Dockerfile.api"), "hash");
    assert.equal(deployConfigDialect("Dockerfile.console"), "hash");
    assert.equal(deployConfigDialect("ops/grafana-alloy/Dockerfile"), "hash");
  });

  it("matches Caddyfile as 'hash'", () => {
    assert.equal(deployConfigDialect("Caddyfile"), "hash");
    assert.equal(deployConfigDialect("ops/Caddyfile"), "hash");
  });

  it("matches apps/server/build.mjs as 'js'", () => {
    assert.equal(deployConfigDialect("apps/server/build.mjs"), "js");
  });

  it("returns null for non-deploy-config files", () => {
    assert.equal(deployConfigDialect("apps/server/src/index.ts"), null);
    assert.equal(deployConfigDialect("README.md"), null);
    assert.equal(deployConfigDialect("package.json"), null);
    assert.equal(deployConfigDialect("apps/web/src/App.tsx"), null);
  });
});

// ── isBlankOrCommentLine ─────────────────────────────────────────────────────

describe("isBlankOrCommentLine", () => {
  it("blank lines are always treated as no-op", () => {
    for (const dialect of ["none", "hash", "js"]) {
      assert.equal(isBlankOrCommentLine("", dialect), true);
      assert.equal(isBlankOrCommentLine("   ", dialect), true);
      assert.equal(isBlankOrCommentLine("\t\t", dialect), true);
    }
  });

  it("'none' (JSON) treats every non-blank line as code", () => {
    assert.equal(
      isBlankOrCommentLine("// not a real json comment", "none"),
      false,
    );
    assert.equal(isBlankOrCommentLine('"foo": 1', "none"), false);
  });

  it("'hash' treats `# …` as comment", () => {
    assert.equal(isBlankOrCommentLine("# this is a comment", "hash"), true);
    assert.equal(isBlankOrCommentLine("  # indented", "hash"), true);
    assert.equal(isBlankOrCommentLine("FROM node:20", "hash"), false);
    assert.equal(isBlankOrCommentLine("[deploy]", "hash"), false);
  });

  it("'js' treats `// …`, `/* …`, ` * …`, `… */` as comments", () => {
    assert.equal(isBlankOrCommentLine("// line comment", "js"), true);
    assert.equal(isBlankOrCommentLine("  // indented", "js"), true);
    assert.equal(isBlankOrCommentLine("/* block start", "js"), true);
    assert.equal(isBlankOrCommentLine(" * continuation", "js"), true);
    assert.equal(isBlankOrCommentLine("end of block */", "js"), true);
    assert.equal(isBlankOrCommentLine('console.log("x")', "js"), false);
  });
});

// ── diffIsCommentOnly ────────────────────────────────────────────────────────

describe("diffIsCommentOnly", () => {
  it("returns true for a pure-comment hash diff", () => {
    const diff = [
      "diff --git a/fly.toml b/fly.toml",
      "--- a/fly.toml",
      "+++ b/fly.toml",
      "@@ -1 +1,2 @@",
      "+# new comment line",
      "+# another comment",
    ].join("\n");
    assert.equal(diffIsCommentOnly(diff, "hash"), true);
  });

  it("returns false when one real-code line slips through", () => {
    const diff = ["@@", "+# comment", "+kill_signal = 'SIGTERM'"].join("\n");
    assert.equal(diffIsCommentOnly(diff, "hash"), false);
  });

  it("returns false for any vercel.json change ('none' dialect)", () => {
    const diff = ["@@", '+"foo": 1'].join("\n");
    assert.equal(diffIsCommentOnly(diff, "none"), false);
  });

  it("returns true for a diff with only blank-line additions", () => {
    const diff = ["@@", "+", "+   "].join("\n");
    assert.equal(diffIsCommentOnly(diff, "hash"), true);
  });

  it("returns true for an empty diff (rename / mode-only)", () => {
    assert.equal(diffIsCommentOnly("", "hash"), true);
    assert.equal(diffIsCommentOnly("similarity index 100%", "hash"), true);
  });

  it("strips file-header lines (+++ / ---) from the comparison", () => {
    const diff = [
      "--- a/Dockerfile.api",
      "+++ b/Dockerfile.api",
      "@@ -3 +3 @@",
      "-RUN echo old",
      "+RUN echo new",
    ].join("\n");
    // Real change to a RUN line — must fail comment-only check.
    assert.equal(diffIsCommentOnly(diff, "hash"), false);
  });

  it("handles js block-comment continuations", () => {
    const diff = ["@@", "+/*", "+ * Update doc-string", "+ */"].join("\n");
    assert.equal(diffIsCommentOnly(diff, "js"), true);
  });
});

// ── detectVerificationLabel ──────────────────────────────────────────────────

describe("detectVerificationLabel", () => {
  it("returns VERIFIED_LABEL when present", () => {
    assert.equal(
      detectVerificationLabel(JSON.stringify(["size/M", VERIFIED_LABEL])),
      VERIFIED_LABEL,
    );
  });

  it("returns EMERGENCY_LABEL when only emergency is present", () => {
    assert.equal(
      detectVerificationLabel(JSON.stringify([EMERGENCY_LABEL])),
      EMERGENCY_LABEL,
    );
  });

  it("prefers VERIFIED_LABEL when both labels are present", () => {
    assert.equal(
      detectVerificationLabel(
        JSON.stringify([EMERGENCY_LABEL, VERIFIED_LABEL]),
      ),
      VERIFIED_LABEL,
    );
  });

  it("returns null for an empty list", () => {
    assert.equal(detectVerificationLabel("[]"), null);
    assert.equal(detectVerificationLabel(""), null);
  });

  it("returns null for malformed JSON", () => {
    assert.equal(detectVerificationLabel("not-json"), null);
  });
});

// ── evaluate ─────────────────────────────────────────────────────────────────

describe("evaluate", () => {
  const realDiff = (path) => `--- a/${path}\n+++ b/${path}\n@@\n+real change\n`;
  const commentDiff = (path) =>
    `--- a/${path}\n+++ b/${path}\n@@\n+# comment\n`;

  it("passes when no deploy-config files are touched", () => {
    const r = evaluate({
      changedFiles: ["src/foo.ts", "README.md"],
      getDiff: (p) => realDiff(p),
      labelsJson: "[]",
    });
    assert.equal(r.ok, true);
    assert.deepEqual(r.offenders, []);
  });

  it("passes when deploy-config diff is comment-only (no label needed)", () => {
    const r = evaluate({
      changedFiles: ["fly.toml"],
      getDiff: () => commentDiff("fly.toml"),
      labelsJson: "[]",
    });
    assert.equal(r.ok, true);
    assert.deepEqual(r.offenders, []);
  });

  it("fails when vercel.json changes without verification label", () => {
    const r = evaluate({
      changedFiles: ["apps/web/vercel.json"],
      getDiff: () => realDiff("apps/web/vercel.json"),
      labelsJson: JSON.stringify(["size/S"]),
    });
    assert.equal(r.ok, false);
    assert.deepEqual(r.offenders, ["apps/web/vercel.json"]);
    assert.match(r.errors.join("\n"), /verified-on-staging/);
    assert.match(r.errors.join("\n"), /PR #1595/);
  });

  it("passes when verified-on-staging label is present", () => {
    const r = evaluate({
      changedFiles: ["fly.toml", "Dockerfile.api"],
      getDiff: realDiff,
      labelsJson: JSON.stringify([VERIFIED_LABEL, "size/M"]),
    });
    assert.equal(r.ok, true);
    assert.equal(r.label, VERIFIED_LABEL);
    assert.deepEqual(r.offenders.sort(), ["Dockerfile.api", "fly.toml"]);
  });

  it("passes (with emergency flag) when only emergency label is present", () => {
    const r = evaluate({
      changedFiles: ["apps/web/vercel.json"],
      getDiff: realDiff,
      labelsJson: JSON.stringify([EMERGENCY_LABEL]),
    });
    assert.equal(r.ok, true);
    assert.equal(r.label, EMERGENCY_LABEL);
    assert.equal(r.emergency, true);
  });

  it("flags multiple deploy-config files at once", () => {
    const r = evaluate({
      changedFiles: ["apps/web/vercel.json", "fly.toml", "Dockerfile.api"],
      getDiff: realDiff,
      labelsJson: "[]",
    });
    assert.equal(r.ok, false);
    assert.equal(r.offenders.length, 3);
  });

  it("ignores comment-only deploy-config diffs even when label is missing", () => {
    const r = evaluate({
      changedFiles: ["fly.toml", "src/index.ts"],
      getDiff: (p) => (p === "fly.toml" ? commentDiff(p) : realDiff(p)),
      labelsJson: "[]",
    });
    assert.equal(r.ok, true);
    assert.deepEqual(r.offenders, []);
  });

  it("flags apps/server/build.mjs real-code changes without a label", () => {
    const r = evaluate({
      changedFiles: ["apps/server/build.mjs"],
      getDiff: () =>
        [
          "--- a/apps/server/build.mjs",
          "+++ b/apps/server/build.mjs",
          "@@",
          '+await copyMigrations({ to: "dist/migrations" });',
        ].join("\n"),
      labelsJson: "[]",
    });
    assert.equal(r.ok, false);
    assert.deepEqual(r.offenders, ["apps/server/build.mjs"]);
  });

  it("does not flag apps/server/build.mjs when only a // comment is added", () => {
    const r = evaluate({
      changedFiles: ["apps/server/build.mjs"],
      getDiff: () =>
        [
          "--- a/apps/server/build.mjs",
          "+++ b/apps/server/build.mjs",
          "@@",
          "+// note: copy migrations after compile",
        ].join("\n"),
      labelsJson: "[]",
    });
    assert.equal(r.ok, true);
  });
});
