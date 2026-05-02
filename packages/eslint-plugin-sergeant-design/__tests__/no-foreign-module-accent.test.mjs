/**
 * Unit tests for the `sergeant-design/no-foreign-module-accent` rule.
 *
 * Inside `apps/<app>/src/modules/<X>/**` only `<X>`'s accent utilities
 * may appear (`bg-<X>-*`, `text-<X>-*`, `ring-<X>`, …). A fizruk
 * component accidentally rendering `ring-routine` is a design bug —
 * the user reads the coral ring as "Рутина". Cross-module shells
 * (`core/**`, `shared/**`, `stories/**`) are exempt.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import path from "node:path";
import plugin from "../index.js";

const linter = new Linter();
const RULE_ID = "sergeant-design/no-foreign-module-accent";

// ESLint v9 flat config only activates for files matched by `files:` AND
// located under the linter cwd. We use `path.resolve(process.cwd(), …)`
// to anchor the synthetic test filenames so the config matches.
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
      },
    },
    { filename },
  );
}

const FIZRUK_FILE = abs("apps/web/src/modules/fizruk/pages/PlanCalendar.tsx");
const FINYK_FILE = abs("apps/web/src/modules/finyk/pages/Overview.tsx");
const ROUTINE_FILE = abs(
  "apps/web/src/modules/routine/components/HabitCard.tsx",
);
const CORE_FILE = abs("apps/web/src/core/hub/HubDashboard.tsx");
const SHARED_FILE = abs("apps/web/src/shared/components/ui/Button.tsx");
const MOBILE_FIZRUK_FILE = abs(
  "apps/mobile/src/modules/fizruk/screens/Workout.tsx",
);
const MOBILE_APP_ROUTINE_FILE = abs(
  "apps/mobile/app/modules/routine/_layout.tsx",
);
const TEST_FILE = abs(
  "apps/web/src/modules/fizruk/pages/PlanCalendar.test.tsx",
);

describe("no-foreign-module-accent", () => {
  it("flags `ring-routine` inside modules/fizruk", () => {
    const messages = lint(
      `const c = "focus-visible:ring-routine";`,
      FIZRUK_FILE,
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
    assert.match(messages[0].message, /ring-routine/);
    assert.match(messages[0].message, /fizruk/);
  });

  it("flags `bg-nutrition-surface` inside modules/finyk", () => {
    const messages = lint(
      `const c = "rounded bg-nutrition-surface p-4";`,
      FINYK_FILE,
    );
    assert.equal(messages.length, 1);
    assert.match(messages[0].message, /bg-nutrition-surface/);
  });

  it("flags multiple foreign accents in one soup", () => {
    const messages = lint(
      `const c = "bg-fizruk text-finyk border-nutrition";`,
      ROUTINE_FILE,
    );
    assert.equal(messages.length, 3);
  });

  it("does NOT flag same-module accent utilities", () => {
    const messages = lint(
      `const c = "bg-fizruk-surface text-fizruk-strong ring-fizruk hover:bg-fizruk-600";`,
      FIZRUK_FILE,
    );
    assert.equal(messages.length, 0);
  });

  it("does NOT flag accents in core/** (cross-module shell)", () => {
    const messages = lint(
      `const c = "bg-finyk-surface text-fizruk-strong border-routine ring-nutrition";`,
      CORE_FILE,
    );
    assert.equal(messages.length, 0);
  });

  it("does NOT flag accents in shared/** (primitives)", () => {
    const messages = lint(
      `const c = "bg-routine text-finyk ring-fizruk border-nutrition";`,
      SHARED_FILE,
    );
    assert.equal(messages.length, 0);
  });

  it("flags foreign accents in apps/mobile/src/modules/<X>/**", () => {
    const messages = lint(
      `const c = "bg-routine-surface";`,
      MOBILE_FIZRUK_FILE,
    );
    assert.equal(messages.length, 1);
    assert.match(messages[0].message, /fizruk/);
  });

  it("flags foreign accents in Expo Router `apps/mobile/app/modules/<X>/**`", () => {
    const messages = lint(
      `const c = "text-finyk-strong";`,
      MOBILE_APP_ROUTINE_FILE,
    );
    assert.equal(messages.length, 1);
    assert.match(messages[0].message, /routine/);
  });

  it("does NOT run on test files (they reference all modules legitimately)", () => {
    const messages = lint(`const c = "bg-routine text-finyk";`, TEST_FILE);
    assert.equal(messages.length, 0);
  });

  it("handles variant prefixes (`dark:`, `hover:`, `lg:`)", () => {
    const messages = lint(
      `const c = "dark:bg-routine hover:text-nutrition lg:border-finyk";`,
      FIZRUK_FILE,
    );
    assert.equal(messages.length, 3);
  });

  it("handles shade + opacity suffixes (`-500`, `/15`)", () => {
    const messages = lint(
      `const c = "bg-routine-500/15 text-nutrition-soft";`,
      FIZRUK_FILE,
    );
    assert.equal(messages.length, 2);
  });

  it("flags occurrences inside template literals", () => {
    const messages = lint(
      `const c = \`\${base} ring-routine \${rest}\`;`,
      FIZRUK_FILE,
    );
    assert.equal(messages.length, 1);
  });

  it("flags occurrences inside cn() argument soup", () => {
    const messages = lint(
      `const c = cn("base", active && "ring-routine", "mt-2");`,
      FIZRUK_FILE,
    );
    assert.equal(messages.length, 1);
  });

  it("does NOT flag words that merely *contain* a module name", () => {
    // `bg-finykington` isn't a finyk accent — the regex anchors on
    // `-<module>` followed by (end of word | shade suffix | opacity).
    const messages = lint(`const c = "bg-finyksurface-600";`, FIZRUK_FILE);
    assert.equal(messages.length, 0);
  });

  it("does NOT flag accents inside `modules/shared/**` (cross-module utility folder)", () => {
    const messages = lint(
      `const c = "bg-routine text-finyk bg-fizruk bg-nutrition";`,
      abs("apps/mobile/src/modules/shared/ModuleErrorBoundary.tsx"),
    );
    // Only the four canonical modules (finyk/fizruk/routine/nutrition)
    // own their accent palette. `modules/shared/` hosts primitives
    // that legitimately render whichever accent the current module
    // needs (e.g. ModuleErrorBoundary), so the rule must stay quiet.
    assert.equal(messages.length, 0);
  });
});
