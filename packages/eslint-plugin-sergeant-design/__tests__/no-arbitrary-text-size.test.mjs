/**
 * Unit tests for `sergeant-design/no-arbitrary-text-size`.
 *
 * The rule bans Tailwind arbitrary `text-[Npx]` / `text-[Nrem]` /
 * `text-[Nem]` text-size literals. Authors must route through a named
 * utility defined in `apps/web/src/index.css` (`text-display`,
 * `text-h1..h3`, `text-body`, `text-body-sm`, `text-caption`,
 * `text-eyebrow`, `text-meta`, `text-micro`, `text-display-stat`,
 * `text-display-hero`, `text-style-*`) or a Tailwind preset
 * (`text-xs..text-5xl`).
 *
 * Exempt: design-system primitive source files (Button, Input, Badge,
 * Stat, Toast, Skeleton, etc.) and test files.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import path from "node:path";
import plugin from "../index.js";

const linter = new Linter();
const RULE_ID = "sergeant-design/no-arbitrary-text-size";

function abs(p) {
  return path.resolve(process.cwd(), p);
}

function lint(code, filename = abs("apps/web/src/modules/finyk/Foo.tsx")) {
  return linter.verify(
    code,
    {
      files: ["**/*.{js,mjs,cjs,jsx,ts,tsx}"],
      plugins: { "sergeant-design": plugin },
      rules: { [RULE_ID]: "error" },
      languageOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
    },
    { filename },
  );
}

describe("no-arbitrary-text-size", () => {
  it("flags text-[10px]", () => {
    const msgs = lint(`const c = "text-[10px] text-subtle";`);
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].ruleId, RULE_ID);
    assert.match(msgs[0].message, /text-\[10px\]/);
    assert.match(msgs[0].message, /Sergeant typography scale/);
  });

  it("flags text-[8px] (below WCAG-comfort floor)", () => {
    const msgs = lint(`const c = "text-[8px] text-subtle";`);
    assert.equal(msgs.length, 1);
    assert.match(msgs[0].message, /text-\[8px\]/);
  });

  it("flags text-[40px]", () => {
    const msgs = lint(
      `const c = "text-[40px] font-bold tracking-tight tabular-nums";`,
    );
    assert.equal(msgs.length, 1);
    assert.match(msgs[0].message, /text-\[40px\]/);
  });

  it("flags text-[2.5rem]", () => {
    const msgs = lint(`const c = "text-[2.5rem] leading-tight font-bold";`);
    assert.equal(msgs.length, 1);
    assert.match(msgs[0].message, /text-\[2\.5rem\]/);
  });

  it("flags text-[1em]", () => {
    const msgs = lint(`const c = "text-[1em] leading-tight";`);
    assert.equal(msgs.length, 1);
    assert.match(msgs[0].message, /text-\[1em\]/);
  });

  it("does NOT flag canonical `text-style-label`", () => {
    const msgs = lint(`const c = "text-style-label text-subtle";`);
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag preset Tailwind sizes (text-xs/sm/base/lg/…)", () => {
    const msgs = lint(
      `const c1 = "text-xs"; const c2 = "text-sm"; ` +
        `const c3 = "text-base"; const c4 = "text-2xl";`,
    );
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag named typography utilities", () => {
    const msgs = lint(
      `const c = "text-display text-h1 text-h2 text-h3 ` +
        `text-body text-body-sm text-caption text-eyebrow ` +
        `text-meta text-micro text-display-stat text-display-hero";`,
    );
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag arbitrary tracking / leading (only text-size axis)", () => {
    const msgs = lint(`const c = "tracking-[0.3em] leading-[1.05] uppercase";`);
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag arbitrary min-height / width", () => {
    const msgs = lint(`const c = "min-h-[44px] w-[80%] h-[12rem]";`);
    assert.equal(msgs.length, 0);
  });

  it("flags responsive text-[16px] md:text-sm pattern (the iOS-zoom-fix)", () => {
    // Even the legitimate iOS-zoom-fix pattern must route through a
    // named CSS utility (e.g. `routine-touch-field` / `text-base md:text-sm`).
    const msgs = lint(`const c = "text-[16px] md:text-sm";`);
    assert.equal(msgs.length, 1);
    assert.match(msgs[0].message, /text-\[16px\]/);
  });

  it("reports duplicate sizes only once per literal", () => {
    const msgs = lint(`const c = "text-[10px] gap-2 text-[10px] mt-1";`);
    assert.equal(msgs.length, 1);
  });

  it("reports each distinct size separately", () => {
    const msgs = lint(`const c = "text-[10px] gap-2 text-[40px]";`);
    assert.equal(msgs.length, 2);
    const messages = msgs.map((m) => m.message).join(" | ");
    assert.match(messages, /text-\[10px\]/);
    assert.match(messages, /text-\[40px\]/);
  });

  it("flags hits inside template literals", () => {
    const msgs = lint("const c = `text-[12px] ${extra} text-muted`;");
    assert.equal(msgs.length, 1);
  });

  it("does NOT flag Button.tsx (exempt design-system primitive)", () => {
    const msgs = lint(
      `const c = "text-[10px]";`,
      abs("apps/web/src/shared/components/ui/Button.tsx"),
    );
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag Input.tsx (exempt — owns the iOS-zoom-fix pattern)", () => {
    const msgs = lint(
      `const c = "text-[16px] md:text-sm";`,
      abs("apps/web/src/shared/components/ui/Input.tsx"),
    );
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag SectionHeading.tsx (exempt)", () => {
    const msgs = lint(
      `const c = "text-[11px]";`,
      abs("apps/web/src/shared/components/ui/SectionHeading.tsx"),
    );
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag Toast.tsx / Skeleton.tsx (exempt animation primitives)", () => {
    const msgsToast = lint(
      `const c = "text-[13px]";`,
      abs("apps/web/src/shared/components/ui/Toast.tsx"),
    );
    const msgsSkel = lint(
      `const c = "text-[12px]";`,
      abs("apps/web/src/shared/components/ui/Skeleton.tsx"),
    );
    assert.equal(msgsToast.length, 0);
    assert.equal(msgsSkel.length, 0);
  });

  it("does NOT flag test files (exempt)", () => {
    const msgsTest = lint(
      `const c = "text-[12px]";`,
      abs("apps/web/src/modules/finyk/Foo.test.tsx"),
    );
    const msgsSpec = lint(
      `const c = "text-[12px]";`,
      abs("apps/web/src/modules/finyk/Foo.spec.tsx"),
    );
    assert.equal(msgsTest.length, 0);
    assert.equal(msgsSpec.length, 0);
  });

  it("does NOT flag plugin __tests__ files (exempt)", () => {
    const msgs = lint(
      `const c = "text-[12px]";`,
      abs("packages/eslint-plugin-sergeant-design/__tests__/some-fixture.mjs"),
    );
    assert.equal(msgs.length, 0);
  });

  // ─────────────────────────────────────────────────────────────────
  // D-4 expansion (P2-2 in 2026-05-13-testing-devx-roast.md): tighten
  // coverage on the shapes contributors realistically write a
  // text-size literal into, plus a scope-doc case that pins down the
  // rule's `text-[…]` regex contract.
  // ─────────────────────────────────────────────────────────────────

  it('flags `text-[18px]` inside a JSX `className="…"` attribute', () => {
    // The existing test only covers the `const c = "…"` shape. Most
    // contributors land arbitrary sizes directly on JSX, so pin a
    // JSXAttribute-shaped fixture explicitly.
    const msgs = lint(
      `export function Pill() { return <span className="px-2 text-[18px] text-subtle" />; }`,
    );
    assert.equal(msgs.length, 1);
    assert.match(msgs[0].message, /text-\[18px\]/);
  });

  it("flags `text-[12px]` inside a `clsx(…)` argument (custom-utility wrapper)", () => {
    // `clsx` / `cn` / `twMerge` wrappers are the most common way an
    // arbitrary size slips past code review (the literal lives a few
    // arguments deep). The rule walks every Literal regardless of
    // call-site shape — confirm that here.
    const msgs = lint(
      `const c = clsx("base", isCompact && "text-[12px]", "mt-1");`,
    );
    assert.equal(msgs.length, 1);
    assert.match(msgs[0].message, /text-\[12px\]/);
  });

  it("flags `text-[14px]` inside a `cva(…)` variant value", () => {
    // Design-system primitives that use cva to encode size variants
    // are the second-most-common shape for size literals. Confirm
    // the rule reaches into ObjectExpression → Property → Literal.
    const msgs = lint(
      [
        `const button = cva("inline-flex", {`,
        `  variants: { size: { sm: "text-[14px] py-1", md: "text-sm py-2" } },`,
        `});`,
      ].join("\n"),
    );
    assert.equal(msgs.length, 1);
    assert.match(msgs[0].message, /text-\[14px\]/);
  });

  it("flags `text-[1.125rem]` (Tailwind preset edge — decimal rem)", () => {
    // `text-[1.125rem]` is the typical “we want something *between*
    // `text-base` and `text-lg`” hack — the regex specifically
    // accepts decimal `\d+\.\d+` so the rule still catches it.
    const msgs = lint(`const c = "text-[1.125rem] leading-snug";`);
    assert.equal(msgs.length, 1);
    assert.match(msgs[0].message, /text-\[1\.125rem\]/);
  });

  it("flags mixed-units in one literal (`text-[10px] sm:text-[1rem]`)", () => {
    // The two values are different sizes, so the rule must report
    // each distinct size separately even when one uses px and the
    // other rem. Guards against a future de-dup regression that
    // accidentally collapses across unit suffixes.
    const msgs = lint(`const c = "text-[10px] sm:text-[1rem]";`);
    assert.equal(msgs.length, 2);
    const joined = msgs.map((m) => m.message).join(" | ");
    assert.match(joined, /text-\[10px\]/);
    assert.match(joined, /text-\[1rem\]/);
  });

  it("does NOT flag inline `style={{ fontSize: 10 }}` (out of regex scope)", () => {
    // Scope-doc fixture: the rule's regex is `text-\[Npx|rem|em\]`,
    // so JSX inline-style `fontSize` numbers are intentionally out
    // of scope (a separate `react/no-inline-styles` or design-token
    // rule would own that). Lock the contract here so a future
    // overreach refactor (“let's also check fontSize”) breaks this
    // test and forces an explicit design discussion.
    const msgs = lint(
      `export function Caption() { return <span style={{ fontSize: 10 }}>x</span>; }`,
    );
    assert.equal(msgs.length, 0);
  });

  // ─────────────────────────────────────────────────────────────────
  // Shape-variant BAD fixtures (regex-contract hardening). Each case
  // below is a BAD fixture in a non-exempt module file — the rule must
  // emit exactly the asserted count. These pin the unit/precision and
  // call-site shapes the thinner cases above don't cover: the `em`
  // unit, three-digit px, decimal rem, JSX attributes with two distinct
  // sizes, and multi-quasi template literals.
  // ─────────────────────────────────────────────────────────────────

  it("flags `text-[2em]` (em unit)", () => {
    // The earlier `text-[1em]` case uses an integer; confirm the `em`
    // branch of the `(?:px|rem|em)` alternation also fires here so a
    // future unit-list edit can't silently drop `em`.
    const msgs = lint(`const c = "text-[2em] leading-none";`);
    assert.equal(msgs.length, 1);
    assert.match(msgs[0].message, /text-\[2em\]/);
  });

  it("flags `text-[100px]` (three-digit px)", () => {
    // `\d+` is unbounded, so an oversized hero literal must still be
    // caught — guards against a future `\d{1,2}` tightening regression.
    const msgs = lint(`const c = "text-[100px] font-black tracking-tight";`);
    assert.equal(msgs.length, 1);
    assert.match(msgs[0].message, /text-\[100px\]/);
  });

  it("flags `text-[0.875rem]` (leading-zero decimal rem)", () => {
    // The `(?:\.\d+)?` group must accept a sub-1 decimal so the common
    // “14px-as-rem” hack (`0.875rem`) is still flagged.
    const msgs = lint(`const c = "text-[0.875rem] tabular-nums";`);
    assert.equal(msgs.length, 1);
    assert.match(msgs[0].message, /text-\[0\.875rem\]/);
  });

  it("flags two distinct sizes inside one JSX `className` attribute", () => {
    // A responsive pair landed directly on JSX. Both sizes differ, so
    // the per-literal de-dup must still report each one (2 total).
    const msgs = lint(
      `export function Hd() { return <h1 className="text-[28px] sm:text-[32px]" />; }`,
    );
    assert.equal(msgs.length, 2);
    const joined = msgs.map((m) => m.message).join(" | ");
    assert.match(joined, /text-\[28px\]/);
    assert.match(joined, /text-\[32px\]/);
  });

  it("flags sizes split across multiple template-literal quasis", () => {
    // Two static chunks separated by an interpolation are two distinct
    // TemplateElement nodes; the rule reports each quasi's hit, so a
    // size in each chunk yields 2 messages.
    const msgs = lint("const c = `text-[11px] ${gap} text-[13px] ${rest}`;");
    assert.equal(msgs.length, 2);
    const joined = msgs.map((m) => m.message).join(" | ");
    assert.match(joined, /text-\[11px\]/);
    assert.match(joined, /text-\[13px\]/);
  });

  it("flags only the in-unit size when mixed with out-of-scope units", () => {
    // `text-[2vh]` and `text-[50%]` use units outside the rule's
    // `px|rem|em` contract and must be ignored; only the `text-[12px]`
    // in the same literal is reported. Pins the unit allow-list.
    const msgs = lint(`const c = "text-[2vh] text-[12px] text-[50%]";`);
    assert.equal(msgs.length, 1);
    assert.match(msgs[0].message, /text-\[12px\]/);
  });

  it("flags `text-[14px]` inside a `cn(…)` custom-utility wrapper", () => {
    // `cn` is the in-repo Tailwind merge helper (alongside `clsx`).
    // Confirm an arbitrary size buried a few args deep in `cn` is still
    // walked as a plain Literal.
    const msgs = lint(
      `const c = cn("px-3", compact && "text-[14px]", "mt-1");`,
    );
    assert.equal(msgs.length, 1);
    assert.match(msgs[0].message, /text-\[14px\]/);
  });
});
