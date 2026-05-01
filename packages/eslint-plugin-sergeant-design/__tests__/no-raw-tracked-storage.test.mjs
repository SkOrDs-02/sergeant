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
       useLocalStorage("finyk_budgets", []);`,
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });

  it("flags useLocalStorage with STORAGE_KEYS.<TRACKED>", () => {
    const messages = lint(
      `import { useLocalStorage } from "@/lib/storage";
       import { STORAGE_KEYS } from "@sergeant/shared";
       useLocalStorage(STORAGE_KEYS.FIZRUK_WORKOUTS, []);`,
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });

  it("flags useLocalStorage with STORAGE_KEYS['<TRACKED>'] bracket form", () => {
    const messages = lint(
      `import { useLocalStorage } from "@/lib/storage";
       import { STORAGE_KEYS } from "@sergeant/shared";
       useLocalStorage(STORAGE_KEYS["NUTRITION_LOG"], []);`,
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });

  it("flags useLocalStorage with the routine key", () => {
    // Special case: ROUTINE is the only tracked key for the `routine`
    // module; its literal value is `hub_routine_v1` and it does NOT
    // share the per-module `*_*` prefix the others use, so the rule
    // must list it explicitly rather than relying on a prefix match.
    const messages = lint(
      `import { useLocalStorage } from "@/lib/storage";
       useLocalStorage("hub_routine_v1", null);`,
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });

  it("flags template-literal keys with no expressions", () => {
    // `finyk_budgets` is a tracked key (in `SYNC_MODULES.finyk.keys`).
    // The earlier fixture used `finyk_token`, which was retired from
    // tracked storage in PR #002 (Stage 0): the Monobank PAT lives only
    // server-side now and has its own dedicated rule
    // (`no-finyk-token-in-storage`). The AST matcher under test —
    // template-literal-with-no-expressions — is the same.
    const messages = lint(
      `import { useLocalStorage } from "@/lib/storage";
       useLocalStorage(\`finyk_budgets\`, null);`,
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
       useSyncedStorage("finyk_budgets", []);`,
    );
    assert.deepEqual(messages, []);
  });

  it("does NOT flag arbitrary call expressions that share an arg shape", () => {
    const messages = lint(
      `import { STORAGE_KEYS } from "@sergeant/shared";
       safeReadLS(STORAGE_KEYS.FINYK_BUDGETS, []);`,
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
       storage.useLocalStorage("finyk_budgets", []);`,
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });
});
