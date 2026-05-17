/**
 * Unit tests for `sergeant-design/no-v1-gradient`.
 *
 * The rule blocks re-introduction of Sergeant v1 module gradient utilities
 * (`bg-card-{module}-dark`) and CSS-var references (`var(--gradient-{module})`,
 * `var(--gradient-card-{module}-dark)`) outside the v1 token source files.
 *
 * See docs/design/redesign-v2-migration.md.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import path from "node:path";
import plugin from "../index.js";

const linter = new Linter();
const RULE_ID = "sergeant-design/no-v1-gradient";

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

describe("no-v1-gradient", () => {
  it("flags `bg-card-finyk-dark` Tailwind utility in className", () => {
    const msgs = lint(`
      function Foo() {
        return <div className="bg-card-finyk-dark p-4">x</div>;
      }
    `);
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].ruleId, RULE_ID);
  });

  it("flags every module variant of `bg-card-{module}-dark`", () => {
    for (const m of ["fizruk", "routine", "nutrition"]) {
      const msgs = lint(`
        function Foo() {
          return <div className="dark:bg-card-${m}-dark">x</div>;
        }
      `);
      assert.equal(msgs.length, 1, `module=${m}`);
      assert.equal(msgs[0].ruleId, RULE_ID);
    }
  });

  it("flags `var(--gradient-finyk)` in inline style template", () => {
    const msgs = lint(`
      function Foo() {
        const bg = \`var(--gradient-finyk)\`;
        return <div style={{ background: bg }}>x</div>;
      }
    `);
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].ruleId, RULE_ID);
  });

  it("flags `var(--gradient-card-routine-dark)` in string literal", () => {
    const msgs = lint(`
      const bg = "var(--gradient-card-routine-dark)";
    `);
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].ruleId, RULE_ID);
  });

  it("does NOT flag `bg-hero-grad-finyk` (v2 replacement utility)", () => {
    const msgs = lint(`
      function Foo() {
        return <div className="bg-hero-grad-finyk p-4">x</div>;
      }
    `);
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag `var(--hero-grad-finyk)` (v2 replacement var)", () => {
    const msgs = lint(`
      const bg = "var(--hero-grad-finyk)";
    `);
    assert.equal(msgs.length, 0);
  });

  it("exempts `packages/design-tokens/**` token-bridge files", () => {
    const msgs = lint(
      `const bg = "var(--gradient-card-finyk-dark)";`,
      abs("packages/design-tokens/tailwind-preset.js"),
    );
    assert.equal(msgs.length, 0);
  });

  it("exempts test files", () => {
    const msgs = lint(
      `const bg = "var(--gradient-finyk)";`,
      abs("apps/web/src/modules/finyk/Foo.test.tsx"),
    );
    assert.equal(msgs.length, 0);
  });
});
