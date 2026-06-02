/**
 * Unit tests for the `sergeant-design/sri-on-third-party-script` rule.
 *
 * S3 (audit `docs/audits/2026-05-13-security-observability-roast.md`,
 * PR-plan `docs/planning/pr-plan-security-obs-2026-05.md`). The rule requires
 * `integrity` (sha256/384/512) + `crossorigin="anonymous"` on cross-origin
 * `<script src="https://…">` (and schema-relative `//cdn…`) in the app HTML
 * shells, so a CDN compromise cannot inject one-step XSS past the CSP.
 *
 * Because ESLint cannot parse `.html` as a JS Program, the rule reads the raw
 * source text and parses it with parse5 inside its `Program` visitor. The
 * tests therefore drive (a) the exported pure helpers, (b) the real fixture
 * files, (c) the rule object itself via a stub ESLint context, and (d) the
 * plugin registration — mirroring the existing `eslint-security-rules` and
 * `lint-html-sri` test patterns.
 *
 * Run: node --test packages/eslint-plugin-sergeant-design/__tests__/sri-on-third-party-script.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import plugin, {
  isCrossOriginScriptSrc,
  validateSriScriptAttrs,
  lintHtmlForSri,
} from "../index.js";

const __filename = fileURLToPath(import.meta.url);
const HERE = dirname(__filename);
const FIXTURES = resolve(HERE, "fixtures/sri");
const REPO_ROOT = resolve(HERE, "..", "..", "..");

function readFixture(name) {
  return readFileSync(resolve(FIXTURES, name), "utf-8");
}

function attrMap(obj) {
  return new Map(Object.entries(obj));
}

const RULE = plugin.rules["sri-on-third-party-script"];

/**
 * Run the actual rule object against raw HTML via a stub ESLint context,
 * returning the reported message-ids. Exercises the rule's `create` /
 * `Program` reporting path (not just the helpers).
 */
function runRule(html) {
  const reports = [];
  const sourceCode = { text: html, getText: () => html };
  const context = {
    sourceCode,
    getSourceCode: () => sourceCode,
    report: (descriptor) => reports.push(descriptor),
  };
  const visitor = RULE.create(context);
  visitor.Program({ type: "Program", loc: { start: {}, end: {} } });
  return reports;
}

// ── isCrossOriginScriptSrc ───────────────────────────────────────────────

describe("isCrossOriginScriptSrc", () => {
  it("treats https:// URLs as cross-origin", () => {
    assert.equal(isCrossOriginScriptSrc("https://cdn.example.com/x.js"), true);
  });
  it("treats http:// URLs as cross-origin", () => {
    assert.equal(isCrossOriginScriptSrc("http://cdn.example.com/x.js"), true);
  });
  it("treats schema-relative // URLs as cross-origin", () => {
    assert.equal(isCrossOriginScriptSrc("//cdn.example.com/x.js"), true);
  });
  it("treats absolute-local /src/main.tsx as same-origin", () => {
    assert.equal(isCrossOriginScriptSrc("/src/main.tsx"), false);
  });
  it("treats relative ./x.js as same-origin", () => {
    assert.equal(isCrossOriginScriptSrc("./x.js"), false);
  });
  it("treats empty / non-string as not cross-origin", () => {
    assert.equal(isCrossOriginScriptSrc(""), false);
    assert.equal(isCrossOriginScriptSrc(undefined), false);
  });
});

// ── validateSriScriptAttrs ───────────────────────────────────────────────

describe("validateSriScriptAttrs", () => {
  it("passes a compliant cross-origin script", () => {
    const v = validateSriScriptAttrs(
      attrMap({
        src: "https://cdn.example.com/x.js",
        integrity:
          "sha384-AbC123+/dEf456gHiJkLmNoPqRsTuVwXyZ0123456789aBcDeFgHiJkLmNoPqRsTuV",
        crossorigin: "anonymous",
      }),
    );
    assert.equal(v.length, 0);
  });

  it("flags missing integrity", () => {
    const v = validateSriScriptAttrs(
      attrMap({
        src: "https://cdn.example.com/x.js",
        crossorigin: "anonymous",
      }),
    );
    assert.deepEqual(
      v.map((x) => x.messageId),
      ["missingIntegrity"],
    );
  });

  it("flags malformed integrity (md5)", () => {
    const v = validateSriScriptAttrs(
      attrMap({
        src: "https://cdn.example.com/x.js",
        integrity: "md5-deadbeef",
        crossorigin: "anonymous",
      }),
    );
    assert.deepEqual(
      v.map((x) => x.messageId),
      ["malformedIntegrity"],
    );
  });

  it("flags missing crossorigin", () => {
    const v = validateSriScriptAttrs(
      attrMap({
        src: "https://cdn.example.com/x.js",
        integrity:
          "sha384-AbC123+/dEf456gHiJkLmNoPqRsTuVwXyZ0123456789aBcDeFgHiJkLmNoPqRsTuV",
      }),
    );
    assert.deepEqual(
      v.map((x) => x.messageId),
      ["missingCrossorigin"],
    );
  });

  it("flags both missing integrity AND crossorigin", () => {
    const v = validateSriScriptAttrs(
      attrMap({ src: "https://cdn.example.com/x.js" }),
    );
    assert.deepEqual(v.map((x) => x.messageId).sort(), [
      "missingCrossorigin",
      "missingIntegrity",
    ]);
  });

  it("accepts sha256 and sha512 algorithms", () => {
    for (const algo of ["sha256", "sha512"]) {
      const v = validateSriScriptAttrs(
        attrMap({
          src: "https://cdn.example.com/x.js",
          integrity: `${algo}-AbC123+/dEf456gHiJkLmNoPqRsTuVwXyZ0123456789aBcD`,
          crossorigin: "anonymous",
        }),
      );
      assert.equal(v.length, 0, `${algo} should be accepted`);
    }
  });

  it("accepts use-credentials as a valid crossorigin value", () => {
    const v = validateSriScriptAttrs(
      attrMap({
        src: "https://cdn.example.com/x.js",
        integrity:
          "sha384-AbC123+/dEf456gHiJkLmNoPqRsTuVwXyZ0123456789aBcDeFgHiJkLmNoPqRsTuV",
        crossorigin: "use-credentials",
      }),
    );
    assert.equal(v.length, 0);
  });

  it("ignores local /src scripts entirely", () => {
    const v = validateSriScriptAttrs(attrMap({ src: "/src/main.tsx" }));
    assert.equal(v.length, 0);
  });

  it("ignores inline scripts (no src)", () => {
    const v = validateSriScriptAttrs(attrMap({ type: "module" }));
    assert.equal(v.length, 0);
  });

  it("accepts space-separated multi-hash integrity", () => {
    const v = validateSriScriptAttrs(
      attrMap({
        src: "https://cdn.example.com/x.js",
        integrity:
          "sha384-AbC123dEf456gHiJkLmNoPqRsTuVwXyZ sha512-ZzYyXxWwVvUuTtSsRrQqPp",
        crossorigin: "anonymous",
      }),
    );
    assert.equal(v.length, 0);
  });
});

// ── lintHtmlForSri (full parse5 pipeline over fixtures) ──────────────────

describe("lintHtmlForSri — fixtures", () => {
  it("good.html produces no violations", () => {
    assert.deepEqual(lintHtmlForSri(readFixture("good.html")), []);
  });

  it("bad-missing-integrity.html flags missingIntegrity", () => {
    const out = lintHtmlForSri(readFixture("bad-missing-integrity.html"));
    assert.deepEqual(
      out.map((x) => x.messageId),
      ["missingIntegrity"],
    );
    assert.ok(out[0].loc && out[0].loc.line > 0, "carries a source location");
  });

  it("bad-missing-crossorigin.html flags missingCrossorigin", () => {
    const out = lintHtmlForSri(readFixture("bad-missing-crossorigin.html"));
    assert.deepEqual(
      out.map((x) => x.messageId),
      ["missingCrossorigin"],
    );
  });

  it("bad-malformed-integrity.html flags malformedIntegrity", () => {
    const out = lintHtmlForSri(readFixture("bad-malformed-integrity.html"));
    assert.deepEqual(
      out.map((x) => x.messageId),
      ["malformedIntegrity"],
    );
  });
});

// ── real apps/web/index.html stays clean (acceptance: clean on main) ─────

describe("lintHtmlForSri — apps/web/index.html", () => {
  it("the production web shell has zero SRI violations", () => {
    const html = readFileSync(
      resolve(REPO_ROOT, "apps/web/index.html"),
      "utf-8",
    );
    assert.deepEqual(lintHtmlForSri(html), []);
  });
});

// ── rule object + plugin registration (wiring) ───────────────────────────

describe("sri-on-third-party-script — rule object & registration", () => {
  it("is registered on the plugin under the canonical id", () => {
    assert.ok(RULE, "plugin.rules['sri-on-third-party-script'] is defined");
    assert.equal(RULE.meta.type, "problem");
    assert.ok(RULE.meta.messages.missingIntegrity);
    assert.ok(RULE.meta.messages.malformedIntegrity);
    assert.ok(RULE.meta.messages.missingCrossorigin);
  });

  it("reports via context.report on a bad fixture (Program path)", () => {
    const reports = runRule(readFixture("bad-missing-integrity.html"));
    assert.equal(reports.length, 1);
    assert.equal(reports[0].messageId, "missingIntegrity");
    assert.equal(reports[0].data.src, "https://cdn.example.com/x.js");
  });

  it("reports nothing on the good fixture (Program path)", () => {
    assert.equal(runRule(readFixture("good.html")).length, 0);
  });
});
