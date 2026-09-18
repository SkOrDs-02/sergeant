/**
 * Unit tests for the `sergeant-design/ai-marker-syntax` rule.
 *
 * Uses ESLint's `Linter` directly (same approach as the other
 * sergeant-design tests). Each case lints a snippet that contains
 * an AI marker comment — valid or malformed — and asserts whether
 * the rule fires.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import plugin from "../index.js";

const linter = new Linter();

const RULE_ID = "sergeant-design/ai-marker-syntax";

function lint(code) {
  return linter.verify(code, {
    plugins: { "sergeant-design": plugin },
    rules: { [RULE_ID]: "error" },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
  });
}

// ── Valid markers (should NOT trigger) ──────────────────────────────────

describe("ai-marker-syntax – valid markers", () => {
  it("accepts // AI-NOTE: <text>", () => {
    const messages =
      lint(`// AI-NOTE: coerce bigint→number; see AGENTS.md rule #1
const x = 1;`);
    assert.deepEqual(messages, []);
  });

  it("accepts // AI-DANGER: <text>", () => {
    const messages =
      lint(`// AI-DANGER: changing this breaks webhook secret validation
const y = 2;`);
    assert.deepEqual(messages, []);
  });

  it("accepts // AI-GENERATED: <generator>", () => {
    const messages =
      lint(`// AI-GENERATED: from packages/api-client/src/codegen.ts
export const ENDPOINTS = {};`);
    assert.deepEqual(messages, []);
  });

  it("accepts // AI-LEGACY: expires YYYY-MM-DD", () => {
    const messages =
      lint(`// AI-LEGACY: expires 2026-06-01. Auto-migrates finyk_token.
function migrate() {}`);
    assert.deepEqual(messages, []);
  });

  it("accepts block comment /* AI-NOTE: … */", () => {
    const messages = lint(`/* AI-NOTE: block comment form is also fine */
const z = 3;`);
    assert.deepEqual(messages, []);
  });

  it("does NOT flag code without any AI markers", () => {
    const messages = lint(`const a = 1;
function foo() { return a + 2; }`);
    assert.deepEqual(messages, []);
  });

  it("does NOT flag 'AI-generated' in prose (mid-sentence)", () => {
    const messages = lint(`/**
 * The Hub surfaces the current week's AI-generated digest in two
 * places: the dashboard card and the weekly email.
 */
const x = 1;`);
    assert.deepEqual(messages, []);
  });

  it("does NOT flag 'AI-generated' in inline prose comment", () => {
    const messages =
      lint(`// This returns the AI-generated summary for the week.
const x = 1;`);
    assert.deepEqual(messages, []);
  });
});

// ── Malformed markers (SHOULD trigger) ──────────────────────────────────

describe("ai-marker-syntax – malformed markers", () => {
  it("flags AI-NOTES (trailing S)", () => {
    const messages = lint(`// AI-NOTES: this has trailing S
const x = 1;`);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
    assert.ok(messages[0].message.includes("AI-NOTES"));
  });

  it("flags AINOTE (missing hyphen)", () => {
    const messages = lint(`// AINOTE: missing hyphen
const x = 1;`);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });

  it("flags AI_NOTE (underscore instead of hyphen)", () => {
    const messages = lint(`// AI_NOTE: underscore separator
const x = 1;`);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });

  it("flags AI-NOTE without colon", () => {
    const messages = lint(`// AI-NOTE missing colon after marker
const x = 1;`);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });

  it("flags AI-DANGER without colon", () => {
    const messages = lint(`// AI-DANGER no colon here
const x = 1;`);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });

  it("flags AI-DANGERS (trailing S)", () => {
    const messages = lint(`// AI-DANGERS: plural form
const x = 1;`);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });

  it("flags AI_GENERATED (underscore)", () => {
    const messages = lint(`// AI_GENERATED: wrong separator
const x = 1;`);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });

  it("flags ai-note (lowercase)", () => {
    const messages = lint(`// ai-note: lowercase variant
const x = 1;`);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });

  it("flags Ai-Note (mixed case)", () => {
    const messages = lint(`// Ai-Note: mixed case variant
const x = 1;`);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });

  it("flags AILEGACY (no separator at all)", () => {
    const messages = lint(`// AILEGACY: no separator
const x = 1;`);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });

  it("flags malformed marker inside block comment", () => {
    const messages = lint(`/* AI_DANGER: block comment with underscore */
const x = 1;`);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });

  it("message includes 'Malformed AI marker'", () => {
    const messages = lint(`// AI_NOTE: bad
const x = 1;`);
    assert.equal(messages.length, 1);
    assert.ok(
      messages[0].message.includes("Malformed AI marker"),
      `Expected message to include "Malformed AI marker", got: ${messages[0].message}`,
    );
  });
});
