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
        parserOptions: { ecmaFeatures: { jsx: true } },
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

  // ─────────────────────────────────────────────────────────────────
  // D-4 expansion (P2-2 in 2026-05-13-testing-devx-roast.md): cover
  // every shape contributors realistically write a foreign-accent
  // utility into. Each case below is a BAD fixture — the rule must
  // emit exactly the expected `messages.length`.
  // ─────────────────────────────────────────────────────────────────

  it('flags foreign accent inside a JSX `className="…"` attribute', () => {
    // Contributors most often inline the literal directly on JSX. The
    // rule walks every Literal regardless of position, so this must
    // fire even when the string never escapes a JSXAttribute.
    const messages = lint(
      `export function Card() { return <div className="rounded ring-routine" />; }`,
      FIZRUK_FILE,
    );
    assert.equal(messages.length, 1);
    assert.match(messages[0].message, /ring-routine/);
  });

  it("flags foreign accent inside a `clsx(…)` argument", () => {
    // `clsx` is the other widely-used utility (alongside `cn`). The
    // existing test only covers `cn`; add explicit `clsx` coverage
    // so a future refactor splitting the two paths cannot regress.
    const messages = lint(
      `const c = clsx("rounded", isActive && "text-routine-strong", "mt-2");`,
      FIZRUK_FILE,
    );
    assert.equal(messages.length, 1);
    assert.match(messages[0].message, /text-routine-strong/);
  });

  it("flags foreign accent inside a `cva(…)` variant value", () => {
    // CVA variant maps are the third common shape (used by Button,
    // Badge, Stat primitives). The accent literal lives deep inside
    // an ObjectExpression → Property → Literal chain — confirm the
    // rule still sees it.
    const messages = lint(
      [
        `const stat = cva("rounded-xl", {`,
        `  variants: { intent: { primary: "bg-nutrition-surface", danger: "bg-rose-50" } },`,
        `});`,
      ].join("\n"),
      FIZRUK_FILE,
    );
    assert.equal(messages.length, 1);
    assert.match(messages[0].message, /bg-nutrition-surface/);
  });

  it("flags foreign accent inside a `twMerge(…)` theme-utility wrapper", () => {
    // Some primitives delegate to `twMerge` to dedupe Tailwind classes
    // before forwarding to the underlying element. The rule has to
    // walk the string argument the same way it walks `cn`/`clsx`.
    const messages = lint(
      `const c = twMerge("px-3 py-2", "bg-finyk-surface");`,
      FIZRUK_FILE,
    );
    assert.equal(messages.length, 1);
    assert.match(messages[0].message, /bg-finyk-surface/);
  });

  it("flags foreign accent across both branches of a conditional ternary", () => {
    // A common shape: `flag ? "ring-routine" : "ring-fizruk"`. Both
    // branches are independent Literal nodes; only the foreign one
    // (`ring-routine` in a fizruk file) must be reported.
    const messages = lint(
      `const c = isActive ? "ring-routine ring-2" : "ring-fizruk ring-2";`,
      FIZRUK_FILE,
    );
    assert.equal(messages.length, 1);
    assert.match(messages[0].message, /ring-routine/);
  });

  it("flags foreign accent under a stacked `dark:hover:focus-visible:` variant chain", () => {
    // The existing `dark:` / `hover:` / `lg:` test only covers one
    // variant per token. Stack three of them and confirm the regex
    // still matches the trailing utility.
    const messages = lint(
      `const c = "dark:hover:focus-visible:bg-routine-strong";`,
      FIZRUK_FILE,
    );
    assert.equal(messages.length, 1);
    assert.match(messages[0].message, /bg-routine-strong/);
  });

  it("flags foreign accent inside an object-literal `className` slot", () => {
    // Object literals that carry a className value (e.g.
    // `<Component {...{ className: "text-routine" }} />` or factory
    // builders) are still plain Literal nodes — confirm the rule
    // does not depend on a JSXAttribute parent.
    const messages = lint(
      `const props = { className: "text-routine-strong", "data-state": "on" };`,
      FIZRUK_FILE,
    );
    assert.equal(messages.length, 1);
    assert.match(messages[0].message, /text-routine-strong/);
  });

  // ─────────────────────────────────────────────────────────────────
  // Shape-variant BAD fixtures (regex-contract hardening). Each case
  // is a foreign accent in a fizruk (or mobile-routine) file — the rule
  // must emit exactly the asserted `messages.length`. These pin the
  // less-obvious token shapes the thinner cases above don't cover:
  // two-segment shades, opacity-only suffixes, gradient/SVG utilities,
  // and multi-quasi template literals.
  // ─────────────────────────────────────────────────────────────────

  it("flags a two-segment shade (`bg-routine-soft-border`)", () => {
    // The shade group accepts up to TWO `-segments`
    // (`(-[a-z0-9]+(?:-[a-z0-9]+)?)?`), so a compound token like
    // `bg-routine-soft-border` must match as a single foreign hit —
    // not slip through because of the extra hyphen.
    const messages = lint(
      `const c = "bg-routine-soft-border p-2";`,
      FIZRUK_FILE,
    );
    assert.equal(messages.length, 1);
    assert.match(messages[0].message, /bg-routine-soft-border/);
  });

  it("flags an opacity-only suffix on a bare module (`bg-routine/40`)", () => {
    // No shade, just an `/<opacity>` suffix. The `(\/\d{1,3})?` group
    // must attach to the bare `bg-routine` and the whole token must be
    // reported (a common shape for translucent module fills).
    const messages = lint(
      `const c = "bg-routine/40 backdrop-blur";`,
      FIZRUK_FILE,
    );
    assert.equal(messages.length, 1);
    assert.match(messages[0].message, /bg-routine\/40/);
  });

  it("flags a shade + opacity suffix together (`text-routine-strong/15`)", () => {
    // Shade *and* opacity stacked. Both optional groups must compose so
    // the full `text-routine-strong/15` token is the reported match.
    const messages = lint(
      `const c = "text-routine-strong/15 underline";`,
      FIZRUK_FILE,
    );
    assert.equal(messages.length, 1);
    assert.match(messages[0].message, /text-routine-strong\/15/);
  });

  it("flags gradient-stop utilities (`from-`/`via-`/`to-`)", () => {
    // The accent-utility set covers gradient stops, so a foreign-module
    // gradient (`from-routine via-nutrition to-finyk`) inside a fizruk
    // file must surface all three stops.
    const messages = lint(
      `const c = "bg-gradient-to-r from-routine via-nutrition to-finyk";`,
      FIZRUK_FILE,
    );
    assert.equal(messages.length, 3);
  });

  it("flags SVG/text color utilities (`fill-`/`stroke-`/`decoration-`)", () => {
    // `fill`, `stroke`, and `decoration` are color-aware utilities too.
    // An icon or underline painted with a foreign accent is the same
    // brand bug as a foreign `bg-` — confirm all three fire.
    const messages = lint(
      `const c = "fill-routine stroke-nutrition decoration-finyk";`,
      FIZRUK_FILE,
    );
    assert.equal(messages.length, 3);
  });

  it("flags foreign accents split across multiple template-literal quasis", () => {
    // A multi-interpolation className: each static chunk is its own
    // TemplateElement node. The rule visits every quasi, so two foreign
    // accents living in two different chunks must both be reported.
    const messages = lint(
      "const c = `ring-routine ${size} ${state} bg-nutrition-surface`;",
      FIZRUK_FILE,
    );
    assert.equal(messages.length, 2);
  });

  it("flags a foreign accent with shade + opacity in an Expo Router file", () => {
    // Combine the mobile `app/modules/<X>/**` surface with the
    // shade+opacity shape — exercises path detection and the regex
    // suffix groups in one fixture.
    const messages = lint(
      `const c = "bg-finyk-surface/30 rounded-2xl";`,
      MOBILE_APP_ROUTINE_FILE,
    );
    assert.equal(messages.length, 1);
    assert.match(messages[0].message, /bg-finyk-surface\/30/);
    assert.match(messages[0].message, /routine/);
  });
});
