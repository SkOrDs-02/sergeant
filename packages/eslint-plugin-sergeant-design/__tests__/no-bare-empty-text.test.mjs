/**
 * Unit tests for `sergeant-design/no-bare-empty-text`.
 *
 * The rule warns against bare JSX text or string literals containing
 * Ukrainian empty-state phrases ("Поки немає", "ще немає", etc.) outside
 * an <EmptyState> or <ModuleEmptyState> component.
 *
 * See docs/design/empty-states.md for the three-tier system.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import path from "node:path";
import plugin from "../index.js";

const linter = new Linter();
const RULE_ID = "sergeant-design/no-bare-empty-text";

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

describe("no-bare-empty-text", () => {
  it("flags bare JSXText with 'Поки немає' pattern", () => {
    const msgs = lint(`
      function Foo() {
        return <p>Поки немає транзакцій</p>;
      }
    `);
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].ruleId, RULE_ID);
  });

  it("flags 'Поки що порожньо' in JSX text", () => {
    const msgs = lint(`
      function Foo() {
        return <span className="text-xs text-muted">Поки що порожньо</span>;
      }
    `);
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].ruleId, RULE_ID);
  });

  it("does NOT flag 'ще немає' in LogicalExpression (too complex for static analysis)", () => {
    // `items.length === 0 && "ще немає записів"` — the rule does not
    // attempt to trace through logical expressions to avoid false positives.
    // The JSXText case (bare text content) is the primary target.
    const msgs = lint(`
      function Foo({ items }) {
        return <div>{items.length === 0 && "ще немає записів"}</div>;
      }
    `);
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag 'Поки немає' inside <EmptyState> title prop", () => {
    const msgs = lint(`
      function Foo() {
        return (
          <EmptyState title="Поки немає транзакцій" />
        );
      }
    `);
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag 'ще немає' inside <ModuleEmptyState>", () => {
    const msgs = lint(`
      function Foo() {
        return (
          <ModuleEmptyState>
            <p>ще немає даних</p>
          </ModuleEmptyState>
        );
      }
    `);
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag unrelated Ukrainian text (no signal phrase)", () => {
    const msgs = lint(`
      function Foo() {
        return <p>Додати транзакцію</p>;
      }
    `);
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag 'не має даних' in EmptyState description prop string", () => {
    const msgs = lint(`
      function Foo() {
        return <EmptyState description="не має даних для відображення" />;
      }
    `);
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag empty signal phrase in a non-JSX context (plain JS)", () => {
    const msgs = lint(`const msg = "Поки немає записів";`);
    assert.equal(msgs.length, 0);
  });
});
