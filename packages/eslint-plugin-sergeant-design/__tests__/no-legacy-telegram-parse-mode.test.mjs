/**
 * Unit tests for `sergeant-design/no-legacy-telegram-parse-mode` (M16).
 *
 * The rule bans `parse_mode: "Markdown"` (legacy Telegram parser) in
 * favour of `MarkdownV2` or `HTML`. The legacy parser silently
 * truncates on unbalanced markers and ignores zero-width Unicode
 * sequences; V2 fails loudly. See
 * `docs/security/hardening/M16-telegram-markdown-v2.md`.
 *
 * The selector matches **only** object-property `parse_mode: "Markdown"`,
 * so regex literals / string literals in tests (e.g. the
 * parse-mode-guard regression test that contains the literal string
 * inside a regex) must NOT be flagged.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import plugin from "../index.js";

const linter = new Linter();
const RULE_ID = "sergeant-design/no-legacy-telegram-parse-mode";

function lint(code) {
  return linter.verify(code, {
    plugins: { "sergeant-design": plugin },
    rules: { [RULE_ID]: "error" },
    languageOptions: { ecmaVersion: "latest", sourceType: "module" },
  });
}

describe("no-legacy-telegram-parse-mode — flags legacy literal", () => {
  it("flags inline object literal", () => {
    const messages = lint(`await ctx.reply("hi", { parse_mode: "Markdown" });`);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
    assert.match(messages[0].message, /MarkdownV2/);
  });

  it("flags variable-bound options", () => {
    const messages = lint(
      `const opts = { parse_mode: "Markdown" }; await ctx.reply("hi", opts);`,
    );
    assert.equal(messages.length, 1);
  });

  it("flags string-literal key form", () => {
    const messages = lint(
      `await ctx.reply("hi", { "parse_mode": "Markdown" });`,
    );
    assert.equal(messages.length, 1);
  });
});

describe("no-legacy-telegram-parse-mode — does NOT flag", () => {
  it("MarkdownV2 is fine", () => {
    const messages = lint(
      `await ctx.reply("hi", { parse_mode: "MarkdownV2" });`,
    );
    assert.equal(messages.length, 0);
  });

  it("HTML is fine", () => {
    const messages = lint(`await ctx.reply("hi", { parse_mode: "HTML" });`);
    assert.equal(messages.length, 0);
  });

  it("regex literal containing the legacy phrase is not flagged", () => {
    // The parse-mode-guard regression test has a regex like this —
    // the rule must not fire on string content of regex literals.
    const messages = lint(`const re = /parse_mode:\\s*"Markdown"/g;`);
    assert.equal(messages.length, 0);
  });

  it("string literal in an array is not flagged", () => {
    // The parse-mode-guard test also has `new Set(["Markdown",
    // "MarkdownV2", "HTML"])` for an allow-list assertion — that
    // must continue to compile cleanly.
    const messages = lint(
      `const allowed = new Set(["Markdown", "MarkdownV2", "HTML"]);`,
    );
    assert.equal(messages.length, 0);
  });

  it("computed key is not flagged", () => {
    // Defensive: if someone uses a computed key, the rule does not
    // fire (the legacy literal can't be statically tied to parse_mode).
    const messages = lint(
      `const k = "parse_mode"; const o = { [k]: "Markdown" };`,
    );
    assert.equal(messages.length, 0);
  });

  it("non-Telegram parse_mode key is not flagged when the value is not 'Markdown'", () => {
    const messages = lint(`const o = { parse_mode: "MarkdownV2" };`);
    assert.equal(messages.length, 0);
  });
});
