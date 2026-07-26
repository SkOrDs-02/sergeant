/**
 * Unit tests for the `sergeant-design/no-retired-module-hue` rule.
 *
 * A module's OWN raw palette hue becomes forbidden inside its subtree
 * after a hue migration:
 *   • finyk migrated emerald → teal (2026-07)
 *   • fizruk migrated teal → cyan (disambiguates from finyk)
 *
 * The rule catches the ghosts `no-foreign-module-accent` cannot see —
 * `hover:bg-emerald-800` left behind in `modules/finyk/**` when
 * `bg-finyk-strong` already resolves to teal. Cross-module shells
 * (`core/**`, `shared/**`) and test files are exempt.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import path from "node:path";
import plugin from "../index.js";

const linter = new Linter();
const RULE_ID = "sergeant-design/no-retired-module-hue";

function abs(p) {
  return path.resolve(process.cwd(), p);
}

function lint(code, filename) {
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

const FINYK_FILE = abs("apps/web/src/modules/finyk/pages/Overview.tsx");
const FIZRUK_FILE = abs("apps/web/src/modules/fizruk/pages/PlanCalendar.tsx");
const ROUTINE_FILE = abs("apps/web/src/modules/routine/components/HabitCard.tsx");
const CORE_FILE = abs("apps/web/src/core/hub/HubDashboard.tsx");
const SHARED_FILE = abs("apps/web/src/shared/components/ui/Button.tsx");
const MOBILE_FINYK_FILE = abs("apps/mobile/src/modules/finyk/screens/Wallet.tsx");
const FINYK_TEST_FILE = abs("apps/web/src/modules/finyk/pages/Overview.test.tsx");

describe("no-retired-module-hue", () => {
  it("flags `hover:bg-emerald-800` inside modules/finyk", () => {
    const messages = lint(
      `const c = "bg-finyk-strong hover:bg-emerald-800";`,
      FINYK_FILE,
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
    assert.match(messages[0].message, /emerald-800/);
    assert.match(messages[0].message, /finyk/);
  });

  it("flags multiple retired-hue ghosts in one soup", () => {
    const messages = lint(
      `const c = "from-emerald-500 to-emerald-300 dark:text-emerald-400";`,
      FINYK_FILE,
    );
    assert.equal(messages.length, 3);
  });

  it("flags the retired `teal` hue inside modules/fizruk", () => {
    const messages = lint(`const c = "bg-teal-600 ring-teal-200";`, FIZRUK_FILE);
    assert.equal(messages.length, 2);
    assert.match(messages[0].message, /fizruk/);
  });

  it("flags arbitrary hex of the retired hue (`bg-[#10b981]`)", () => {
    const messages = lint(`const c = "bg-[#10b981] p-2";`, FINYK_FILE);
    assert.equal(messages.length, 1);
    assert.match(messages[0].message, /#10b981/);
  });

  it("does NOT flag the semantic finyk token (`bg-finyk-strong`)", () => {
    const messages = lint(
      `const c = "bg-finyk-strong text-finyk-soft-fg bg-chart-finyk hover:bg-finyk-hover";`,
      FINYK_FILE,
    );
    assert.equal(messages.length, 0);
  });

  it("does NOT flag the migration TARGET hue (`bg-teal-*` inside finyk)", () => {
    // finyk migrated TO teal — raw teal is the target, not the ghost.
    const messages = lint(`const c = "bg-teal-800 hover:bg-teal-900";`, FINYK_FILE);
    assert.equal(messages.length, 0);
  });

  it("does NOT flag a module with no retired hue (routine)", () => {
    const messages = lint(
      `const c = "bg-emerald-500 bg-teal-600 bg-coral-500";`,
      ROUTINE_FILE,
    );
    assert.equal(messages.length, 0);
  });

  it("does NOT flag retired hues in core/** (cross-module shell)", () => {
    const messages = lint(`const c = "bg-emerald-500 bg-teal-600";`, CORE_FILE);
    assert.equal(messages.length, 0);
  });

  it("does NOT flag retired hues in shared/** (primitives)", () => {
    // Button's finyk variant lives in shared/ and legitimately spells the
    // teal target; the retired-hue guard only fires inside the module tree.
    const messages = lint(`const c = "bg-emerald-500";`, SHARED_FILE);
    assert.equal(messages.length, 0);
  });

  it("flags retired hues in apps/mobile/src/modules/<X>/**", () => {
    const messages = lint(`const c = "bg-emerald-500";`, MOBILE_FINYK_FILE);
    assert.equal(messages.length, 1);
    assert.match(messages[0].message, /finyk/);
  });

  it("does NOT run on module test files", () => {
    const messages = lint(`const c = "hover:bg-emerald-800";`, FINYK_TEST_FILE);
    assert.equal(messages.length, 0);
  });

  it("handles stacked variant prefixes (`dark:hover:`)", () => {
    const messages = lint(
      `const c = "dark:hover:bg-emerald-900/40";`,
      FINYK_FILE,
    );
    assert.equal(messages.length, 1);
    assert.match(messages[0].message, /emerald-900\/40/);
  });

  it("flags occurrences inside cn() argument soup", () => {
    const messages = lint(
      `const c = cn("base", active && "text-emerald-700", "mt-2");`,
      FINYK_FILE,
    );
    assert.equal(messages.length, 1);
  });

  it("does NOT flag words that merely *contain* the hue name", () => {
    // `emeraldish` / bare `-emerald` with no shade is not a utility.
    const messages = lint(
      `const c = "bg-emeraldish text-emerald";`,
      FINYK_FILE,
    );
    assert.equal(messages.length, 0);
  });

  it("does NOT flag non-retired arbitrary hex", () => {
    const messages = lint(`const c = "bg-[#123456]";`, FINYK_FILE);
    assert.equal(messages.length, 0);
  });
});
