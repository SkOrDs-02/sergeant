/**
 * Unit tests for the `sergeant-design/no-console-pii` rule.
 *
 * Closes audit item S2 from
 * `docs/audits/2026-05-13-security-observability-roast.md` — the rule
 * forbids `console.{log,error,warn,info}` calls whose argument is a
 * string / template literal matching `/email|phone|password|token|secret|auth/i`
 * or an object literal that has (recursively) a key matching the same
 * regex.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import plugin from "../index.js";

const linter = new Linter();
const RULE_ID = "sergeant-design/no-console-pii";

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

// ── BAD: should flag ────────────────────────────────────────────────────

describe("no-console-pii — flags PII / secret-shaped args", () => {
  it("flags console.log with a string literal containing 'email'", () => {
    const messages = lint('console.log("user email: bob@example.com");');
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });

  it("flags console.error with a string literal containing 'password'", () => {
    const messages = lint('console.error("password is wrong");');
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });

  it("flags console.warn with a template literal containing 'auth token'", () => {
    const messages = lint("console.warn(`auth token expired: ${expiry}`);");
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });

  it("flags console.info with an object literal that has an 'email' key", () => {
    const messages = lint(
      'console.info("user", { email: "x@y.z", name: "x" });',
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });

  it("flags console.log with a nested object key 'phone'", () => {
    const messages = lint(
      'console.log({ user: { phone: "+380", name: "x" } });',
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });
});

// ── GOOD: should NOT flag ───────────────────────────────────────────────

describe("no-console-pii — allows safe console output", () => {
  it("allows a plain string literal with no PII keyword", () => {
    const messages = lint('console.log("Hello world");');
    assert.equal(messages.length, 0);
  });

  it("allows an object literal with non-PII keys", () => {
    const messages = lint(
      'console.info("event", { eventName: "x", timestamp: 1 });',
    );
    assert.equal(messages.length, 0);
  });

  it("allows console.debug (not in covered methods) with a PII-shaped string", () => {
    const messages = lint('console.debug("user email: bob@example.com");');
    assert.equal(messages.length, 0);
  });
});
