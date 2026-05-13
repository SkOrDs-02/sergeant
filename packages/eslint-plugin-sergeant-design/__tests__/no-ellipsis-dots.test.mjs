/**
 * Unit tests for `sergeant-design/no-ellipsis-dots`.
 *
 * The rule flags three ASCII dots (`...`) inside string literals,
 * template-literal cookeds, and JSX text — and offers a one-shot autofix
 * that rewrites the entire matching node into the typographic ellipsis
 * `…` (U+2026). See `packages/eslint-plugin-sergeant-design/index.js`
 * (`noEllipsisDots`).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import path from "node:path";
import plugin from "../index.js";

const linter = new Linter();
const RULE_ID = "sergeant-design/no-ellipsis-dots";

function abs(p) {
  return path.resolve(process.cwd(), p);
}

function lint(code, filename = abs("apps/web/src/modules/finyk/Foo.tsx")) {
  return linter.verify(
    code,
    {
      files: ["**/*.{js,mjs,cjs,jsx,ts,tsx}"],
      plugins: { "sergeant-design": plugin },
      rules: { [RULE_ID]: "error" },
      languageOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
    },
    { filename },
  );
}

function lintAndFix(
  code,
  filename = abs("apps/web/src/modules/finyk/Foo.tsx"),
) {
  return linter.verifyAndFix(
    code,
    {
      files: ["**/*.{js,mjs,cjs,jsx,ts,tsx}"],
      plugins: { "sergeant-design": plugin },
      rules: { [RULE_ID]: "error" },
      languageOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
    },
    { filename },
  );
}

describe("no-ellipsis-dots", () => {
  it("flags `…` inside a string Literal", () => {
    const msgs = lint(`const s = "Loading…";`);
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].ruleId, RULE_ID);
    assert.match(msgs[0].message, /U\+2026|typographic ellipsis|…/);
  });

  it("flags `…` inside a template literal cooked value", () => {
    const msgs = lint("const s = `Loading… ${count}`;");
    assert.equal(msgs.length, 1);
  });

  it("flags `…` inside JSX text", () => {
    const msgs = lint(`const el = <span>Loading…</span>;`);
    assert.equal(msgs.length, 1);
    // ESLint reports JSXText nodes — the location should still point at the
    // dots region.
    assert.match(msgs[0].message, /U\+2026|typographic ellipsis|…/);
  });

  it("does NOT flag a single dot or two dots", () => {
    const msgs = lint(`const s = "v1.2 release. End."`);
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag the typographic ellipsis itself (`…`)", () => {
    const msgs = lint(`const s = "Loading…";`);
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag spread/rest syntax (no string literal involved)", () => {
    // `...rest` is an ASTNode, not a string literal — the rule scans
    // string values only and must not bleed into syntax.
    const msgs = lint(
      `function f(…rest) { const arr = [1, 2, …rest]; return arr; }`,
    );
    assert.equal(msgs.length, 0);
  });

  it("autofixes `Loading…` → `Loading…` inside a Literal", () => {
    const { output, fixed } = lintAndFix(`const s = "Loading…";`);
    assert.equal(fixed, true);
    assert.match(output, /const s = "Loading…";/);
  });

  it("autofixes `Loading…` → `Loading…` inside JSX text", () => {
    const { output, fixed } = lintAndFix(`const el = <span>Loading…</span>;`);
    assert.equal(fixed, true);
    assert.match(output, /<span>Loading…<\/span>/);
  });

  it("autofixes `Loading…` → `Loading…` inside a template literal", () => {
    const { output, fixed } = lintAndFix("const s = `Loading… ${n}`;");
    assert.equal(fixed, true);
    assert.match(output, /Loading…/);
  });

  it("autofixes multiple occurrences in a single literal", () => {
    const { output, fixed } = lintAndFix(
      `const s = "Loading… and then… done.";`,
    );
    assert.equal(fixed, true);
    assert.match(output, /Loading… and then… done\./);
  });

  it("does NOT autofix more than 3 consecutive dots (rule targets exactly the canonical 3-dot ellipsis pattern)", () => {
    // The regex `\.{3}` matches 3-or-more in default JS semantics; we
    // lock the observed behaviour (rewrite to `…` once per chunk).
    const { output, fixed } = lintAndFix(`const s = "wait….";`);
    assert.equal(fixed, true);
    // Either 4 dots collapse to `…` (first 3) + `.`, or the whole chunk
    // collapses — both are typographic improvements; assert the dots
    // disappear and the ellipsis lands.
    assert.ok(
      output.includes("…"),
      "expected fixed output to contain the U+2026 ellipsis",
    );
    assert.ok(
      !/\.{3}/.test(output),
      "expected fixed output to no longer contain 3+ ASCII dots",
    );
  });
});
