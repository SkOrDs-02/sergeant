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
});
