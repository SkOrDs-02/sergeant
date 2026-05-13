/**
 * Unit tests for `sergeant-design/no-eyebrow-drift`.
 *
 * The rule flags `className` strings that co-locate the eyebrow trio
 * `uppercase` + `tracking-*` + `text-*` outside the canonical design-system
 * primitives (`<SectionHeading>` / `<Label>`). The rule has no autofix and no
 * file-path allowlist — the responsibility for routing through the DS lives
 * with the author. See `packages/eslint-plugin-sergeant-design/index.js`
 * (`noEyebrowDrift`) and Hard-Rule-adjacent docs in
 * `docs/governance/rules/`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import path from "node:path";
import plugin from "../index.js";

const linter = new Linter();
const RULE_ID = "sergeant-design/no-eyebrow-drift";

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

describe("no-eyebrow-drift", () => {
  it("flags the canonical drift trio (`uppercase tracking-wider text-xs`)", () => {
    const msgs = lint(
      `const c = "uppercase tracking-wider text-xs text-subtle";`,
    );
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].ruleId, RULE_ID);
    assert.match(msgs[0].message, /SectionHeading|Label|eyebrow/i);
  });

  it("flags drift even when classes are re-ordered", () => {
    const msgs = lint(
      `const c = "text-xs tracking-tight uppercase text-muted";`,
    );
    assert.equal(msgs.length, 1);
  });

  it("flags drift with a different tracking step (tracking-tight)", () => {
    const msgs = lint(`const c = "uppercase tracking-tight text-eyebrow";`);
    assert.equal(msgs.length, 1);
  });

  it("does NOT flag arbitrary tracking values (rule's tracking-* regex is \\w-only)", () => {
    // The rule matches `tracking-[\\w-]+` only — arbitrary `tracking-[…]`
    // bracket values are intentionally outside the heuristic. Documenting
    // this gap locks the rule's surface so future regex tweaks (if any)
    // explicitly opt into matching arbitrary tracking.
    const msgs = lint(`const c = "uppercase tracking-[0.3em] text-eyebrow";`);
    assert.equal(msgs.length, 0);
  });

  it("flags drift on text-* color utilities (not just text-size)", () => {
    // The rule's text-* matcher is intentionally broad — any `text-*` token
    // co-located with uppercase + tracking-* triggers it, including
    // text-muted/text-subtle/text-fizruk colors.
    const msgs = lint(`const c = "uppercase tracking-tight text-muted/70";`);
    assert.equal(msgs.length, 1);
  });

  it("does NOT flag uppercase + tracking alone (no text-*)", () => {
    const msgs = lint(`const c = "uppercase tracking-wider";`);
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag tracking-* + text-* without uppercase", () => {
    const msgs = lint(`const c = "tracking-wider text-xs text-subtle";`);
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag uppercase + text-* without tracking-*", () => {
    const msgs = lint(`const c = "uppercase text-xs text-subtle";`);
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag canonical eyebrow utility `text-eyebrow` alone", () => {
    // The named utility *is* the alternative the rule wants authors to use;
    // it doesn't co-locate uppercase/tracking-* in className.
    const msgs = lint(`const c = "text-eyebrow text-subtle";`);
    assert.equal(msgs.length, 0);
  });

  it("flags drift inside template literals", () => {
    const msgs = lint("const c = `uppercase tracking-wider text-xs ${extra}`;");
    assert.equal(msgs.length, 1);
  });

  it("does NOT flag non-className string literals (rule is content-based)", () => {
    // The rule fires on any string Literal/TemplateElement whose value
    // matches all three markers — it is intentionally broad (no
    // attribute-name gating). Anything that *looks* like an eyebrow trio
    // will trip it. We assert the canonical "no drift" content to lock the
    // negative direction.
    const msgs = lint(`const note = "Plain copy with no class tokens.";`);
    assert.equal(msgs.length, 0);
  });

  it("does NOT autofix (rule provides no `fix`)", () => {
    const msgs = lint(
      `const c = "uppercase tracking-wider text-xs text-subtle";`,
    );
    assert.equal(msgs.length, 1);
    // ESLint surfaces `fix` only when the rule provides one; the eyebrow
    // rule deliberately does not auto-rewrite className strings.
    assert.equal(msgs[0].fix, undefined);
  });
});
