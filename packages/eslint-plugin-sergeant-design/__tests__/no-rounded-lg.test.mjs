/**
 * Unit tests for `sergeant-design/no-rounded-lg`.
 *
 * The rule warns against `rounded-lg` (8 px) in className strings because
 * it sits between the Marker (6 px) and Control (12 px) tiers without a
 * clear semantic role. Developers should use `rounded-md` (Marker) or
 * `rounded-xl` (Control sm) instead — see docs/design/radius-rhythm.md.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import path from "node:path";
import plugin from "../index.js";

const linter = new Linter();
const RULE_ID = "sergeant-design/no-rounded-lg";

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

describe("no-rounded-lg", () => {
  it("flags bare `rounded-lg` in a string literal", () => {
    const msgs = lint(`const c = "px-2 py-1 rounded-lg bg-surface";`);
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].ruleId, RULE_ID);
  });

  it("flags `rounded-lg` with variant prefix (hover:rounded-lg)", () => {
    const msgs = lint(`const c = "hover:rounded-lg focus:outline-none";`);
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].ruleId, RULE_ID);
  });

  it("flags `rounded-lg` inside a template literal", () => {
    const msgs = lint("const c = `px-3 rounded-lg text-sm`;");
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].ruleId, RULE_ID);
  });

  it("does NOT flag `rounded-md` (Marker tier — allowed)", () => {
    const msgs = lint(`const c = "px-1.5 py-0.5 rounded-md bg-brand-soft";`);
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag `rounded-xl` (Control tier — allowed)", () => {
    const msgs = lint(`const c = "w-10 h-10 rounded-xl bg-surface";`);
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag `rounded-2xl` (Card/Control tier — allowed)", () => {
    const msgs = lint(`const c = "p-4 rounded-2xl border border-border";`);
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag `rounded-3xl` (Hero tier — allowed)", () => {
    const msgs = lint(`const c = "p-6 rounded-3xl bg-panel shadow-lg";`);
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag `rounded-full` (Pill — allowed)", () => {
    const msgs = lint(`const c = "w-8 h-8 rounded-full bg-brand";`);
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag `rounded-sm` (Swatch tier — allowed)", () => {
    const msgs = lint(`const c = "w-3 h-3 rounded-sm bg-success";`);
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag files under packages/design-tokens (exempt)", () => {
    const msgs = lint(
      `const c = "rounded-lg";`,
      abs("packages/design-tokens/tailwind-preset.js"),
    );
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag test files (exempt)", () => {
    const msgs = lint(
      `const c = "rounded-lg";`,
      abs("apps/web/src/modules/finyk/Foo.test.tsx"),
    );
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag `rounded-larger` (substring, not the class)", () => {
    // Hypothetical token that starts with 'rounded-lg' but is different.
    const msgs = lint(`const c = "rounded-large px-2";`);
    assert.equal(msgs.length, 0);
  });
});
