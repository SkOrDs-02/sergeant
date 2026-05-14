/**
 * Unit tests for `sergeant-design/no-bare-fixed-inset-modal`.
 *
 * The rule flags JSX elements that wear a `fixed inset-0` overlay
 * className but lack one of the dialog-affirmative attributes
 * (`role="dialog"` / `role="alertdialog"` / `role="presentation"` or
 * `aria-modal`) on the SAME element. Canonical modal primitives
 * (`Modal`, `Sheet`, `ConfirmDialog`, `InputDialog`,
 * `KeyboardShortcutsModal`, `OnboardingWizard`) are opted out via
 * `options.allow`.
 *
 * Audit: `docs/audits/2026-05-13-web-frontend-ergonomics-roast.md` § F2.
 *
 * Companion to other JSX-className-aware rules (`no-eyebrow-drift`,
 * `no-hex-in-classname`) — `linter.verify()` exercises the rule
 * directly without a filesystem fixture; absolute filenames are
 * derived from `process.cwd()` so ESLint flat-config `files` matches.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import path from "node:path";
import plugin from "../index.js";

const linter = new Linter();
const RULE_ID = "sergeant-design/no-bare-fixed-inset-modal";

// Suggested allowlist mirrors the audit § F2 list — the 6 canonical
// modal primitives that legitimately render `fixed inset-0`.
const DEFAULT_ALLOW = [
  "apps/web/src/shared/components/ui/Modal.tsx",
  "apps/web/src/shared/components/ui/Sheet.tsx",
  "apps/web/src/shared/components/ui/ConfirmDialog.tsx",
  "apps/web/src/shared/components/ui/InputDialog.tsx",
  "apps/web/src/shared/components/ui/KeyboardShortcutsModal.tsx",
  "apps/web/src/core/onboarding/OnboardingWizard.tsx",
];

function fixturePath(rel) {
  return path.join(process.cwd(), rel);
}

function lint(
  code,
  filename = fixturePath("apps/web/src/shared/components/ui/Foo.tsx"),
  options = {},
) {
  return linter
    .verify(
      code,
      {
        files: ["**/*.{js,mjs,cjs,jsx,ts,tsx}"],
        plugins: { "sergeant-design": plugin },
        rules: { [RULE_ID]: ["warn", options] },
        languageOptions: {
          ecmaVersion: "latest",
          sourceType: "module",
          parserOptions: { ecmaFeatures: { jsx: true } },
        },
      },
      { filename },
    )
    .filter((m) => m.ruleId !== null);
}

describe("sergeant-design/no-bare-fixed-inset-modal", () => {
  // ─── BAD — bare overlays missing a11y signals ─────────────────────────

  it('flags `<div className="fixed inset-0">` with no role / aria-modal', () => {
    const msgs = lint(`
      function Overlay() {
        return <div className="fixed inset-0" />;
      }
    `);
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].ruleId, RULE_ID);
    assert.match(msgs[0].message, /fixed inset-0/);
    assert.equal(msgs[0].severity, 1, "severity=1 → warn");
  });

  it("flags `fixed inset-0 z-50` (with z-index) without role / aria-modal", () => {
    const msgs = lint(`
      function Overlay() {
        return <div className="fixed inset-0 z-50 bg-black/40" />;
      }
    `);
    assert.equal(msgs.length, 1);
  });

  it('flags `fixed inset-0 z-9999` overlay with `role="alert"` (non-dialog role)', () => {
    // Mirrors the StreakCelebration.tsx offender from audit § F2.
    const msgs = lint(`
      function Celebration() {
        return (
          <div
            className="fixed inset-0 z-9999 flex items-center justify-center pointer-events-none"
            aria-live="polite"
            role="alert"
          />
        );
      }
    `);
    assert.equal(msgs.length, 1);
  });

  it("flags JSX template-literal className `\\`fixed inset-0 \\${extra}\\``", () => {
    const msgs = lint(
      "function Overlay({ extra }) {\n" +
        "  return <div className={`fixed inset-0 ${extra}`} />;\n" +
        "}",
    );
    assert.equal(msgs.length, 1);
  });

  it('flags `className={cn("fixed inset-0", isOpen && "animate-in")}`', () => {
    const msgs = lint(`
      function Overlay({ isOpen }) {
        return <div className={cn("fixed inset-0", isOpen && "animate-in")} />;
      }
    `);
    assert.equal(msgs.length, 1);
  });

  it('flags `clsx("fixed", "inset-0")` split across positional args', () => {
    const msgs = lint(`
      function Overlay() {
        return <div className={clsx("fixed", "inset-0", "bg-black/40")} />;
      }
    `);
    assert.equal(msgs.length, 1);
  });

  it('flags `cn({ "fixed inset-0": isOpen })` object-keys soup', () => {
    const msgs = lint(`
      function Overlay({ isOpen }) {
        return <div className={cn({ "fixed inset-0": isOpen })} />;
      }
    `);
    assert.equal(msgs.length, 1);
  });

  it('flags `twMerge("fixed inset-0", className)` re-export wrapper', () => {
    const msgs = lint(`
      function Overlay({ className }) {
        return <div className={twMerge("fixed inset-0", className)} />;
      }
    `);
    assert.equal(msgs.length, 1);
  });

  it('flags `className={isOpen ? "fixed inset-0" : "hidden"}` ternary', () => {
    const msgs = lint(`
      function Overlay({ isOpen }) {
        return <div className={isOpen ? "fixed inset-0 bg-black/40" : "hidden"} />;
      }
    `);
    assert.equal(msgs.length, 1);
  });

  it('flags overlay with `aria-modal="false"` (explicit-false counts as missing)', () => {
    const msgs = lint(`
      function Overlay() {
        return <div className="fixed inset-0" aria-modal="false" />;
      }
    `);
    assert.equal(msgs.length, 1);
  });

  // ─── GOOD — dialog-affirmative attributes on the same element ─────────

  it('does NOT flag `fixed inset-0` paired with `role="dialog"` on same element', () => {
    const msgs = lint(`
      function Overlay() {
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            role="dialog"
            aria-modal="true"
          />
        );
      }
    `);
    assert.equal(msgs.length, 0);
  });

  it('does NOT flag `fixed inset-0` paired with `role="alertdialog"`', () => {
    const msgs = lint(`
      function Overlay() {
        return <div className="fixed inset-0" role="alertdialog" />;
      }
    `);
    assert.equal(msgs.length, 0);
  });

  it('does NOT flag `fixed inset-0` paired with `role="presentation"`', () => {
    // Mirrors the QuickActionsMenu.tsx case — `role="presentation"`
    // signals \"not interactive itself\" so the rule treats it as an
    // intentional overlay marker.
    const msgs = lint(`
      function Overlay() {
        return <div className="fixed inset-0 z-50" role="presentation" />;
      }
    `);
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag `fixed inset-0` paired with bare `aria-modal` (no value)", () => {
    const msgs = lint(`
      function Overlay() {
        return <div className="fixed inset-0" aria-modal />;
      }
    `);
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag `fixed inset-0` paired with `aria-modal={true}` (expression)", () => {
    const msgs = lint(`
      function Overlay() {
        return <div className="fixed inset-0" aria-modal={true} />;
      }
    `);
    assert.equal(msgs.length, 0);
  });

  it('does NOT flag `fixed inset-0` paired with `role={"dialog"}` (JSX expression)', () => {
    const msgs = lint(`
      function Overlay() {
        return <div className="fixed inset-0" role={"dialog"} />;
      }
    `);
    assert.equal(msgs.length, 0);
  });

  // ─── GOOD — utility-soup that doesn't form `fixed inset-0` ────────────

  it("does NOT flag `fixed bottom-0 left-0 right-0` (no `inset-0` token)", () => {
    const msgs = lint(`
      function StickyFooter() {
        return <div className="fixed bottom-0 left-0 right-0 z-30" />;
      }
    `);
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag `absolute inset-0` (no `fixed` token)", () => {
    const msgs = lint(`
      function Backdrop() {
        return <div className="absolute inset-0 bg-black/30" />;
      }
    `);
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag suffix matches like `unfixed inset-0` / `inset-0.5`", () => {
    // Token-aware regex: only standalone tokens count. `unfixed` and
    // `inset-0.5` must not trip the heuristic.
    const msgs = lint(`
      function NotAModal() {
        return <div className="unfixed inset-0.5" />;
      }
    `);
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag JSX without a className attribute at all", () => {
    const msgs = lint(`
      function Empty() {
        return <div />;
      }
    `);
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag variable-resolved className (out-of-scope)", () => {
    // Variable tracking is intentionally skipped — keeps the rule
    // cheap. Documented limitation.
    const msgs = lint(`
      const overlay = "fixed inset-0";
      function Overlay() {
        return <div className={overlay} />;
      }
    `);
    assert.equal(msgs.length, 0);
  });

  // ─── allow option (file-path opt-out) ─────────────────────────────────

  it("does NOT flag files whose path matches an `allow` entry (Modal.tsx)", () => {
    const msgs = lint(
      `
      function Modal() {
        return <div className="fixed inset-0" />;
      }
    `,
      fixturePath("apps/web/src/shared/components/ui/Modal.tsx"),
      { allow: DEFAULT_ALLOW },
    );
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag any of the 6 audit-listed primitives with full default allowlist", () => {
    for (const allowEntry of DEFAULT_ALLOW) {
      const msgs = lint(
        `
        export function Primitive() {
          return <div className="fixed inset-0 z-50" />;
        }
      `,
        fixturePath(allowEntry),
        { allow: DEFAULT_ALLOW },
      );
      assert.equal(
        msgs.length,
        0,
        `expected ${allowEntry} to be skipped by allowlist`,
      );
    }
  });

  it("still flags files OUTSIDE the allowlist (offender path)", () => {
    // QuickActionsMenu was listed in audit § F2 but is NOT in the
    // default allowlist — rule should warn so the offender shows up.
    const msgs = lint(
      `
      function QuickActionsMenu() {
        return <div className="fixed inset-0 z-9999" />;
      }
    `,
      fixturePath("apps/web/src/shared/components/ui/QuickActionsMenu.tsx"),
      { allow: DEFAULT_ALLOW },
    );
    assert.equal(msgs.length, 1);
  });

  // ─── __expected_warnings__ — production offenders enumerated in audit ─

  it("__expected_warnings__: production offenders still trigger warn under default config", () => {
    // Snapshot of offenders from audit § F2 (StreakCelebration uses
    // `role="alert"` which is not in the dialog-role allowlist).
    // QuickActionsMenu currently does declare `role=\"presentation\"`
    // on the same element so it is NOT in this snapshot — we treat
    // that as an intentional baseline so the rule doesn't go louder
    // than the audit's own counts.
    const offenders = [
      {
        path: "apps/web/src/shared/components/ui/StreakCelebration.tsx",
        code: `
          function StreakCelebration() {
            return (
              <div
                className={cn("fixed inset-0 z-9999 flex items-center justify-center pointer-events-none", className)}
                aria-live="polite"
                role="alert"
              />
            );
          }
        `,
      },
    ];
    for (const offender of offenders) {
      const msgs = lint(offender.code, fixturePath(offender.path), {
        allow: DEFAULT_ALLOW,
      });
      assert.equal(
        msgs.length,
        1,
        `expected ${offender.path} to warn — was ${msgs.length}`,
      );
      assert.equal(msgs[0].severity, 1, "severity=1 → warn");
    }
  });
});
