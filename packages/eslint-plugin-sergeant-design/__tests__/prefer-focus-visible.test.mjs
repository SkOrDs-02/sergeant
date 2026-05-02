/**
 * Unit tests for the `sergeant-design/prefer-focus-visible` rule.
 *
 * The rule fires on `focus:<utility>-…` color/border/ring/shadow
 * utilities — those must be `focus-visible:` instead so pointer
 * clicks don't blink the focus indicator. The single legitimate
 * `focus:` utility is `focus:outline-none` (the canonical reset
 * that pairs with `focus-visible:ring-*`).
 *
 * Spec source:
 *   docs/design/design-system.md → "Focus — focus-visible:ring-…,
 *   а не focus:, аби pointer-клік не блимав кільцем."
 *   docs/audits/ux-audit-2025.md  → "focus-visible:ring-2 ring-brand-500/45
 *   у нових інтерактивних елементах (замість focus:ring-*, яке показується
 *   і для mouse)."
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import plugin from "../index.js";

const linter = new Linter();
const RULE_ID = "sergeant-design/prefer-focus-visible";

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

describe("prefer-focus-visible", () => {
  // ── positive cases ────────────────────────────────────────────────

  it("flags `focus:bg-panel`", () => {
    const messages = lint(`const c = "focus:bg-panel border";`);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
    assert.match(messages[0].message, /focus:bg-panel/);
    assert.match(messages[0].message, /focus-visible:bg-panel/);
  });

  it("flags `focus:border-brand-400`", () => {
    const messages = lint(
      `const c = "focus:outline-none focus:border-brand-400";`,
    );
    assert.equal(messages.length, 1);
    assert.match(messages[0].message, /focus:border-brand-400/);
    assert.match(messages[0].message, /focus-visible:border-brand-400/);
  });

  it("flags `focus:ring-brand-500/45` (the canonical anti-pattern)", () => {
    const messages = lint(`const c = "focus:ring-2 focus:ring-brand-500/45";`);
    // Both `focus:ring-2` and `focus:ring-brand-500/45` are colour-bearing
    // ring utilities — both fire.
    assert.equal(messages.length, 2);
  });

  it("flags `focus:text-text` and `focus:shadow-float`", () => {
    const messages = lint(
      `const c = "focus:text-text focus:shadow-float focus:bg-panel";`,
    );
    assert.equal(messages.length, 3);
  });

  it("flags `focus:border-danger`", () => {
    const messages = lint(`const c = "focus:border-danger/70";`);
    assert.equal(messages.length, 1);
    assert.match(messages[0].message, /focus:border-danger/);
  });

  it("flags `focus:outline-2` (non-`none` outline value)", () => {
    const messages = lint(`const c = "focus:outline-2 rounded";`);
    assert.equal(messages.length, 1);
    assert.match(messages[0].message, /focus:outline-2/);
  });

  it("flags `focus:outline-brand-500`", () => {
    const messages = lint(`const c = "focus:outline-brand-500/30";`);
    assert.equal(messages.length, 1);
  });

  it("flags `focus:outline-offset-2` once, not twice", () => {
    // `outline-offset` is in `FOCUS_COLOR_UTILITIES`, so the colour-utility
    // regex matches `focus:outline-offset-2` as `util="outline-offset"`,
    // `rest="2"`. The separate `focus:outline-…` arm also matches the same
    // token (`tail="offset-2"`, not in `FOCUS_OUTLINE_ALLOWED_TAILS`).
    // The rule must dedup so only one report is emitted per token.
    const messages = lint(`const c = "focus:outline-offset-2";`);
    assert.equal(messages.length, 1);
    assert.match(messages[0].message, /focus:outline-offset-2/);
  });

  it("flags `focus:outline-offset-4` once, not twice", () => {
    const messages = lint(`const c = "rounded focus:outline-offset-4 mt-1";`);
    assert.equal(messages.length, 1);
  });

  it("flags inside a template literal", () => {
    const messages = lint(
      "const c = `flex items-center focus:bg-panelHi rounded-xl ${extra}`;",
    );
    assert.equal(messages.length, 1);
  });

  it("emits one message per offending utility (multiple in one className)", () => {
    const messages = lint(
      `const c = "focus:bg-panel focus:text-text focus:shadow-float focus:border focus:border-line";`,
    );
    // 4 colour-bearing focus utilities → 4 reports.
    // `focus:border` (no shade) is a width-only utility — the rule
    // is scoped to colour/visual utilities, so a width change on
    // pointer focus doesn't blink colour and is not a regression.
    assert.equal(messages.length, 4);
  });

  // ── negative cases ────────────────────────────────────────────────

  it("does NOT flag `focus:outline-none` (canonical reset)", () => {
    const messages = lint(`const c = "focus:outline-none rounded-2xl";`);
    assert.equal(messages.length, 0);
  });

  it("does NOT flag `focus:outline-hidden` / `focus:outline-transparent`", () => {
    assert.equal(lint(`const c = "focus:outline-hidden";`).length, 0);
    assert.equal(lint(`const c = "focus:outline-transparent";`).length, 0);
  });

  it("does NOT flag `focus-visible:ring-brand-500/45` (the correct primitive)", () => {
    const messages = lint(
      `const c = "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45";`,
    );
    assert.equal(messages.length, 0);
  });

  it("does NOT flag variant-prefixed `focus:` (lg:focus:, hover:focus:, dark:focus:)", () => {
    // Tokens that combine `focus:` with an extra breakpoint or state
    // are out of scope — they carry an additional condition the
    // rule's bare-token contract does not model. The light-side
    // companion would also need to be adjusted, which expands beyond
    // a colour-utility check.
    assert.equal(lint(`const c = "lg:focus:bg-panel rounded";`).length, 0);
    assert.equal(lint(`const c = "hover:focus:text-brand-strong";`).length, 0);
    assert.equal(lint(`const c = "dark:focus:border-brand-400";`).length, 0);
  });

  it("does NOT flag `group-focus:` / `peer-focus:` / `focus-within:` / `focus-visible:` themselves", () => {
    assert.equal(
      lint(`const c = "group-focus:bg-panel peer-focus:text-text";`).length,
      0,
    );
    assert.equal(
      lint(`const c = "focus-within:bg-panel focus-visible:ring-2";`).length,
      0,
    );
  });

  it("does NOT flag non-Tailwind strings that contain `focus:`", () => {
    // CSS strings, ARIA messages, etc. that happen to have the
    // substring `focus:` in prose (not a className utility).
    const messages = lint(
      `const c = "Use focus: to target the focused state in CSS.";`,
    );
    assert.equal(messages.length, 0);
  });

  it("does NOT flag plain `focus:` followed by non-colour tokens (focus:font-semibold, focus:underline)", () => {
    // These are also wrong (would blink on click) but the rule
    // intentionally limits itself to colour/border/ring/shadow
    // utilities — text-decoration / font-weight changes on focus
    // are noisy and unlikely to be a regression in practice. The
    // narrower scope keeps false-positive risk low; if a future
    // wave wants to catch them, expand `FOCUS_COLOR_UTILITIES`.
    assert.equal(
      lint(`const c = "focus:font-semibold focus:underline";`).length,
      0,
    );
  });

  it("does NOT flag `focus:not-sr-only` or other a11y modifiers", () => {
    assert.equal(lint(`const c = "sr-only focus:not-sr-only";`).length, 0);
  });

  it("does NOT crash on empty string / number / non-string Literal", () => {
    assert.equal(lint(`const c = "";`).length, 0);
    assert.equal(lint(`const n = 42;`).length, 0);
    assert.equal(lint(`const b = true;`).length, 0);
  });

  it("flags pair across cn(…) argument soup", () => {
    const messages = lint(
      `const c = cn("rounded-xl", "focus:bg-panel", { "focus:border-line": active });`,
    );
    assert.equal(messages.length, 2);
  });

  it("does NOT flag `focus:text-sm` / `focus:text-base` / `focus:text-mini` (font-size, not colour)", () => {
    // `text-` is overloaded — sizes (`text-sm`, `text-mini`),
    // alignment (`text-center`), and transforms (`text-uppercase`)
    // are unrelated to colour blinks. Sergeant's SkipLink grows
    // its font size on focus and that is intentional UX.
    assert.equal(
      lint(`const c = "focus:text-sm focus:text-mini focus:text-base";`).length,
      0,
    );
  });

  it("does NOT flag `focus:text-center` / `focus:text-uppercase`", () => {
    assert.equal(
      lint(
        `const c = "focus:text-center focus:text-uppercase focus:text-balance";`,
      ).length,
      0,
    );
  });

  it("DOES flag `focus:text-text` (real colour utility)", () => {
    const messages = lint(`const c = "focus:text-text";`);
    assert.equal(messages.length, 1);
    assert.match(messages[0].message, /focus:text-text/);
  });

  it("DOES flag `focus:text-brand-strong` (real colour utility with semantic suffix)", () => {
    const messages = lint(`const c = "focus:text-brand-strong";`);
    assert.equal(messages.length, 1);
  });

  it("does NOT flag arbitrary values like `focus-visible:bg-[#fff]`", () => {
    // Arbitrary-value tail must still be on `focus-visible:`, not
    // `focus:`. Sanity-check: the rule's regex doesn't bleed into
    // `focus-visible:` accidentally.
    const messages = lint(
      `const c = "focus-visible:bg-[#fff] focus-visible:ring-[3px]";`,
    );
    assert.equal(messages.length, 0);
  });
});
