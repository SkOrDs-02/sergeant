// scripts/__tests__/lint-html-sri.test.mjs
//
// Unit tests для SRI-gate-у з `scripts/lint-html-sri.mjs` (audit § S3,
// `docs/audits/2026-05-13-security-observability-roast.md`).
//
// Run: node --test scripts/__tests__/lint-html-sri.test.mjs

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "parse5";

import {
  attrsToMap,
  collectScriptElements,
  isCrossOriginScriptSrc,
  lintHtml,
  validateScriptAttrs,
} from "../lint-html-sri.mjs";

const __filename = fileURLToPath(import.meta.url);
const FIXTURES = resolve(dirname(__filename), "fixtures/lint-html-sri");

function readFixture(name) {
  return readFileSync(resolve(FIXTURES, name), "utf-8");
}

// ── isCrossOriginScriptSrc ───────────────────────────────────────────────────

describe("isCrossOriginScriptSrc", () => {
  it("treats https:// URLs as cross-origin", () => {
    assert.equal(
      isCrossOriginScriptSrc("https://cdn.example.com/widget.js"),
      true,
    );
  });

  it("treats http:// URLs as cross-origin (CSP would still block them)", () => {
    assert.equal(
      isCrossOriginScriptSrc("http://cdn.example.com/widget.js"),
      true,
    );
  });

  it("treats schema-relative `//cdn/…` URLs as cross-origin", () => {
    assert.equal(isCrossOriginScriptSrc("//cdn.example.com/widget.js"), true);
  });

  it("treats local absolute and relative paths as same-origin", () => {
    assert.equal(isCrossOriginScriptSrc("/src/main.tsx"), false);
    assert.equal(isCrossOriginScriptSrc("./vendor/x.js"), false);
    assert.equal(isCrossOriginScriptSrc("vendor/x.js"), false);
  });

  it("treats data: / blob: URIs as inline (not cross-origin)", () => {
    assert.equal(isCrossOriginScriptSrc("data:text/javascript,foo"), false);
    assert.equal(isCrossOriginScriptSrc("blob:https://x/abc"), false);
  });

  it("rejects empty / non-string input", () => {
    assert.equal(isCrossOriginScriptSrc(""), false);
    assert.equal(isCrossOriginScriptSrc(undefined), false);
    assert.equal(isCrossOriginScriptSrc(null), false);
  });
});

// ── attrsToMap ───────────────────────────────────────────────────────────────

describe("attrsToMap", () => {
  it("converts parse5 attr list to a Map", () => {
    const m = attrsToMap([
      { name: "src", value: "https://x" },
      { name: "integrity", value: "sha384-abc" },
    ]);
    assert.equal(m.get("src"), "https://x");
    assert.equal(m.get("integrity"), "sha384-abc");
  });

  it("handles missing / empty input", () => {
    assert.equal(attrsToMap(undefined).size, 0);
    assert.equal(attrsToMap([]).size, 0);
  });

  it("keeps the first occurrence on duplicate attribute names", () => {
    const m = attrsToMap([
      { name: "src", value: "first" },
      { name: "src", value: "second" },
    ]);
    assert.equal(m.get("src"), "first");
  });
});

// ── validateScriptAttrs ──────────────────────────────────────────────────────

describe("validateScriptAttrs", () => {
  it("passes inline scripts (no src)", () => {
    assert.deepEqual(validateScriptAttrs(new Map()), []);
  });

  it("passes local module scripts", () => {
    const m = new Map([
      ["type", "module"],
      ["src", "/src/main.tsx"],
    ]);
    assert.deepEqual(validateScriptAttrs(m), []);
  });

  it("passes cross-origin scripts with sha384 + crossorigin=anonymous", () => {
    const m = new Map([
      ["src", "https://cdn.example.com/widget.js"],
      ["integrity", "sha384-AAAA"],
      ["crossorigin", "anonymous"],
    ]);
    assert.deepEqual(validateScriptAttrs(m), []);
  });

  it("accepts use-credentials crossorigin variant", () => {
    const m = new Map([
      ["src", "https://cdn.example.com/widget.js"],
      ["integrity", "sha384-AAAA"],
      ["crossorigin", "use-credentials"],
    ]);
    assert.deepEqual(validateScriptAttrs(m), []);
  });

  it("accepts sha256 / sha512 SRI hashes (spec-compliant)", () => {
    const sha256 = validateScriptAttrs(
      new Map([
        ["src", "https://cdn.example.com/x.js"],
        ["integrity", "sha256-AAAA"],
        ["crossorigin", "anonymous"],
      ]),
    );
    const sha512 = validateScriptAttrs(
      new Map([
        ["src", "https://cdn.example.com/x.js"],
        ["integrity", "sha512-BBBB"],
        ["crossorigin", "anonymous"],
      ]),
    );
    assert.deepEqual(sha256, []);
    assert.deepEqual(sha512, []);
  });

  it("accepts multi-hash integrity (space-separated)", () => {
    const m = new Map([
      ["src", "https://cdn.example.com/x.js"],
      ["integrity", "sha384-AAAA sha512-BBBB"],
      ["crossorigin", "anonymous"],
    ]);
    assert.deepEqual(validateScriptAttrs(m), []);
  });

  it("flags missing integrity", () => {
    const errs = validateScriptAttrs(
      new Map([
        ["src", "https://cdn.example.com/widget.js"],
        ["crossorigin", "anonymous"],
      ]),
    );
    assert.equal(errs.length, 1);
    assert.match(errs[0], /missing integrity attribute/);
  });

  it("flags malformed integrity (unknown algo)", () => {
    const errs = validateScriptAttrs(
      new Map([
        ["src", "https://cdn.example.com/widget.js"],
        ["integrity", "md5-notreal"],
        ["crossorigin", "anonymous"],
      ]),
    );
    assert.equal(errs.length, 1);
    assert.match(errs[0], /malformed integrity/);
  });

  it("flags missing crossorigin", () => {
    const errs = validateScriptAttrs(
      new Map([
        ["src", "https://cdn.example.com/widget.js"],
        ["integrity", "sha384-AAAA"],
      ]),
    );
    assert.equal(errs.length, 1);
    assert.match(errs[0], /missing crossorigin="anonymous"/);
  });

  it("rejects crossorigin set to bogus value", () => {
    const errs = validateScriptAttrs(
      new Map([
        ["src", "https://cdn.example.com/widget.js"],
        ["integrity", "sha384-AAAA"],
        ["crossorigin", "yes-please"],
      ]),
    );
    assert.equal(errs.length, 1);
    assert.match(errs[0], /missing crossorigin/);
  });

  it("collects all violations on a single tag", () => {
    const errs = validateScriptAttrs(
      new Map([["src", "https://cdn.example.com/widget.js"]]),
    );
    assert.equal(errs.length, 2);
  });
});

// ── collectScriptElements ────────────────────────────────────────────────────

describe("collectScriptElements", () => {
  it("finds every <script> in a nested document (direct call)", () => {
    const html =
      "<html><body><script>a</script><div><script src='/x.js'></script></div></body></html>";
    const doc = parse(html);
    const found = collectScriptElements(doc);
    assert.equal(found.length, 2);
  });

  it("returns empty array for documents with no <script>", () => {
    const doc = parse("<html><body><p>hi</p></body></html>");
    assert.deepEqual(collectScriptElements(doc), []);
  });

  it("tolerates null / non-object input", () => {
    assert.deepEqual(collectScriptElements(null), []);
    assert.deepEqual(collectScriptElements(undefined), []);
  });
});

// ── lintHtml integration ─────────────────────────────────────────────────────

describe("lintHtml (fixture integration)", () => {
  it("passes the happy-path fixture (SRI + crossorigin)", () => {
    const result = lintHtml(readFixture("good.html"), "good.html");
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.deepEqual(result.errors, []);
  });

  it("passes a local-only fixture (no cross-origin scripts)", () => {
    const result = lintHtml(readFixture("local-only.html"), "local-only.html");
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.deepEqual(result.errors, []);
  });

  it("fails when integrity is missing (BAD fixture)", () => {
    const result = lintHtml(
      readFixture("bad-missing-integrity.html"),
      "bad-missing-integrity.html",
    );
    assert.equal(result.ok, false);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /missing integrity attribute/);
    // location prefix matches `<file>:<line>:<col>`.
    assert.match(result.errors[0], /bad-missing-integrity\.html:\d+:\d+/);
  });

  it("fails when crossorigin is missing (BAD fixture)", () => {
    const result = lintHtml(
      readFixture("bad-missing-crossorigin.html"),
      "bad-missing-crossorigin.html",
    );
    assert.equal(result.ok, false);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /missing crossorigin/);
  });

  it("fails when integrity uses non-spec algo (BAD fixture)", () => {
    const result = lintHtml(
      readFixture("bad-malformed-integrity.html"),
      "bad-malformed-integrity.html",
    );
    assert.equal(result.ok, false);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /malformed integrity/);
  });

  it("fails for schema-relative cross-origin script without SRI", () => {
    const result = lintHtml(
      readFixture("bad-schema-relative.html"),
      "bad-schema-relative.html",
    );
    assert.equal(result.ok, false);
    // Both `integrity` and `crossorigin` missing → 2 errors on one tag.
    assert.equal(result.errors.length, 2);
    assert.ok(result.errors.some((e) => /missing integrity attribute/.test(e)));
    assert.ok(result.errors.some((e) => /missing crossorigin/.test(e)));
  });
});

// ── Actual apps/web/index.html guard ─────────────────────────────────────────

describe("apps/web/index.html (real target)", () => {
  it("currently passes the SRI gate (no cross-origin scripts statically loaded)", () => {
    const path = resolve(dirname(__filename), "../../apps/web/index.html");
    const html = readFileSync(path, "utf-8");
    const result = lintHtml(html, "apps/web/index.html");
    assert.equal(
      result.ok,
      true,
      `apps/web/index.html should be SRI-clean; got: ${JSON.stringify(
        result.errors,
      )}`,
    );
  });
});
