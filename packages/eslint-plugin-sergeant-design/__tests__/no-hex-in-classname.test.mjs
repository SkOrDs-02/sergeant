/**
 * Unit tests for the `sergeant-design/no-hex-in-classname` rule.
 *
 * The rule bans Tailwind arbitrary-value hex colors (`bg-[#...]`,
 * `text-[#fff]/50`, `ring-[#000]`, …) in className strings because they
 * bypass the design-system token layer (dark-mode, WCAG tiers, palette
 * migration all stop working for those literals).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import plugin from "../index.js";

const linter = new Linter();
const RULE_ID = "sergeant-design/no-hex-in-classname";

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

describe("no-hex-in-classname", () => {
  it("flags `bg-[#10b981]`", () => {
    const messages = lint(`const c = "rounded bg-[#10b981] p-4";`);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
    assert.match(messages[0].message, /bg-\[#10b981\]/);
  });

  it("flags `text-[#fff]` with variant prefix", () => {
    const messages = lint(`const c = "hover:text-[#ffffff] dark:text-[#111]";`);
    assert.equal(messages.length, 2);
    assert.equal(messages[0].ruleId, RULE_ID);
  });

  it("flags each hex utility in a soup", () => {
    const messages = lint(
      `const c = "bg-[#fff] border-[#000] ring-[#abc] text-sm";`,
    );
    assert.equal(messages.length, 3);
  });

  it("flags 3, 4, 6, and 8 digit hex", () => {
    for (const hex of ["#fff", "#ffff", "#ffffff", "#ffffffff"]) {
      const messages = lint(`const c = "bg-[${hex}]";`);
      assert.equal(
        messages.length,
        1,
        `should flag ${hex} (len ${hex.length - 1})`,
      );
    }
  });

  it("does NOT flag non-color utilities with arbitrary hex-like values", () => {
    // `w-[#foo]` isn't a color utility; hex in content/URL should also
    // be ignored.
    const messages = lint(
      `const c = "w-[12px] content-['#f'] before:content-['#123']";`,
    );
    assert.equal(messages.length, 0);
  });

  it("does NOT flag valid semantic tokens", () => {
    const messages = lint(
      `const c = "bg-surface text-fg border-border bg-finyk-surface text-brand-strong bg-success-soft";`,
    );
    assert.equal(messages.length, 0);
  });

  it("does NOT flag hex literals that aren't className utilities", () => {
    // Hex in plain strings (e.g. chart config) is not this rule's concern.
    const messages = lint(`const c = "#10b981";`);
    assert.equal(messages.length, 0);
  });

  it("flags hex inside template literal quasi", () => {
    const messages = lint(`const c = \`rounded \${foo} bg-[#10b981] p-4\`;`);
    assert.equal(messages.length, 1);
  });

  it("flags hex inside cn() argument soup", () => {
    const messages = lint(
      `const c = cn("base", active && "bg-[#ff0000]", disabled && "text-[#999]");`,
    );
    assert.equal(messages.length, 2);
  });

  it("reports the offending utility prefix in the message", () => {
    const messages = lint(`const c = "border-[#cafeba]";`);
    assert.equal(messages.length, 1);
    assert.match(messages[0].message, /border-\[#cafeba\]/);
  });

  it("does NOT flag malformed hex lengths (5 or 7 digits)", () => {
    const messages = lint(`const c = "bg-[#12345] text-[#1234567]";`);
    assert.equal(messages.length, 0);
  });

  it("does NOT flag arbitrary-value non-hex colors (oklch, rgb, hsl, var)", () => {
    const messages = lint(
      `const c = "bg-[oklch(0.5_0.1_120)] text-[rgb(10,20,30)] border-[var(--accent)]";`,
    );
    assert.equal(messages.length, 0);
  });
});
