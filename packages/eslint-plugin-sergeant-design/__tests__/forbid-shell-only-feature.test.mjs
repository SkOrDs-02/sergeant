/**
 * Unit tests for the `sergeant-design/forbid-shell-only-feature` rule.
 *
 * Context — initiative 0002 (mobile platform decision) puts
 * `apps/mobile-shell/` on a sunset schedule (ADR-0010 + the Sunset
 * schedule section). To keep the deprecation real, we forbid net-new
 * source files from landing in `apps/mobile-shell/src/**`. The rule
 * compares the linted file's repo-relative path against an allowlist
 * snapshot (the existing shell-glue files); anything outside that
 * snapshot fires a `problem`-severity diagnostic that points at the
 * initiative + ADR.
 *
 * The rule is path-only — it does NOT need to parse the file's AST
 * (it fires once per file, on `Program`). These tests therefore work
 * with intentionally tiny source snippets and rely on `filename` to
 * drive the rule's behaviour.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import path from "node:path";
import plugin from "../index.js";

const linter = new Linter();
const RULE_ID = "sergeant-design/forbid-shell-only-feature";

function abs(p) {
  return path.resolve(process.cwd(), p);
}

function lint(code, filename, options) {
  return linter.verify(
    code,
    {
      files: ["**/*.{js,mjs,cjs,jsx,ts,tsx}"],
      plugins: { "sergeant-design": plugin },
      rules: {
        [RULE_ID]: options ? ["error", options] : "error",
      },
      languageOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    { filename },
  );
}

// ── BAD: net-new files in apps/mobile-shell/src/** are blocked ──────────

describe("forbid-shell-only-feature – flags net-new shell files", () => {
  it("flags a net-new feature module in apps/mobile-shell/src", () => {
    const messages = lint(
      `export const fancy = 1;`,
      abs("apps/mobile-shell/src/fancyFeature.ts"),
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
    assert.match(messages[0].message, /sunset schedule/);
    assert.match(messages[0].message, /ADR-0010/);
    assert.match(messages[0].message, /0002-mobile-platform-decision/);
  });

  it("flags a net-new TSX-named file in apps/mobile-shell/src", () => {
    // The rule is path-only — it does not depend on TS/JSX syntax,
    // so a plain JS body is enough to exercise it. We just want to
    // confirm a `.tsx` extension still triggers the rule.
    const messages = lint(
      `export function NewScreen() { return null; }`,
      abs("apps/mobile-shell/src/screens/NewScreen.tsx"),
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });

  it("flags a net-new file in a nested subdir of apps/mobile-shell/src", () => {
    const messages = lint(
      `export const x = 1;`,
      abs("apps/mobile-shell/src/feature/auth/newAuth.ts"),
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });

  it("fires exactly once per file (not once per statement)", () => {
    const messages = lint(
      `export const a = 1; export const b = 2; export const c = 3;`,
      abs("apps/mobile-shell/src/multi.ts"),
    );
    assert.equal(messages.length, 1);
  });
});

// ── GOOD: existing shell-glue files in the snapshot are allowed ─────────

describe("forbid-shell-only-feature – allowlist (existing shell-glue)", () => {
  it("allows apps/mobile-shell/src/index.ts", () => {
    const messages = lint(
      `export const x = 1;`,
      abs("apps/mobile-shell/src/index.ts"),
    );
    assert.equal(messages.length, 0);
  });

  it("allows apps/mobile-shell/src/platform.ts", () => {
    const messages = lint(
      `export const platform = "android";`,
      abs("apps/mobile-shell/src/platform.ts"),
    );
    assert.equal(messages.length, 0);
  });

  it("allows apps/mobile-shell/src/auth-storage.ts", () => {
    const messages = lint(
      `export function getToken() { return null; }`,
      abs("apps/mobile-shell/src/auth-storage.ts"),
    );
    assert.equal(messages.length, 0);
  });

  it("allows apps/mobile-shell/src/barcodeNative.ts", () => {
    const messages = lint(
      `export function scan() {}`,
      abs("apps/mobile-shell/src/barcodeNative.ts"),
    );
    assert.equal(messages.length, 0);
  });

  it("allows apps/mobile-shell/src/pushNative.ts", () => {
    const messages = lint(
      `export function register() {}`,
      abs("apps/mobile-shell/src/pushNative.ts"),
    );
    assert.equal(messages.length, 0);
  });
});

// ── GOOD: tests inside apps/mobile-shell/src/** are exempt ──────────────

describe("forbid-shell-only-feature – test files are exempt", () => {
  it("allows __tests__ subdirectory", () => {
    const messages = lint(
      `import { describe } from "node:test";`,
      abs("apps/mobile-shell/src/__tests__/parseDeepLink.test.ts"),
    );
    assert.equal(messages.length, 0);
  });

  it("allows *.test.ts colocated alongside source", () => {
    const messages = lint(
      `import { describe } from "node:test";`,
      abs("apps/mobile-shell/src/auth-storage.test.ts"),
    );
    assert.equal(messages.length, 0);
  });

  it("allows *.spec.ts (alternative test convention)", () => {
    const messages = lint(
      `import { describe } from "node:test";`,
      abs("apps/mobile-shell/src/some-feature.spec.ts"),
    );
    assert.equal(messages.length, 0);
  });

  it("allows *.test.tsx", () => {
    const messages = lint(
      `import { render } from "@testing-library/react";`,
      abs("apps/mobile-shell/src/Component.test.tsx"),
    );
    assert.equal(messages.length, 0);
  });
});

// ── EXEMPT SCOPE: rule does not fire outside apps/mobile-shell/src ──────

describe("forbid-shell-only-feature – scoped to apps/mobile-shell/src", () => {
  it("does not fire on apps/mobile/src files", () => {
    const messages = lint(
      `export const x = 1;`,
      abs("apps/mobile/src/screens/Home.tsx"),
    );
    assert.equal(messages.length, 0);
  });

  it("does not fire on apps/web/src files", () => {
    const messages = lint(
      `export const x = 1;`,
      abs("apps/web/src/modules/finyk/pages/Overview.tsx"),
    );
    assert.equal(messages.length, 0);
  });

  it("does not fire on apps/server/src files", () => {
    const messages = lint(
      `export const x = 1;`,
      abs("apps/server/src/modules/finyk/handler.ts"),
    );
    assert.equal(messages.length, 0);
  });

  it("does not fire on apps/mobile-shell/ root config files", () => {
    // The rule is scoped to the `src` subdirectory; capacitor.config.ts
    // and similar build files at the package root are out of scope.
    const messages = lint(
      `export default {};`,
      abs("apps/mobile-shell/capacitor.config.ts"),
    );
    assert.equal(messages.length, 0);
  });
});

// ── OPTION: callers can extend the allowlist via rule options ───────────

describe("forbid-shell-only-feature – `allowlist` option extends the snapshot", () => {
  it("treats an opt-in path as allowed", () => {
    const messages = lint(
      `export const x = 1;`,
      abs("apps/mobile-shell/src/newGlue.ts"),
      { allowlist: ["apps/mobile-shell/src/newGlue.ts"] },
    );
    assert.equal(messages.length, 0);
  });

  it("does not affect the built-in snapshot when extended", () => {
    // platform.ts is in the built-in snapshot; extending with an
    // unrelated path should not change platform.ts behaviour.
    const messages = lint(
      `export const x = 1;`,
      abs("apps/mobile-shell/src/platform.ts"),
      { allowlist: ["apps/mobile-shell/src/somethingElse.ts"] },
    );
    assert.equal(messages.length, 0);
  });

  it("still flags non-allowlisted paths even with the option present", () => {
    const messages = lint(
      `export const x = 1;`,
      abs("apps/mobile-shell/src/stillForbidden.ts"),
      { allowlist: ["apps/mobile-shell/src/somethingElse.ts"] },
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });
});
