/**
 * Unit tests for the `sergeant-design/no-emoji-icon` rule.
 *
 * The rule bans emoji glyphs in `icon` object-properties and JSX `icon=`
 * attributes — Sergeant's SVG Icon catalog (`@shared/components/ui/Icon`)
 * is the canonical system-icon source, so a raw emoji standing in for one
 * is a design-audit slop marker (design-audit F4). It intentionally does
 * NOT look at any other property/attribute name — emoji as user content
 * (habit names, AI-generated recommendation text) is out of scope.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import plugin from "../index.js";

const linter = new Linter();
const RULE_ID = "sergeant-design/no-emoji-icon";

function lint(code, { jsx = false } = {}) {
  return linter.verify(code, {
    plugins: { "sergeant-design": plugin },
    rules: { [RULE_ID]: "error" },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: jsx ? { ecmaFeatures: { jsx: true } } : undefined,
    },
  });
}

describe("no-emoji-icon", () => {
  it("flags an emoji in an object `icon` property", () => {
    const messages = lint(`const x = { icon: "🏋️" };`);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
    assert.match(messages[0].message, /🏋/);
  });

  it("flags an emoji in a quoted `icon` property key", () => {
    const messages = lint(`const x = { "icon": "🥗" };`);
    assert.equal(messages.length, 1);
  });

  it("flags an emoji in a JSX `icon=` attribute", () => {
    const messages = lint(`const el = <Row icon="✅" />;`, { jsx: true });
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });

  it("flags an emoji in a JSXExpressionContainer wrapped literal", () => {
    const messages = lint(`const el = <Row icon={"🥗"} />;`, { jsx: true });
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });

  it("does NOT flag a registered Icon-catalog name", () => {
    const messages = lint(`const x = { icon: "dumbbell" };`);
    assert.equal(messages.length, 0);
  });

  it("does NOT flag a registered name in JSX", () => {
    const messages = lint(`const el = <Row icon="credit-card" />;`, {
      jsx: true,
    });
    assert.equal(messages.length, 0);
  });

  it("does NOT flag emoji in properties/attributes named something else", () => {
    // User-content fields (e.g. a habit's own emoji) are out of scope —
    // the rule only looks at the literal name `icon`.
    const messages = lint(`const x = { emoji: "🧎", label: "🎯" };`);
    assert.equal(messages.length, 0);
  });

  it("does NOT flag emoji in a non-icon JSX attribute", () => {
    const messages = lint(`const el = <Row title="🎯 Focus" />;`, {
      jsx: true,
    });
    assert.equal(messages.length, 0);
  });

  it("does NOT flag a dynamic (non-literal) icon value", () => {
    const messages = lint(`const x = { icon: getIcon() };`);
    assert.equal(messages.length, 0);
  });

  it("does NOT flag a dynamic JSX icon expression", () => {
    const messages = lint(`const el = <Row icon={iconName} />;`, {
      jsx: true,
    });
    assert.equal(messages.length, 0);
  });
});
