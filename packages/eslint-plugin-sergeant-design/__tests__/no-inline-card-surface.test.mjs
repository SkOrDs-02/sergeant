/**
 * Unit tests for `sergeant-design/no-inline-card-surface`.
 *
 * The rule flags the hand-rolled raised-card recipe — `bg-panel` (or
 * `bg-surface`) + a `border-line` (or `border-border`) hairline + one of the
 * semantic elevation shadows (`shadow-e1..e5` / legacy `shadow-card` /
 * `shadow-float` / `shadow-soft`) — co-present in a single className string.
 * Callers should use the <Card> primitive instead so the surface stays
 * token-driven (design-audit 2026-07 finding M1).
 *
 * Precision matters: the rule fires ONLY when all three markers are present,
 * so flat panels, the neutral `secondary` Button (`border-border-strong`),
 * and the v2 glass surface (`shadow-card-v2`) must NOT trip it.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import path from "node:path";
import plugin from "../index.js";

const linter = new Linter();
const RULE_ID = "sergeant-design/no-inline-card-surface";

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

describe("no-inline-card-surface", () => {
  it("flags the canonical bg-panel + border-line + shadow-e1 triple", () => {
    const msgs = lint(`const c = "p-4 bg-panel border border-line shadow-e1";`);
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].ruleId, RULE_ID);
  });

  it("flags the semantic-alias triple (bg-surface + border-border + shadow-e2)", () => {
    const msgs = lint(
      `const c = "bg-surface border border-border shadow-e2 rounded-2xl";`,
    );
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].ruleId, RULE_ID);
  });

  it("flags the triple inside a template literal", () => {
    const msgs = lint("const c = `bg-panel border-line shadow-e3 p-5`;");
    assert.equal(msgs.length, 1);
  });

  it("flags legacy shadow aliases (shadow-card)", () => {
    const msgs = lint(`const c = "bg-panel border border-line shadow-card";`);
    assert.equal(msgs.length, 1);
  });

  it("flags with an opacity suffix on the hairline (border-line/60)", () => {
    const msgs = lint(`const c = "bg-panel border border-line/60 shadow-e1";`);
    assert.equal(msgs.length, 1);
  });

  it("does NOT flag a flat panel (no elevation shadow)", () => {
    const msgs = lint(`const c = "bg-panel border border-line rounded-2xl";`);
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag the neutral secondary Button (border-border-strong)", () => {
    const msgs = lint(
      `const c = "bg-panel text-text border border-border-strong shadow-e1";`,
    );
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag the v2 glass surface (bg-surface-glass + shadow-card-v2)", () => {
    const msgs = lint(
      `const c = "bg-surface-glass backdrop-blur-md border border-surface-line shadow-card-v2";`,
    );
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag a shadow+border without a panel background", () => {
    const msgs = lint(
      `const c = "bg-transparent border border-line shadow-e1";`,
    );
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag a panel+shadow without the hairline border", () => {
    const msgs = lint(`const c = "bg-panel shadow-e1 rounded-2xl";`);
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag bg-panelHi (longer token, not bg-panel)", () => {
    const msgs = lint(`const c = "bg-panelHi border border-line shadow-e1";`);
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag the Card primitive file itself (exempt)", () => {
    const msgs = lint(
      `const c = "bg-panel border border-line shadow-e1";`,
      abs("apps/web/src/shared/components/ui/Card.tsx"),
    );
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag the Surface primitive file itself (exempt)", () => {
    const msgs = lint(
      `const c = "bg-panel border border-line shadow-e1";`,
      abs("apps/web/src/shared/components/ui/Surface.tsx"),
    );
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag story files (exempt — demo raw tokens)", () => {
    const msgs = lint(
      `const c = "bg-panel border border-line shadow-e1";`,
      abs("apps/web/src/shared/components/ui/Card.stories.tsx"),
    );
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag DesignShowcase sections (exempt)", () => {
    const msgs = lint(
      `const c = "bg-panel border border-line shadow-e1";`,
      abs("apps/web/src/core/DesignShowcase/sections/Elevation.tsx"),
    );
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag files under packages/design-tokens (exempt)", () => {
    const msgs = lint(
      `const c = "bg-panel border border-line shadow-e1";`,
      abs("packages/design-tokens/tailwind-preset.js"),
    );
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag test files (exempt)", () => {
    const msgs = lint(
      `const c = "bg-panel border border-line shadow-e1";`,
      abs("apps/web/src/modules/finyk/Foo.test.tsx"),
    );
    assert.equal(msgs.length, 0);
  });
});
