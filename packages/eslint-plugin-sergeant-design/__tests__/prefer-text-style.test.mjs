/**
 * Unit tests for `sergeant-design/prefer-text-style`.
 *
 * The rule warns when a className contains a hand-rolled (text-{size},
 * font-{weight}) pair that maps to a known `text-style-*` semantic
 * utility (hero, title, label, caption) — see docs/design/design-system.md.
 *
 * Exempt: design-system primitive files (Button, SectionHeading, etc.)
 * and test files.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import path from "node:path";
import plugin from "../index.js";

const linter = new Linter();
const RULE_ID = "sergeant-design/prefer-text-style";

function abs(p) {
  return path.resolve(process.cwd(), p);
}

function lint(code, filename = abs("apps/web/src/modules/finyk/Foo.tsx")) {
  return linter.verify(
    code,
    {
      files: ["**/*.{js,mjs,cjs,jsx,ts,tsx}"],
      plugins: { "sergeant-design": plugin },
      rules: { [RULE_ID]: "warn" },
      languageOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
    },
    { filename },
  );
}

describe("prefer-text-style", () => {
  it("flags text-sm + font-medium (→ text-style-label)", () => {
    const msgs = lint(`const c = "text-sm font-medium text-fg";`);
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].ruleId, RULE_ID);
    assert.match(msgs[0].message, /text-style-label/);
  });

  it("flags text-sm + font-semibold (→ text-style-label)", () => {
    const msgs = lint(`const c = "flex-1 text-sm font-semibold truncate";`);
    assert.equal(msgs.length, 1);
    assert.match(msgs[0].message, /text-style-label/);
  });

  it("flags text-xs + font-normal (→ text-style-caption)", () => {
    const msgs = lint(`const c = "text-xs font-normal text-muted";`);
    assert.equal(msgs.length, 1);
    assert.match(msgs[0].message, /text-style-caption/);
  });

  it("flags text-xl + font-semibold (→ text-style-title)", () => {
    const msgs = lint(`const c = "text-xl font-semibold leading-snug";`);
    assert.equal(msgs.length, 1);
    assert.match(msgs[0].message, /text-style-title/);
  });

  it("flags text-2xl + font-bold (→ text-style-hero)", () => {
    const msgs = lint(`const c = "text-2xl font-bold tracking-tight";`);
    assert.equal(msgs.length, 1);
    assert.match(msgs[0].message, /text-style-hero/);
  });

  it("does NOT flag when text-style-* is already present", () => {
    const msgs = lint(`const c = "text-style-label text-sm font-medium";`);
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag text-sm alone (no weight pair)", () => {
    const msgs = lint(`const c = "text-sm text-muted";`);
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag font-medium alone (no size pair)", () => {
    const msgs = lint(`const c = "font-medium text-brand-strong";`);
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag unmatched pairs (text-base + font-bold — no slot)", () => {
    const msgs = lint(`const c = "text-base font-bold text-fg";`);
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag Button.tsx (exempt design-system primitive)", () => {
    const msgs = lint(
      `const c = "text-sm font-medium";`,
      abs("apps/web/src/shared/components/ui/Button.tsx"),
    );
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag SectionHeading.tsx (exempt)", () => {
    const msgs = lint(
      `const c = "text-xs font-medium";`,
      abs("apps/web/src/shared/components/ui/SectionHeading.tsx"),
    );
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag test files (exempt)", () => {
    const msgs = lint(
      `const c = "text-sm font-medium";`,
      abs("apps/web/src/modules/finyk/Foo.test.tsx"),
    );
    assert.equal(msgs.length, 0);
  });

  it("flags combo in template literal", () => {
    const msgs = lint("const c = `text-sm font-semibold ${extra}`;");
    assert.equal(msgs.length, 1);
  });
});
