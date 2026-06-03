/**
 * Unit tests for the `sergeant-design/no-raw-storage-key` rule.
 *
 * Theme 5 (consolidated audit 2026-05-13): raw localStorage key string literals
 * in storage helper calls must be replaced with STORAGE_KEYS.* from @sergeant/shared.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import plugin from "../index.js";

const linter = new Linter();
const RULE_ID = "sergeant-design/no-raw-storage-key";

function lint(code, filename = "apps/web/src/core/hub/ExpensesCard.js") {
  return linter.verify(
    code,
    {
      plugins: { "sergeant-design": plugin },
      rules: { [RULE_ID]: "warn" },
      languageOptions: { ecmaVersion: "latest", sourceType: "module" },
    },
    { filename },
  );
}

// ─── Valid (factory key usage) ─────────────────────────────────────────────

describe("no-raw-storage-key — valid (factory keys)", () => {
  it("allows STORAGE_KEYS.FINYK_TX_CACHE", () => {
    const messages = lint(`
      safeReadLS(STORAGE_KEYS.FINYK_TX_CACHE, null);
    `);
    assert.equal(messages.length, 0);
  });

  it("allows STORAGE_KEYS.NUTRITION_LOG", () => {
    const messages = lint(`
      safeReadLS(STORAGE_KEYS.NUTRITION_LOG, {});
    `);
    assert.equal(messages.length, 0);
  });

  it("allows STORAGE_KEYS.ROUTINE", () => {
    const messages = lint(`
      safeReadLS(STORAGE_KEYS.ROUTINE, null);
    `);
    assert.equal(messages.length, 0);
  });

  it("allows non-registry string keys", () => {
    // Keys not in the known set should not be flagged.
    const messages = lint(`
      safeReadLS("some_unknown_key", null);
    `);
    assert.equal(messages.length, 0);
  });

  it("allows unrelated function calls with registry string", () => {
    const messages = lint(`
      doSomethingElse("finyk_tx_cache");
    `);
    assert.equal(messages.length, 0);
  });

  it("does NOT flag storageKeys file", () => {
    const messages = lint(
      `export const STORAGE_KEYS = { FINYK_TX_CACHE: "finyk_tx_cache" };`,
      "packages/shared/src/lib/storageKeys.js",
    );
    assert.equal(messages.length, 0);
  });

  it("does NOT flag test files", () => {
    const messages = lint(
      `safeReadLS("finyk_tx_cache", null);`,
      "apps/web/src/core/hub/ExpensesCard.test.js",
    );
    assert.equal(messages.length, 0);
  });

  it("does NOT flag storageManager file", () => {
    const messages = lint(
      `safeReadLS("finyk_tx_cache", null);`,
      "apps/web/src/shared/lib/storage/storageManager.js",
    );
    assert.equal(messages.length, 0);
  });

  it("does NOT flag searchCache file", () => {
    const messages = lint(
      `cachedParse("fizruk_workouts_v1", "id", raw, parse, []);`,
      "apps/web/src/core/hub/search/searchCache.js",
    );
    assert.equal(messages.length, 0);
  });
});

// ─── Invalid (raw string literals) ────────────────────────────────────────

describe("no-raw-storage-key — invalid (raw literals)", () => {
  it("flags safeReadLS with finyk_tx_cache", () => {
    const messages = lint(`
      safeReadLS("finyk_tx_cache", null);
    `);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
    assert.ok(messages[0].message.includes("finyk_tx_cache"));
  });

  it("flags safeReadLS with hub_routine_v1", () => {
    const messages = lint(`
      safeReadLS("hub_routine_v1", null);
    `);
    assert.equal(messages.length, 1);
    assert.ok(messages[0].message.includes("hub_routine_v1"));
  });

  it("flags safeReadLS with nutrition_log_v1", () => {
    const messages = lint(`
      safeReadLS("nutrition_log_v1", {});
    `);
    assert.equal(messages.length, 1);
  });

  it("flags safeReadStringLS with fizruk_workouts_v1", () => {
    const messages = lint(`
      safeReadStringLS("fizruk_workouts_v1", null);
    `);
    assert.equal(messages.length, 1);
  });

  it("flags useLocalStorageState with hub_dark_mode_v1", () => {
    const messages = lint(`
      useLocalStorageState("hub_dark_mode_v1", false);
    `);
    assert.equal(messages.length, 1);
  });

  it("flags ls() helper with hub_routine_v1", () => {
    const messages = lint(`
      ls("hub_routine_v1", null);
    `);
    assert.equal(messages.length, 1);
  });

  it("flags template literal with no expressions", () => {
    const messages = lint("safeReadLS(`finyk_tx_cache`, null);");
    assert.equal(messages.length, 1);
  });
});
