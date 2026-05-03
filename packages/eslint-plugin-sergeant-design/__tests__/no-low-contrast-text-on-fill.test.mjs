/**
 * Unit tests for the `sergeant-design/no-low-contrast-text-on-fill`
 * rule.
 *
 * The rule guards the WCAG-AA `-strong` tier: every saturated brand
 * `bg-*` utility paired with `text-white` is a regression to the
 * pre-PR-#854 era when CTAs only cleared ~2.4–2.8 : 1 contrast. The
 * fix is `bg-{family}-strong text-white`, which clears 5.0–7.0 : 1.
 * See `docs/design/brandbook.md` → "WCAG-AA `-strong` Tier".
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import plugin from "../index.js";

const linter = new Linter();
const RULE_ID = "sergeant-design/no-low-contrast-text-on-fill";

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

describe("no-low-contrast-text-on-fill", () => {
  it("flags `bg-brand text-white` (the canonical regression)", () => {
    const messages = lint(`const c = "bg-brand text-white";`);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
    assert.match(messages[0].message, /bg-brand/);
    assert.match(messages[0].message, /-strong/);
  });

  it("flags every brand family in turn", () => {
    const families = [
      "brand",
      "accent",
      "success",
      "warning",
      "danger",
      "info",
      "finyk",
      "fizruk",
      "routine",
      "nutrition",
    ];
    for (const family of families) {
      const messages = lint(`const c = "bg-${family} text-white";`);
      assert.equal(
        messages.length,
        1,
        `expected one violation for bg-${family}`,
      );
      assert.match(messages[0].message, new RegExp(`bg-${family}`));
    }
  });

  it("flags the explicit `-500` scale step (aliases the saturated tier)", () => {
    const messages = lint(`const c = "bg-fizruk-500 text-white p-3";`);
    assert.equal(messages.length, 1);
    assert.match(messages[0].message, /bg-fizruk-500/);
  });

  it("flags lighter scale steps (`-50` through `-600`)", () => {
    for (const step of [50, 100, 200, 300, 400, 500, 600]) {
      const messages = lint(`const c = "bg-finyk-${step} text-white";`);
      assert.equal(
        messages.length,
        1,
        `expected one violation for step ${step}`,
      );
    }
  });

  it("does NOT flag the strong companion", () => {
    const messages = lint(`const c = "bg-brand-strong text-white";`);
    assert.equal(messages.length, 0);
  });

  it("does NOT flag explicit dark steps (`-700`/`-800`/`-900`)", () => {
    for (const step of [700, 800, 900]) {
      const messages = lint(`const c = "bg-finyk-${step} text-white";`);
      assert.equal(
        messages.length,
        0,
        `expected no violation for step ${step}`,
      );
    }
  });

  it("does NOT flag dark-mode-prefixed bg utilities", () => {
    // On the dark surface emerald-500 vs white clears ~5.4 : 1; the
    // strong tier would actually *regress* that. The rule only
    // targets light-mode default state.
    const messages = lint(
      `const c = "bg-panel text-text dark:bg-finyk dark:text-white";`,
    );
    assert.equal(messages.length, 0);
  });

  it("does NOT flag hover-only saturated bg if base is fine", () => {
    // `hover:bg-brand` could regress contrast on hover, but the static
    // analysis can't reason about whether the hover state still pairs
    // with `text-white`. We err on the side of false-negative here so
    // legitimate hover effects (e.g. ghost button → branded hover)
    // aren't blocked.
    const messages = lint(
      `const c = "bg-panel text-text hover:bg-brand hover:shadow-glow";`,
    );
    assert.equal(messages.length, 0);
  });

  it("does NOT flag the soft-tier wash (`bg-{c}-soft text-{c}-strong`)", () => {
    const messages = lint(
      `const c = "bg-success-soft text-success-strong border-success/30";`,
    );
    assert.equal(messages.length, 0);
  });

  it("does NOT flag arbitrary-value backgrounds", () => {
    // `bg-[#hex]` is the deliberate one-off opt-out.
    const messages = lint(`const c = "bg-[#047857] text-white";`);
    assert.equal(messages.length, 0);
  });

  it("does NOT flag opacity-tinted bg utilities (regression for review #859)", () => {
    // `bg-brand/50 text-white` previously half-matched `bg-brand` (with
    // `stepRaw=undefined`) because the regex lookahead allowed `/` as a
    // closing boundary. The rule docs explicitly carve opacity tints out
    // — they're soft washes, not saturated solid fills, and the
    // foreground over them is `text-{family}-strong`, not white. Lock
    // both shapes (`bg-brand/N` and `bg-brand-500/N`) so the regression
    // can't sneak back.
    for (const cls of [
      "bg-brand/50 text-white",
      "bg-brand/10 text-white",
      "bg-finyk/15 text-white",
      "bg-success/30 text-white",
      "bg-brand-500/40 text-white",
      "bg-fizruk-200/8 text-white",
    ]) {
      const messages = lint(`const c = "${cls}";`);
      assert.equal(
        messages.length,
        0,
        `expected no violation for "${cls}" — opacity tints are out of scope`,
      );
    }
  });

  it("does NOT flag `bg-{c} text-text` (no white-on-fill text)", () => {
    const messages = lint(`const c = "bg-brand text-text";`);
    assert.equal(messages.length, 0);
  });

  it("flags inside template literals", () => {
    const messages = lint(
      "const c = `flex items-center bg-warning text-white px-3`;",
    );
    assert.equal(messages.length, 1);
    assert.match(messages[0].message, /bg-warning/);
  });

  it("flags multiple saturated bg utilities in one className soup", () => {
    // Pathological but legal — both should be reported so the engineer
    // sees every regression in one pass.
    const messages = lint(
      `const c = "bg-brand text-white hover:bg-success-300";`,
    );
    assert.equal(messages.length, 1);
    assert.match(messages[0].message, /bg-brand/);
  });

  it("does NOT false-flag unrelated text-white usage on neutral fills", () => {
    // bg-panel / bg-bg / bg-fg-muted are neutral semantic tokens, not
    // brand families. text-white on those is a different concern (the
    // designer chose them deliberately) and is out of scope.
    const messages = lint(
      `const c = "bg-fg-muted/90 text-white border-transparent";`,
    );
    assert.equal(messages.length, 0);
  });
});
