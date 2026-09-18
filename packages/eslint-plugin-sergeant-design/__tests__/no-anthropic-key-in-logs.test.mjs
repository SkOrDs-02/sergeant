/**
 * Unit tests for the `sergeant-design/no-anthropic-key-in-logs` rule.
 *
 * The rule prevents accidental logging of Anthropic API keys (or any
 * secret) via `console.*`, `logger.*`, `pino.*`, or `log.*` methods.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import plugin from "../index.js";

const linter = new Linter();
const RULE_ID = "sergeant-design/no-anthropic-key-in-logs";

function lint(code, options) {
  const ruleConfig = options ? ["error", options] : "error";
  return linter.verify(code, {
    plugins: { "sergeant-design": plugin },
    rules: { [RULE_ID]: ruleConfig },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
  });
}

// ── BAD: should flag ────────────────────────────────────────────────────

describe("no-anthropic-key-in-logs \u2014 flags secret logging", () => {
  it("flags console.log(process.env.ANTHROPIC_API_KEY)", () => {
    const messages = lint(`console.log(process.env.ANTHROPIC_API_KEY);`);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });

  it("flags console.error(process.env.ANTHROPIC_API_KEY)", () => {
    const messages = lint(`console.error(process.env.ANTHROPIC_API_KEY);`);
    assert.equal(messages.length, 1);
  });

  it("flags console.warn(process.env.ANTHROPIC_API_KEY)", () => {
    const messages = lint(`console.warn(process.env.ANTHROPIC_API_KEY);`);
    assert.equal(messages.length, 1);
  });

  it("flags console.info(process.env.ANTHROPIC_API_KEY)", () => {
    const messages = lint(`console.info(process.env.ANTHROPIC_API_KEY);`);
    assert.equal(messages.length, 1);
  });

  it("flags console.debug(process.env.ANTHROPIC_API_KEY)", () => {
    const messages = lint(`console.debug(process.env.ANTHROPIC_API_KEY);`);
    assert.equal(messages.length, 1);
  });

  it("flags logger.info(process.env.ANTHROPIC_API_KEY)", () => {
    const messages = lint(`logger.info(process.env.ANTHROPIC_API_KEY);`);
    assert.equal(messages.length, 1);
  });

  it("flags pino.warn(process.env.ANTHROPIC_API_KEY)", () => {
    const messages = lint(`pino.warn(process.env.ANTHROPIC_API_KEY);`);
    assert.equal(messages.length, 1);
  });

  it("flags log.error(process.env.ANTHROPIC_API_KEY)", () => {
    const messages = lint(`log.error(process.env.ANTHROPIC_API_KEY);`);
    assert.equal(messages.length, 1);
  });

  it("flags logger.trace(process.env.ANTHROPIC_API_KEY)", () => {
    const messages = lint(`logger.trace(process.env.ANTHROPIC_API_KEY);`);
    assert.equal(messages.length, 1);
  });

  it("flags logger.fatal(process.env.ANTHROPIC_API_KEY)", () => {
    const messages = lint(`logger.fatal(process.env.ANTHROPIC_API_KEY);`);
    assert.equal(messages.length, 1);
  });

  it("flags template literal with process.env.ANTHROPIC_API_KEY", () => {
    const messages = lint(
      "console.log(`Key is ${process.env.ANTHROPIC_API_KEY}`);",
    );
    assert.equal(messages.length, 1);
  });

  it("flags string concatenation with process.env.ANTHROPIC_API_KEY", () => {
    const messages = lint(
      'console.log("Key: " + process.env.ANTHROPIC_API_KEY);',
    );
    assert.equal(messages.length, 1);
  });

  it("flags ANTHROPIC_API_KEY identifier as second arg", () => {
    const messages = lint(
      'console.log("key:", process.env.ANTHROPIC_API_KEY);',
    );
    assert.equal(messages.length, 1);
  });

  it("flags apiKey identifier with @anthropic-ai/sdk import", () => {
    const messages = lint(`
      import Anthropic from "@anthropic-ai/sdk";
      const apiKey = getKey();
      console.log(apiKey);
    `);
    assert.equal(messages.length, 1);
  });

  it("flags anthropicKey identifier with @anthropic-ai/sdk import", () => {
    const messages = lint(`
      import Anthropic from "@anthropic-ai/sdk";
      const anthropicKey = "sk-test";
      console.log(anthropicKey);
    `);
    assert.equal(messages.length, 1);
  });

  it("flags secret identifier with @anthropic-ai/sdk import", () => {
    const messages = lint(`
      import { Anthropic } from "@anthropic-ai/sdk";
      const secret = getSecret();
      logger.info(secret);
    `);
    assert.equal(messages.length, 1);
  });

  it("flags obj.apiKey with @anthropic-ai/sdk import", () => {
    const messages = lint(`
      import Anthropic from "@anthropic-ai/sdk";
      console.log(config.apiKey);
    `);
    assert.equal(messages.length, 1);
  });

  it("flags template literal interpolating apiKey with @anthropic-ai/sdk import", () => {
    const messages = lint(
      'import Anthropic from "@anthropic-ai/sdk";\nconsole.log(`key=${apiKey}`);',
    );
    assert.equal(messages.length, 1);
  });
});

// ── GOOD: should NOT flag ───────────────────────────────────────────────

describe("no-anthropic-key-in-logs \u2014 allows safe logging", () => {
  it("allows console.log with a plain string", () => {
    const messages = lint('console.log("Hello world");');
    assert.equal(messages.length, 0);
  });

  it("allows console.log with a number", () => {
    const messages = lint("console.log(42);");
    assert.equal(messages.length, 0);
  });

  it("allows console.log with a non-secret variable", () => {
    const messages = lint("const name = 'test';\nconsole.log(name);");
    assert.equal(messages.length, 0);
  });

  it("does NOT flag apiKey without @anthropic-ai/sdk import", () => {
    const messages = lint("const apiKey = getKey();\nconsole.log(apiKey);");
    assert.equal(messages.length, 0);
  });

  it("does NOT flag secret without @anthropic-ai/sdk import", () => {
    const messages = lint("const secret = 'x';\nlogger.info(secret);");
    assert.equal(messages.length, 0);
  });

  it("does NOT flag non-logger function call with key", () => {
    const messages = lint("sendEmail(process.env.ANTHROPIC_API_KEY);");
    assert.equal(messages.length, 0);
  });

  it("does NOT flag myCustomLogger.info (unknown logger object)", () => {
    const messages = lint(
      "myCustomLogger.info(process.env.ANTHROPIC_API_KEY);",
    );
    assert.equal(messages.length, 0);
  });

  it("does NOT flag console.table (not in CONSOLE_METHODS)", () => {
    const messages = lint("console.table(process.env.ANTHROPIC_API_KEY);");
    assert.equal(messages.length, 0);
  });

  it("allows logging error messages that mention 'key' as a string literal", () => {
    const messages = lint('console.error("ANTHROPIC_API_KEY is not set");');
    assert.equal(messages.length, 0);
  });

  it("allows using process.env.ANTHROPIC_API_KEY outside of log calls", () => {
    const messages = lint(
      "const key = process.env.ANTHROPIC_API_KEY;\nconst client = new Anthropic({ apiKey: key });",
    );
    assert.equal(messages.length, 0);
  });
});

// ── Custom config ───────────────────────────────────────────────────────

describe("no-anthropic-key-in-logs \u2014 custom additionalSecretIdentifiers", () => {
  it("flags custom pattern from additionalSecretIdentifiers", () => {
    const messages = lint(
      `
      import Anthropic from "@anthropic-ai/sdk";
      const myCustomToken = "tok-123";
      console.log(myCustomToken);
    `,
      { additionalSecretIdentifiers: ["Token$"] },
    );
    assert.equal(messages.length, 1);
  });

  it("does NOT flag unmatched custom pattern", () => {
    const messages = lint(
      `
      import Anthropic from "@anthropic-ai/sdk";
      const userId = "user-123";
      console.log(userId);
    `,
      { additionalSecretIdentifiers: ["Token$"] },
    );
    assert.equal(messages.length, 0);
  });
});
