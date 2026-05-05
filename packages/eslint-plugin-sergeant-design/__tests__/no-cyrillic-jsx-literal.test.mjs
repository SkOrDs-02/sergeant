/**
 * Unit tests for `sergeant-design/no-cyrillic-jsx-literal`.
 *
 * The rule flags inline cyrillic in JSX text and JSX attribute string
 * literals, suggesting extraction to `apps/web/src/shared/i18n/uk.ts`
 * (`messages.<group>.<key>`). Comments, non-JSX literals, test files,
 * stories, and the catalog itself are not flagged. Files listed in
 * the rule's `allowlist` option are also exempt — the burndown gate
 * for item #18 (see `docs/i18n/readiness.md`).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import path from "node:path";
import plugin from "../index.js";

const linter = new Linter();
const RULE_ID = "sergeant-design/no-cyrillic-jsx-literal";

function abs(p) {
  return path.resolve(process.cwd(), p);
}

function lint(
  code,
  filename = abs("apps/web/src/modules/finyk/Foo.tsx"),
  options = [],
) {
  return linter.verify(
    code,
    {
      files: ["**/*.{js,mjs,cjs,jsx,ts,tsx}"],
      plugins: { "sergeant-design": plugin },
      rules: { [RULE_ID]: ["warn", ...options] },
      languageOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
    },
    { filename },
  );
}

describe("no-cyrillic-jsx-literal", () => {
  it("flags JSXText with cyrillic", () => {
    const msgs = lint(`
      function Foo() {
        return <p>Зберегти зміни</p>;
      }
    `);
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].ruleId, RULE_ID);
  });

  it("flags cyrillic JSX attribute string literal", () => {
    const msgs = lint(`
      function Foo() {
        return <button title="Закрити">x</button>;
      }
    `);
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].ruleId, RULE_ID);
  });

  it("flags both JSXText and JSX attribute when both have cyrillic", () => {
    const msgs = lint(`
      function Foo() {
        return <button title="Закрити">Скасувати</button>;
      }
    `);
    assert.equal(msgs.length, 2);
  });

  it("does NOT flag messages.x.y MemberExpression usage", () => {
    const msgs = lint(`
      import { messages } from "@shared/i18n/uk";
      function Foo() {
        return <p>{messages.actions.save}</p>;
      }
    `);
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag plain ASCII JSX text", () => {
    const msgs = lint(`
      function Foo() {
        return <p>Save changes</p>;
      }
    `);
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag cyrillic in regular (non-JSX) string literals", () => {
    // The rule is JSX-scoped to keep noise low (data files, AI prompts,
    // analytics props legitimately contain cyrillic outside of UI text).
    const msgs = lint(`
      const stash = "Збережено локально";
      function Foo() {
        return <p>Hello</p>;
      }
    `);
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag cyrillic in template literals inside JSX expressions", () => {
    const msgs = lint(`
      function Foo({ count }) {
        return <p>{\`Записів: \${count}\`}</p>;
      }
    `);
    // Template literals are not Literal nodes, so the rule skips them.
    // Migrating template-cyrillic is a follow-up scope.
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag in test files (.test.tsx)", () => {
    const msgs = lint(
      `function Foo() { return <p>Кнопка</p>; }`,
      abs("apps/web/src/modules/finyk/Foo.test.tsx"),
    );
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag in __tests__/ directory", () => {
    const msgs = lint(
      `function Foo() { return <p>Кнопка</p>; }`,
      abs("apps/web/src/modules/finyk/__tests__/foo.tsx"),
    );
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag in *.stories.tsx", () => {
    const msgs = lint(
      `function Foo() { return <p>Кнопка</p>; }`,
      abs("apps/web/src/shared/components/ui/Foo.stories.tsx"),
    );
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag in shared/i18n/ catalog", () => {
    const msgs = lint(
      `export const messages = { auth: { failure: "Помилка" } };`,
      abs("apps/web/src/shared/i18n/uk.ts"),
    );
    assert.equal(msgs.length, 0);
  });

  it("respects allowlist — does NOT flag a file listed in allowlist", () => {
    const filename = abs("apps/web/src/modules/finyk/LegacyForm.tsx");
    const msgs = lint(
      `function Foo() { return <p>Поки що ще не мігровано</p>; }`,
      filename,
      [{ allowlist: ["apps/web/src/modules/finyk/LegacyForm.tsx"] }],
    );
    assert.equal(msgs.length, 0);
  });

  it("flags when allowlist has a different file", () => {
    const filename = abs("apps/web/src/modules/finyk/Foo.tsx");
    const msgs = lint(`function Foo() { return <p>Привіт</p>; }`, filename, [
      { allowlist: ["apps/web/src/modules/other/Bar.tsx"] },
    ]);
    assert.equal(msgs.length, 1);
  });
});
