/**
 * Unit tests for the `sergeant-design/no-raw-tracked-storage` rule.
 *
 * Uses ESLint's `Linter` directly (no extra test runner deps beyond
 * `node:test`, which ships with Node 20). Each case lints a small
 * snippet against the rule in isolation so we exercise the AST
 * matchers without standing up a full project config.
 *
 * The deliberate-regression cases double as CI gates: if the rule
 * stops flagging a tracked key, this file fails the test run, which
 * `pnpm lint` (root) calls before finishing.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import plugin from "../index.js";

const linter = new Linter();

const RULE_ID = "sergeant-design/no-raw-tracked-storage";

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

describe("no-raw-tracked-storage", () => {
  it("flags useLocalStorage with a tracked string-literal key", () => {
    const messages = lint(
      `import { useLocalStorage } from "@/lib/storage";
       useLocalStorage("hub_user_profile_v1", []);`,
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });

  it("flags useLocalStorage with STORAGE_KEYS.<TRACKED>", () => {
    const messages = lint(
      `import { useLocalStorage } from "@/lib/storage";
       import { STORAGE_KEYS } from "@sergeant/shared";
       useLocalStorage(STORAGE_KEYS.USER_PROFILE, []);`,
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });

  it("does NOT flag useLocalStorage with the retired fizruk keys", () => {
    // PR #030 (storage-roadmap Stage 4): the eleven historical
    // `module_data.fizruk` LS/MMKV keys (`fizruk_workouts_v1`, etc.)
    // were removed from SYNC_MODULES — cross-device sync moved to the
    // per-table `fizruk_*` SQLite mirror plus the op-log. Direct
    // access is now guarded by the dedicated `no-restricted-syntax`
    // rule in `eslint.config.js`, not by `no-raw-tracked-storage`.
    const messages = lint(
      `import { useLocalStorage } from "@/lib/storage";
       import { STORAGE_KEYS } from "@sergeant/shared";
       useLocalStorage(STORAGE_KEYS.FIZRUK_WORKOUTS, []);
       useLocalStorage("fizruk_measurements_v1", []);`,
    );
    assert.deepEqual(messages, []);
  });

  it("flags useLocalStorage with STORAGE_KEYS['<TRACKED>'] bracket form", () => {
    const messages = lint(
      `import { useLocalStorage } from "@/lib/storage";
       import { STORAGE_KEYS } from "@sergeant/shared";
       useLocalStorage(STORAGE_KEYS["USER_PROFILE"], []);`,
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });

  it("does NOT flag useLocalStorage with the retired nutrition keys", () => {
    // PR #034 (storage-roadmap Stage 4): the five historical
    // `module_data.nutrition` LS/MMKV keys (`nutrition_log_v1`, etc.)
    // were removed from SYNC_MODULES — cross-device sync moved to the
    // per-table `nutrition_*` SQLite mirror plus the op-log. Direct
    // access is now guarded by the dedicated `no-restricted-syntax`
    // rule in `eslint.config.js`, not by `no-raw-tracked-storage`.
    const messages = lint(
      `import { useLocalStorage } from "@/lib/storage";
       import { STORAGE_KEYS } from "@sergeant/shared";
       useLocalStorage(STORAGE_KEYS.NUTRITION_LOG, []);
       useLocalStorage("nutrition_pantries_v1", []);`,
    );
    assert.deepEqual(messages, []);
  });

  it("does NOT flag useLocalStorage with the retired finyk keys", () => {
    // PR #039 (storage-roadmap Stage 4): the nineteen historical
    // `module_data.finyk` LS/MMKV keys (`finyk_budgets`,
    // `finyk_subs`, `finyk_assets`, etc.) were removed from
    // SYNC_MODULES — cross-device sync moved to the per-table
    // `finyk_*` SQLite mirror plus the op-log and the Mono
    // client-side mirror. Direct access is now guarded by the
    // dedicated `no-restricted-syntax` rule in `eslint.config.js`,
    // not by `no-raw-tracked-storage`. The Monobank PAT
    // (`finyk_token`) was already retired in PR #002 and remains
    // banned by its own `no-finyk-token-in-storage` rule.
    const messages = lint(
      `import { useLocalStorage } from "@/lib/storage";
       import { STORAGE_KEYS } from "@sergeant/shared";
       useLocalStorage(STORAGE_KEYS.FINYK_BUDGETS, []);
       useLocalStorage("finyk_subs", []);
       useLocalStorage("finyk_tx_cache", []);`,
    );
    assert.deepEqual(messages, []);
  });

  it("does NOT flag useLocalStorage with the retired routine key", () => {
    // PR #026 (storage-roadmap Stage 4): routine was removed from
    // SYNC_MODULES — its LS blob is no longer cloud-synced. Direct
    // access is now guarded by a separate `no-restricted-syntax` rule
    // in eslint.config.js, not by `no-raw-tracked-storage`.
    const messages = lint(
      `import { useLocalStorage } from "@/lib/storage";
       useLocalStorage("hub_routine_v1", null);`,
    );
    assert.deepEqual(messages, []);
  });

  it("flags template-literal keys with no expressions", () => {
    // `hub_user_profile_v1` (USER_PROFILE) is the only tracked key
    // remaining after PR #039 retired the finyk module from
    // SYNC_MODULES (storage-roadmap Stage 4). Earlier fixtures used
    // `finyk_budgets` / `finyk_token`, both retired (Stages 0 and 4).
    // The AST matcher under test — template-literal-with-no-
    // expressions — is the same.
    const messages = lint(
      `import { useLocalStorage } from "@/lib/storage";
       useLocalStorage(\`hub_user_profile_v1\`, null);`,
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });

  it("does NOT flag useLocalStorage with an untracked key (UI-only state)", () => {
    // `hub_routine_main_tab_v1` is a UI-only preference that lives in
    // STORAGE_KEYS but is intentionally NOT in SYNC_MODULES — it must
    // remain free to use raw `useLocalStorage`.
    const messages = lint(
      `import { useLocalStorage } from "@/lib/storage";
       useLocalStorage("hub_routine_main_tab_v1", "summary");`,
    );
    assert.deepEqual(messages, []);
  });

  it("does NOT flag useSyncedStorage even with a tracked key", () => {
    const messages = lint(
      `import { useSyncedStorage } from "@/sync/useSyncedStorage";
       useSyncedStorage("hub_user_profile_v1", []);`,
    );
    assert.deepEqual(messages, []);
  });

  it("does NOT flag arbitrary call expressions that share an arg shape", () => {
    const messages = lint(
      `import { STORAGE_KEYS } from "@sergeant/shared";
       safeReadLS(STORAGE_KEYS.USER_PROFILE, []);`,
    );
    assert.deepEqual(messages, []);
  });

  it("does NOT flag useLocalStorage with a dynamic / non-literal key", () => {
    // Conservative: if the key cannot be resolved statically, we let
    // it through rather than nag — this is a guardrail, not a code
    // search. False negatives here are acceptable; the bug we are
    // protecting against (Finyk/Fizruk regression) was a hardcoded key.
    const messages = lint(
      `import { useLocalStorage } from "@/lib/storage";
       function H({ k }) { useLocalStorage(k, null); }`,
    );
    assert.deepEqual(messages, []);
  });

  it("flags member-access useLocalStorage (e.g. namespace import)", () => {
    const messages = lint(
      `import * as storage from "@/lib/storage";
       storage.useLocalStorage("hub_user_profile_v1", []);`,
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });
});
