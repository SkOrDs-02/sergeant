/**
 * Unit tests for the `sergeant-design/no-small-button-touch-target` rule.
 *
 * Theme 2 (consolidated audit 2026-05-13 / WCAG 2.5.5): raw `<button>` elements
 * with height classes below 44px without touch-target compensators should warn.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import plugin from "../index.js";

const linter = new Linter();
const RULE_ID = "sergeant-design/no-small-button-touch-target";

import path from "node:path";
function abs(p) {
  return path.resolve(process.cwd(), p);
}

function lint(code, filename = abs("apps/web/src/core/hub/HubReports.tsx")) {
  return linter.verify(
    code,
    {
      files: ["**/*.{js,jsx,ts,tsx,mjs,cjs}"],
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

// ─── Valid (compliant touch targets) ──────────────────────────────────────

describe("no-small-button-touch-target — valid", () => {
  it("allows button with min-h-[44px]", () => {
    const messages = lint(`
      const x = <button className="w-8 h-8 min-h-[44px]">click</button>;
    `);
    assert.equal(messages.length, 0);
  });

  it("allows button with min-w-[44px]", () => {
    const messages = lint(`
      const x = <button className="h-8 min-w-[44px]">click</button>;
    `);
    assert.equal(messages.length, 0);
  });

  it("allows button with touch-target", () => {
    const messages = lint(`
      const x = <button className="h-6 touch-target">x</button>;
    `);
    assert.equal(messages.length, 0);
  });

  it("allows button with pointer-coarse class", () => {
    const messages = lint(`
      const x = <button className="h-8 pointer-coarse:min-h-[44px]">x</button>;
    `);
    assert.equal(messages.length, 0);
  });

  it("allows Button component (capitalized)", () => {
    const messages = lint(`
      const x = <Button className="h-8">click</Button>;
    `);
    assert.equal(messages.length, 0);
  });

  it("allows button with h-11 (44px = floor)", () => {
    const messages = lint(`
      const x = <button className="h-11 w-11">click</button>;
    `);
    assert.equal(messages.length, 0);
  });

  it("does NOT flag outside web/mobile scope", () => {
    const messages = lint(
      `const x = <button className="h-8">x</button>;`,
      abs("tools/openclaw/src/something.tsx"),
    );
    assert.equal(messages.length, 0);
  });

  it("does NOT flag test files", () => {
    const messages = lint(
      `const x = <button className="h-6">x</button>;`,
      abs("apps/web/src/core/hub/HubReports.test.tsx"),
    );
    assert.equal(messages.length, 0);
  });

  it("does NOT flag story files", () => {
    const messages = lint(
      `const x = <button className="h-6">x</button>;`,
      abs("apps/web/src/core/hub/HubReports.stories.tsx"),
    );
    assert.equal(messages.length, 0);
  });
});

// ─── Invalid (small button without compensator) ───────────────────────────

describe("no-small-button-touch-target — invalid", () => {
  it("flags button with h-6 only", () => {
    const messages = lint(`
      const x = <button className="h-6 w-6 rounded-xl">x</button>;
    `);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
    assert.ok(messages[0].message.includes("h-6"));
  });

  it("flags button with h-8 only", () => {
    const messages = lint(`
      const x = <button className="h-8 w-8 flex items-center justify-center">click</button>;
    `);
    assert.equal(messages.length, 1);
    assert.ok(messages[0].message.includes("h-8"));
  });

  it("flags button with h-10 only", () => {
    const messages = lint(`
      const x = <button className="h-10 px-3 rounded-xl">click</button>;
    `);
    assert.equal(messages.length, 1);
  });

  it("flags button with size-8 only", () => {
    const messages = lint(`
      const x = <button className="size-8 rounded-xl">click</button>;
    `);
    assert.equal(messages.length, 1);
    assert.ok(messages[0].message.includes("size-8"));
  });
});
