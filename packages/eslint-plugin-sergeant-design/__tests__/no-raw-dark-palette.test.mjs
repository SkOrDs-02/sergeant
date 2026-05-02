/**
 * Unit tests for the `sergeant-design/no-raw-dark-palette` rule.
 *
 * The rule fires on a className that pairs a raw Tailwind palette
 * utility on the light side with a `dark:` raw-palette override —
 * the anti-pattern catalogued in `docs/design/DARK-MODE-AUDIT.md`.
 * Both halves must be present; a dark-side-only "patch" on a
 * semantic light token (e.g. `text-success-strong dark:text-emerald-100`)
 * is intentionally NOT flagged because the light side already lives
 * in the token layer and the dark `-strong` companion is a known
 * gap in the design-system scale.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import plugin from "../index.js";

const linter = new Linter();
const RULE_ID = "sergeant-design/no-raw-dark-palette";

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

describe("no-raw-dark-palette", () => {
  it("flags `bg-amber-50 dark:bg-amber-500/15` pair", () => {
    const messages = lint(
      `const c = "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300";`,
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
    assert.match(messages[0].message, /bg-amber-50/);
    assert.match(messages[0].message, /dark:bg-amber-500\/15/);
  });

  it("flags `bg-coral-100 dark:bg-coral-900/30` pair", () => {
    const messages = lint(
      `const c = "rounded-2xl bg-coral-100 dark:bg-coral-900/30 p-4";`,
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });

  it("flags `border-teal-200/50 dark:border-teal-800/30` pair", () => {
    const messages = lint(
      `const c = "border border-teal-200/50 dark:border-teal-800/30 p-3";`,
    );
    assert.equal(messages.length, 1);
  });

  it("flags pair when light is text and dark is text (different shades)", () => {
    const messages = lint(`const c = "text-coral-100 dark:text-coral-900/30";`);
    assert.equal(messages.length, 1);
  });

  it("flags `brand` raw-palette pair (Sergeant alias is still raw)", () => {
    const messages = lint(
      `const c = "border-brand-200/50 dark:border-brand-800/30";`,
    );
    assert.equal(messages.length, 1);
  });

  it("flags pair across mixed palettes (light=teal, dark=teal different step)", () => {
    const messages = lint(`const c = "text-teal-600 dark:text-teal-400";`);
    assert.equal(messages.length, 1);
  });

  it("emits one message per className value (not one per pair)", () => {
    // Two raw lights paired with two dark overrides — single report so
    // the reviewer doesn't get drowned in dupes for one className.
    const messages = lint(
      `const c = "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300";`,
    );
    assert.equal(messages.length, 1);
  });

  // ── Patterns that intentionally STAY ───────────────────────────────────

  it("does NOT flag dark-side-only patch when light is semantic", () => {
    // `Banner.tsx` line 22 pattern — the light side is the
    // theme-aware `text-success-strong`; the dark side patches a
    // lighter shade because the `-strong` companion is a documented
    // gap in the WCAG-AA scale on dark panels.
    const messages = lint(
      `const c = "border-success/30 bg-success-soft text-success-strong dark:text-emerald-100";`,
    );
    assert.equal(messages.length, 0);
  });

  it("does NOT flag `dark:bg-white/10` glass washes", () => {
    const messages = lint(
      `const c = "rounded-xl bg-fizruk-tile/10 dark:bg-white/10 border border-white/15";`,
    );
    assert.equal(messages.length, 0);
  });

  it("does NOT flag `dark:bg-black/40` glass washes", () => {
    const messages = lint(`const c = "bg-surface dark:bg-black/40";`);
    assert.equal(messages.length, 0);
  });

  it("does NOT flag semantic `dark:bg-surface` / `dark:text-fg`", () => {
    const messages = lint(
      `const c = "bg-card dark:bg-surface text-fg dark:text-fg border-border dark:border-border";`,
    );
    assert.equal(messages.length, 0);
  });

  it("does NOT flag `bg-brand-soft` / `bg-{module}-surface` semantic pair", () => {
    // Wave 1b target shape: zero `dark:` overrides because the CSS
    // variable behind `bg-finyk-soft` flips per-theme automatically.
    const messages = lint(
      `const c = "bg-finyk-soft text-brand-strong border-brand-soft-border/60 hover:bg-finyk-soft-hover";`,
    );
    assert.equal(messages.length, 0);
  });

  it("does NOT flag `brand-soft` / `brand-strong` (semantic suffix, not numeric step)", () => {
    const messages = lint(
      `const c = "bg-brand-soft text-brand-strong dark:text-brand-300";`,
    );
    // Light is `bg-brand-soft` / `text-brand-strong` (semantic, no
    // numeric step). `dark:text-brand-300` is a dark-side patch on
    // a semantic light → stays.
    assert.equal(messages.length, 0);
  });

  it("does NOT flag light-only raw-palette without a dark override", () => {
    // A raw light palette without a `dark:` mate is out of scope —
    // the audit is about the *pair*. Single-side raw palette is
    // a separate (broader) cleanup tracked elsewhere.
    const messages = lint(`const c = "rounded-xl bg-amber-50 text-amber-700";`);
    assert.equal(messages.length, 0);
  });

  it("does NOT flag dark-only raw-palette without a light raw mate", () => {
    const messages = lint(
      `const c = "bg-success-soft dark:text-amber-300 dark:bg-amber-500/15";`,
    );
    // Light is fully semantic (`bg-success-soft`) so the dark-side
    // pair is a "patch", not a hand-rolled both-themes pair.
    assert.equal(messages.length, 0);
  });

  it("does NOT flag non-color utilities with palette-like names", () => {
    // `w-amber-50` isn't a thing, but the prefilter must not trip on
    // unrelated utilities that happen to share substrings.
    const messages = lint(
      `const c = "w-12 h-12 p-4 ring-offset-2 dark:opacity-90";`,
    );
    assert.equal(messages.length, 0);
  });

  it("flags pair inside template literal", () => {
    const messages = lint(
      "const c = `bg-amber-50 dark:bg-amber-500/15 ${variant}`;",
    );
    assert.equal(messages.length, 1);
  });

  it("does NOT flag plain hex literals (no className utility prefix)", () => {
    const messages = lint(`const c = "#10b981 dark:#1f2937";`);
    assert.equal(messages.length, 0);
  });

  it("flags `dark:` pair regardless of token order", () => {
    // Dark first, light second — the rule is order-insensitive.
    const messages = lint(
      `const c = "dark:bg-emerald-900/30 bg-emerald-100 rounded";`,
    );
    assert.equal(messages.length, 1);
  });

  it("flags `dark:` pair with hover state in between", () => {
    const messages = lint(
      `const c = "bg-coral-50 hover:bg-coral-100 dark:bg-coral-900/30";`,
    );
    assert.equal(messages.length, 1);
  });

  it("does NOT match `dark:` when prefixed by another variant (lg:dark:…)", () => {
    // Regression test for cubic finding on PR #1155 — `lg:dark:bg-amber-500/15`
    // tokens carry an extra breakpoint condition that the rule's
    // pair-only contract does not model. Treating them as bare `dark:`
    // matches produced false-positive pair reports against unrelated
    // bare light utilities (`bg-amber-50`) elsewhere in the same
    // className. The dark-side regex now uses the same `(?<![\w:-])`
    // lookbehind as the light-side regex.
    const messages = lint(`const c = "bg-amber-50 lg:dark:bg-amber-500/15";`);
    assert.equal(
      messages.length,
      0,
      "lg:dark: prefixed dark utility must not pair with bare bg-amber-50",
    );
  });

  it("does NOT match `dark:` when prefixed by a hover state (hover:dark:…)", () => {
    // Same family of false-positives: `hover:dark:text-coral-300` is
    // a stateful + dark-mode override, not a bare dark pair.
    const messages = lint(
      `const c = "text-coral-700 hover:dark:text-coral-300 underline";`,
    );
    assert.equal(messages.length, 0);
  });

  it("does NOT match `dark:` when prefixed by a focus state (focus-visible:dark:…)", () => {
    const messages = lint(
      `const c = "border-teal-200 focus-visible:dark:border-teal-700";`,
    );
    assert.equal(messages.length, 0);
  });

  it("still flags a bare `dark:` pair even when the same className has a `lg:dark:` variant on a different family", () => {
    // The bare `text-brand-600 dark:text-brand-400` pair must still
    // fire even when an unrelated `lg:dark:bg-amber-500/15` token
    // appears in the same className — the variant-prefix dark token
    // is invisible to the rule, but the bare pair is unambiguous.
    const messages = lint(
      `const c = "text-brand-600 dark:text-brand-400 lg:dark:bg-amber-500/15";`,
    );
    assert.equal(messages.length, 1);
    assert.match(messages[0].message, /text-brand-600/);
    assert.match(messages[0].message, /dark:text-brand-400/);
  });
});
