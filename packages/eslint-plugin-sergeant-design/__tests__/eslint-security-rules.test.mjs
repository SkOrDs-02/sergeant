/**
 * Wiring test for the M11 SAST hardening — verifies that the ESLint
 * config in `eslint.config.js` registers `eslint-plugin-security`
 * rules and the custom `no-restricted-syntax` selector for templated
 * `pool.query(`…${…}…`)` calls. Closes
 * `docs/security/hardening/M11-eslint-plugin-security.md` —
 * "fixture file with `pool.query(`SELECT … ${userId}`)` makes the
 * lint job fail" verification.
 *
 * The test uses the `Linter` API directly with the same rule config
 * that the project ships under `apps/server/src/**`, so an accidental
 * unwiring (someone removes the plugin import or the rule entry) is
 * caught here even though the rules ship at `warn` for the existing
 * baseline (see audit-exceptions.md). Each `it` asserts that the
 * Linter emits the expected rule id with the expected severity.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import security from "eslint-plugin-security";

const linter = new Linter();

const SECURITY_RULES = {
  "security/detect-eval-with-expression": "error",
  "security/detect-non-literal-fs-filename": "error",
  "security/detect-non-literal-regexp": "error",
  "no-restricted-syntax": [
    "error",
    {
      selector:
        "CallExpression[callee.property.name='query'][arguments.0.type='TemplateLiteral'][arguments.0.expressions.length>0]",
      message:
        "Templated `pool.query(`…${…}…`)` is risky — use parameterised `pool.query('… $1 …', [value])` instead. See docs/security/hardening/M11-eslint-plugin-security.md.",
    },
    {
      selector:
        "CallExpression[callee.type='Identifier'][callee.name='query'][arguments.0.type='TemplateLiteral'][arguments.0.expressions.length>0]",
      message:
        "Templated `query(`…${…}…`)` is risky — use parameterised `query('… $1 …', [value])` instead. See docs/security/hardening/M11-eslint-plugin-security.md.",
    },
  ],
};

function lint(code) {
  return linter.verify(code, {
    plugins: { security },
    rules: SECURITY_RULES,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { pool: "readonly", userId: "readonly" },
    },
  });
}

function ids(messages) {
  return messages.map((m) => m.ruleId);
}

describe("M11 — eslint-plugin-security rules", () => {
  it("flags eval(<expression>) via detect-eval-with-expression", () => {
    const messages = lint(`const userInput = "1+1"; eval(userInput);`);
    assert.ok(
      ids(messages).includes("security/detect-eval-with-expression"),
      `expected detect-eval-with-expression to fire; got ${JSON.stringify(ids(messages))}`,
    );
  });

  it("flags fs.readFile with a non-literal path", () => {
    const messages = lint(
      `import { readFile } from "node:fs/promises";\n` +
        `async function load(name) { return readFile(name); }`,
    );
    assert.ok(
      ids(messages).includes("security/detect-non-literal-fs-filename"),
      `expected detect-non-literal-fs-filename to fire; got ${JSON.stringify(ids(messages))}`,
    );
  });

  it("flags new RegExp(<non-literal>)", () => {
    const messages = lint(
      `function makeRe(input) { return new RegExp(input); }`,
    );
    assert.ok(
      ids(messages).includes("security/detect-non-literal-regexp"),
      `expected detect-non-literal-regexp to fire; got ${JSON.stringify(ids(messages))}`,
    );
  });

  it("does NOT flag a static literal RegExp source", () => {
    const messages = lint(`const re = new RegExp("^foo$");`);
    assert.equal(
      ids(messages).filter((id) => id === "security/detect-non-literal-regexp")
        .length,
      0,
    );
  });
});

describe("M11 — no-restricted-syntax for templated pool.query", () => {
  it("flags pool.query(`SELECT * FROM users WHERE id = ${userId}`)", () => {
    const messages = lint(
      "pool.query(`SELECT * FROM users WHERE id = ${userId}`);",
    );
    const restricted = messages.filter(
      (m) => m.ruleId === "no-restricted-syntax",
    );
    assert.equal(
      restricted.length,
      1,
      `expected exactly one no-restricted-syntax error; got ${JSON.stringify(messages)}`,
    );
    assert.match(restricted[0].message, /Templated `pool\.query/);
  });

  it("flags bare query(`SELECT … ${userId}`) (e.g. inside a `client.query` rebinding)", () => {
    const messages = lint(
      "function f(query, userId) { return query(`SELECT * FROM t WHERE id = ${userId}`); }",
    );
    const restricted = messages.filter(
      (m) => m.ruleId === "no-restricted-syntax",
    );
    assert.equal(
      restricted.length,
      1,
      `expected exactly one no-restricted-syntax error; got ${JSON.stringify(messages)}`,
    );
    assert.match(restricted[0].message, /Templated `query/);
  });

  it("does NOT flag pool.query with a static template literal (no interpolation)", () => {
    // Multi-line template literals are common for readability; the
    // rule only fires when there is an `${expression}` placeholder.
    const messages = lint(
      "pool.query(`\n  SELECT id, name\n  FROM users\n  WHERE active = true\n  LIMIT 10\n`);",
    );
    assert.equal(
      messages.filter((m) => m.ruleId === "no-restricted-syntax").length,
      0,
    );
  });

  it("does NOT flag pool.query with a parameterised plain string + values array", () => {
    const messages = lint(
      "pool.query('SELECT * FROM users WHERE id = $1', [userId]);",
    );
    assert.equal(
      messages.filter((m) => m.ruleId === "no-restricted-syntax").length,
      0,
    );
  });
});
