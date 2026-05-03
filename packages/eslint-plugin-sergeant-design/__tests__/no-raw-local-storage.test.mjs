/**
 * Unit tests for the `sergeant-design/no-raw-local-storage` rule.
 *
 * The rule blocks direct `localStorage.*` / `window.localStorage.*`
 * member access in `apps/web` so contributors are pushed toward the
 * try/catch-wrapped helpers (`safeReadLS`, `useLocalStorageState`,
 * `createModuleStorage`). Files that legitimately implement those
 * wrappers — or that haven't been migrated yet — are listed in
 * `eslint.config.js`'s override block, NOT via inline disables.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import plugin from "../index.js";

const linter = new Linter();
const RULE_ID = "sergeant-design/no-raw-local-storage";

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

describe("no-raw-local-storage", () => {
  it("flags `localStorage.getItem(…)`", () => {
    const messages = lint(`localStorage.getItem("foo");`);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });

  it("flags `localStorage.setItem(…)`", () => {
    const messages = lint(`localStorage.setItem("foo", "bar");`);
    assert.equal(messages.length, 1);
  });

  it("flags `localStorage.removeItem(…)`", () => {
    const messages = lint(`localStorage.removeItem("foo");`);
    assert.equal(messages.length, 1);
  });

  it("flags `localStorage.clear()`", () => {
    const messages = lint(`localStorage.clear();`);
    assert.equal(messages.length, 1);
  });

  it("flags `window.localStorage.getItem(…)`", () => {
    const messages = lint(`window.localStorage.getItem("foo");`);
    assert.equal(messages.length, 1);
  });

  it("flags `globalThis.localStorage.setItem(…)`", () => {
    const messages = lint(`globalThis.localStorage.setItem("a", "b");`);
    assert.equal(messages.length, 1);
  });

  it("flags computed-property access `localStorage[key]`", () => {
    const messages = lint(`const v = localStorage["foo"];`);
    assert.equal(messages.length, 1);
  });

  it("does NOT flag passing `localStorage` as a value (no member access)", () => {
    // Edge case: passing the global itself as an argument is fine —
    // wrappers receive it and apply their own try/catch.
    const messages = lint(`useStore(localStorage);`);
    assert.equal(messages.length, 0);
  });

  it("does NOT flag a property named `localStorage` on an unrelated object", () => {
    const messages = lint(
      `const x = { localStorage: 1 }; const v = x.localStorage;`,
    );
    assert.equal(messages.length, 0);
  });

  it("does NOT flag `safeReadLS` / `useLocalStorageState` calls", () => {
    const messages = lint(
      `import { safeReadLS } from "@shared/lib/storage/storage";
       const v = safeReadLS("foo", null);`,
    );
    assert.equal(messages.length, 0);
  });
});
