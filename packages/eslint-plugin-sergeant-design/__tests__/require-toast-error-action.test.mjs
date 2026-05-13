/**
 * Unit tests for `sergeant-design/require-toast-error-action`.
 *
 * The rule reports `toast.error(...)` and `toast.show(msg, "error", ...)`
 * calls that lack an `action: { label, onClick }` parameter. Bare error
 * toasts trap users in a dead-end because they disappear without
 * surfacing a recovery path — see docs/ui/toast-policy.md.
 *
 * Companion to `useToast.tsx` signatures:
 *   - `error: (msg, duration?, action?) => number` → action at index 2
 *   - `show: (msg, type?, duration?, action?) => number` → action at index 3
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import path from "node:path";
import plugin from "../index.js";

const linter = new Linter();
const RULE_ID = "sergeant-design/require-toast-error-action";

function abs(p) {
  return path.resolve(process.cwd(), p);
}

function lint(
  code,
  filename = abs("apps/web/src/modules/finyk/Foo.tsx"),
  options = {},
) {
  return linter.verify(
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
  );
}

describe("require-toast-error-action", () => {
  it("flags bare `toast.error('message')` without action", () => {
    const msgs = lint(`
      function submit() {
        toast.error("Не вдалося синхронізувати");
      }
    `);
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].ruleId, RULE_ID);
  });

  it("flags `toast.error(msg, duration)` with two args and no action", () => {
    const msgs = lint(`
      function submit() {
        toast.error("Не вдалося синхронізувати", 5000);
      }
    `);
    assert.equal(msgs.length, 1);
  });

  it("flags `toast.error(msg, duration, null)` (explicit null action)", () => {
    const msgs = lint(`
      function submit() {
        toast.error("Не вдалося синхронізувати", 5000, null);
      }
    `);
    assert.equal(msgs.length, 1);
  });

  it("flags `toast.error(msg, duration, undefined)` (explicit undefined action)", () => {
    const msgs = lint(`
      function submit() {
        toast.error("Не вдалося синхронізувати", 5000, undefined);
      }
    `);
    assert.equal(msgs.length, 1);
  });

  it("does NOT flag `toast.error(msg, duration, { label, onClick })`", () => {
    const msgs = lint(`
      function submit() {
        toast.error("Не вдалося синхронізувати", 5000, {
          label: "Спробувати ще",
          onClick: () => retry(),
        });
      }
    `);
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag `toast.error(msg, duration, actionVar)` (identifier — assumed truthy)", () => {
    const msgs = lint(`
      function submit() {
        const retryAction = { label: "Спробувати ще", onClick: () => retry() };
        toast.error("Не вдалося", 5000, retryAction);
      }
    `);
    assert.equal(msgs.length, 0);
  });

  it("flags `toast.show(msg, 'error')` without action", () => {
    const msgs = lint(`
      function submit() {
        toast.show("Не вдалося", "error");
      }
    `);
    assert.equal(msgs.length, 1);
  });

  it("flags `toast.show(msg, 'error', 5000)` without action", () => {
    const msgs = lint(`
      function submit() {
        toast.show("Не вдалося", "error", 5000);
      }
    `);
    assert.equal(msgs.length, 1);
  });

  it("does NOT flag `toast.show(msg, 'error', 5000, { label, onClick })`", () => {
    const msgs = lint(`
      function submit() {
        toast.show("Не вдалося", "error", 5000, {
          label: "Спробувати ще",
          onClick: () => retry(),
        });
      }
    `);
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag `toast.show(msg, 'success')` (only error tone is gated)", () => {
    const msgs = lint(`
      function submit() {
        toast.show("Збережено", "success");
      }
    `);
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag `toast.success(msg)` / `toast.warning(msg)` / `toast.info(msg)`", () => {
    const msgs = lint(`
      function submit() {
        toast.success("Збережено");
        toast.warning("Слабкий зв'язок");
        toast.info("Версія 2.4 доступна");
      }
    `);
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag unrelated `.error()` methods (logger.error, sentry.error)", () => {
    const msgs = lint(`
      function submit() {
        logger.error("server-side log");
        Sentry.error("breadcrumb");
        console.error("dev log");
      }
    `);
    assert.equal(msgs.length, 0);
  });

  it("does NOT flag calls in allowlisted files", () => {
    const msgs = lint(
      `
      function submit() {
        toast.error("Не вдалося");
      }
    `,
      abs("apps/web/src/core/settings/PWASection.tsx"),
      { allowlist: ["apps/web/src/core/settings/PWASection.tsx"] },
    );
    assert.equal(msgs.length, 0);
  });

  it("flags calls outside the allowlist even when other files ARE allowlisted", () => {
    const msgs = lint(
      `
      function submit() {
        toast.error("Не вдалося");
      }
    `,
      abs("apps/web/src/modules/finyk/Foo.tsx"),
      { allowlist: ["apps/web/src/core/settings/PWASection.tsx"] },
    );
    assert.equal(msgs.length, 1);
  });

  it("supports prefix-style allowlist entries", () => {
    const msgs = lint(
      `
      function submit() {
        toast.error("Не вдалося");
      }
    `,
      abs("apps/web/src/core/profile/Nested/Deep.tsx"),
      { allowlist: ["apps/web/src/core/profile/"] },
    );
    assert.equal(msgs.length, 0);
  });

  it("handles `toast.error(msg, duration, ({ label, onClick }))` (parenthesized expr)", () => {
    // Acorn / ESLint parser normalizes `({...})` to just the ObjectExpression.
    const msgs = lint(`
      function submit() {
        toast.error("Не вдалося", 5000, ({
          label: "Retry",
          onClick: () => retry(),
        }));
      }
    `);
    assert.equal(msgs.length, 0);
  });
});
