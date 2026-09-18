import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import tsParser from "@typescript-eslint/parser";
import plugin from "../index.js";

const RULE_ID = "sergeant-design/no-strict-bypass";

// ── helpers ─────────────────────────────────────────────────────────────

/** Lint JS code (comments only — no TS parser needed). */
function lintJS(code, filename = "apps/web/src/modules/finyk/hooks/useTx.js") {
  const linter = new Linter();
  return linter.verify(
    code,
    {
      plugins: { "sergeant-design": plugin },
      rules: { [RULE_ID]: "error" },
      languageOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    { filename },
  );
}

/** Lint TS code (uses @typescript-eslint/parser for TSAsExpression). */
function lintTS(code, filename = "apps/web/src/modules/finyk/hooks/useTx.js") {
  const linter = new Linter();
  return linter.verify(
    code,
    {
      plugins: { "sergeant-design": plugin },
      rules: { [RULE_ID]: "error" },
      languageOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        parser: tsParser,
      },
    },
    { filename },
  );
}

/** Lint with specific forbidPatterns option. */
function lintWithOptions(code, forbidPatterns, useTSParser = false) {
  const linter = new Linter();
  return linter.verify(
    code,
    {
      plugins: { "sergeant-design": plugin },
      rules: { [RULE_ID]: ["error", { forbidPatterns }] },
      languageOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ...(useTSParser ? { parser: tsParser } : {}),
      },
    },
    { filename: "apps/web/src/modules/test.js" },
  );
}

// ── valid (no bypass) ───────────────────────────────────────────────────

describe("no-strict-bypass — valid (clean code)", () => {
  it("allows normal code without bypasses", () => {
    const messages = lintJS(`
      const x = 42;
      const y = "hello";
      function add(a, b) { return a + b; }
    `);
    assert.equal(messages.length, 0);
  });

  it("allows normal TS code with proper types", () => {
    const messages = lintTS(`
      const x: number = 42;
      const y: string = "hello";
      function greet(name: string): string { return name; }
    `);
    assert.equal(messages.length, 0);
  });

  it("allows `as unknown` without a second cast (NOT flagged)", () => {
    const messages = lintTS(`
      const x = someValue as unknown;
    `);
    assert.equal(messages.length, 0);
  });

  it("allows generic type assertions `<T>value`", () => {
    const messages = lintTS(`
      const x = someValue as string;
      const y = someValue as number;
    `);
    assert.equal(messages.length, 0);
  });

  it("allows type assertions to concrete types", () => {
    const messages = lintTS(`
      const el = document.getElementById("foo") as HTMLDivElement;
    `);
    assert.equal(messages.length, 0);
  });

  it("allows regular comments that mention ts-expect-error in prose", () => {
    const messages = lintJS(`
      // We removed the ts-expect-error from this line
      const x = 42;
    `);
    assert.equal(messages.length, 0);
  });
});

// ── invalid (all 4 patterns flagged) ────────────────────────────────────

describe("no-strict-bypass — invalid (flags bypasses)", () => {
  it("flags // @ts-expect-error", () => {
    const messages = lintJS(`
      // @ts-expect-error intentional
      const x = badCall();
    `);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].messageId, "tsExpectError");
  });

  it("flags // @ts-ignore", () => {
    const messages = lintJS(`
      // @ts-ignore
      const x = badCall();
    `);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].messageId, "tsIgnore");
  });

  it("flags `as any`", () => {
    const messages = lintTS(`
      const x = someValue as any;
    `);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].messageId, "asAny");
  });

  it("flags `as unknown as X` double-cast", () => {
    const messages = lintTS(`
      const x = someValue as unknown as string;
    `);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].messageId, "asUnknownAs");
  });

  it("flags multiple bypasses in the same file", () => {
    const messages = lintTS(`
      // @ts-expect-error
      const a = bad1();
      // @ts-ignore
      const b = bad2();
      const c = bad3 as any;
      const d = bad4 as unknown as string;
    `);
    assert.equal(messages.length, 4);
  });

  it("flags @ts-expect-error with extra whitespace", () => {
    const messages = lintJS(`
      //   @ts-expect-error  some reason
      const x = badCall();
    `);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].messageId, "tsExpectError");
  });

  it("flags @ts-ignore inside block comment", () => {
    const messages = lintJS(`
      /* @ts-ignore */
      const x = badCall();
    `);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].messageId, "tsIgnore");
  });

  it("flags `as any` in function arguments", () => {
    const messages = lintTS(`
      doSomething(value as any);
    `);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].messageId, "asAny");
  });

  it("flags `as unknown as` with complex target type", () => {
    const messages = lintTS(`
      const x = window as unknown as { webkitAudioContext: typeof AudioContext };
    `);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].messageId, "asUnknownAs");
  });
});

// ── edge cases ──────────────────────────────────────────────────────────

describe("no-strict-bypass — edge cases", () => {
  it("does NOT flag `as unknown` alone (single cast to unknown)", () => {
    const messages = lintTS(`
      const x = someValue as unknown;
    `);
    assert.equal(messages.length, 0);
  });

  it("does NOT flag `as string` (specific type)", () => {
    const messages = lintTS(`
      const x = someValue as string;
    `);
    assert.equal(messages.length, 0);
  });

  it("does NOT flag `as Record<string, unknown>`", () => {
    const messages = lintTS(`
      const x = someValue as Record<string, unknown>;
    `);
    assert.equal(messages.length, 0);
  });

  it("respects forbidPatterns config — disable tsExpectError", () => {
    const messages = lintWithOptions(
      `// @ts-expect-error disabled\nconst x = 1;`,
      { tsExpectError: false },
    );
    assert.equal(messages.length, 0);
  });

  it("respects forbidPatterns config — disable asAny", () => {
    const messages = lintWithOptions(
      `const x = value as any;`,
      { asAny: false },
      true,
    );
    assert.equal(messages.length, 0);
  });

  it("respects forbidPatterns config — disable asUnknownAs", () => {
    const messages = lintWithOptions(
      `const x = value as unknown as string;`,
      { asUnknownAs: false },
      true,
    );
    assert.equal(messages.length, 0);
  });

  it("respects forbidPatterns config — disable tsIgnore only", () => {
    const messages = lintWithOptions(
      `// @ts-ignore\nconst x = 1;\n// @ts-expect-error\nconst y = 2;`,
      { tsIgnore: false },
    );
    // @ts-ignore should be allowed, but @ts-expect-error still flagged
    assert.equal(messages.length, 1);
    assert.equal(messages[0].messageId, "tsExpectError");
  });
});
