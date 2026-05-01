/**
 * Unit tests for the `sergeant-design/no-finyk-token-in-storage` rule.
 *
 * The rule guards Stage 0 PR #002 from `docs/planning/storage-roadmap.md`:
 * the Monobank PAT must live only in `mono_connection.token_ciphertext`
 * server-side. Persisting it on the client through any storage primitive
 * (localStorage, sessionStorage, MMKV via safeWriteLS, useLocalStorage,
 * useSyncedStorage, createModuleStorage, …) is a security regression and
 * is now banned at lint time.
 *
 * The rule fires on writes; reads (the migration hook
 * `useMonoTokenMigration`) and removals (`safeRemoveLS`,
 * `localStorage.removeItem`) are intentionally NOT flagged.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import plugin from "../index.js";

const linter = new Linter();
const RULE_ID = "sergeant-design/no-finyk-token-in-storage";

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

describe("no-finyk-token-in-storage", () => {
  it("flags `localStorage.setItem('finyk_token', …)`", () => {
    const messages = lint(`localStorage.setItem("finyk_token", "xxx");`);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });

  it("flags `sessionStorage.setItem('finyk_token', …)`", () => {
    const messages = lint(`sessionStorage.setItem("finyk_token", "xxx");`);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });

  it("flags `localStorage.setItem('finyk_token_remembered', …)`", () => {
    const messages = lint(
      `localStorage.setItem("finyk_token_remembered", "xxx");`,
    );
    assert.equal(messages.length, 1);
  });

  it("flags `safeWriteLS('finyk_token', …)`", () => {
    const messages = lint(`safeWriteLS("finyk_token", "xxx");`);
    assert.equal(messages.length, 1);
  });

  it("flags `safeWriteLS(STORAGE_KEYS.FINYK_TOKEN, …)`", () => {
    const messages = lint(`safeWriteLS(STORAGE_KEYS.FINYK_TOKEN, "xxx");`);
    assert.equal(messages.length, 1);
  });

  it("flags `safeWriteLS(STORAGE_KEYS['FINYK_TOKEN'], …)`", () => {
    const messages = lint(`safeWriteLS(STORAGE_KEYS["FINYK_TOKEN"], "xxx");`);
    assert.equal(messages.length, 1);
  });

  it("flags template-literal key `safeWriteLS(`finyk_token`, …)`", () => {
    const messages = lint("safeWriteLS(`finyk_token`, 'xxx');");
    assert.equal(messages.length, 1);
  });

  it("flags `useLocalStorage('finyk_token', …)`", () => {
    const messages = lint(`useLocalStorage("finyk_token", "");`);
    assert.equal(messages.length, 1);
  });

  it("flags `useSyncedStorage(STORAGE_KEYS.FINYK_TOKEN, …)`", () => {
    const messages = lint(
      `useSyncedStorage(STORAGE_KEYS.FINYK_TOKEN, "default");`,
    );
    assert.equal(messages.length, 1);
  });

  it("flags `createModuleStorage('finyk_token')`", () => {
    const messages = lint(`createModuleStorage("finyk_token");`);
    assert.equal(messages.length, 1);
  });

  it("flags `safeWriteJSONLS('finyk_token', …)`", () => {
    const messages = lint(`safeWriteJSONLS("finyk_token", { a: 1 });`);
    assert.equal(messages.length, 1);
  });

  // Reads / removals must NOT trigger the rule — they are needed for
  // the one-shot migration hook to clear the legacy LS entries.
  it("does not flag `localStorage.getItem('finyk_token')`", () => {
    const messages = lint(`localStorage.getItem("finyk_token");`);
    assert.equal(messages.length, 0);
  });

  it("does not flag `localStorage.removeItem('finyk_token')`", () => {
    const messages = lint(`localStorage.removeItem("finyk_token");`);
    assert.equal(messages.length, 0);
  });

  it("does not flag `sessionStorage.removeItem('finyk_token')`", () => {
    const messages = lint(`sessionStorage.removeItem("finyk_token");`);
    assert.equal(messages.length, 0);
  });

  it("does not flag `safeReadStringLS('finyk_token')`", () => {
    const messages = lint(`safeReadStringLS("finyk_token");`);
    assert.equal(messages.length, 0);
  });

  it("does not flag `safeRemoveLS('finyk_token')`", () => {
    const messages = lint(`safeRemoveLS("finyk_token");`);
    assert.equal(messages.length, 0);
  });

  // Unrelated keys must NOT trigger the rule — only the FINYK_TOKEN
  // family is in scope.
  it("does not flag writes to unrelated keys", () => {
    const messages = lint(`localStorage.setItem("finyk_budgets", "[]");`);
    assert.equal(messages.length, 0);
  });

  it("does not flag `safeWriteLS(STORAGE_KEYS.FINYK_BUDGETS, …)`", () => {
    const messages = lint(`safeWriteLS(STORAGE_KEYS.FINYK_BUDGETS, "[]");`);
    assert.equal(messages.length, 0);
  });

  it("does not flag a write to a dynamic / unresolvable key", () => {
    const messages = lint(`safeWriteLS(someKey, "value");`);
    assert.equal(messages.length, 0);
  });
});
