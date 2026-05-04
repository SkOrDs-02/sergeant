/**
 * Unit tests for the `sergeant-design/no-hash-router-in-modules` rule.
 *
 * Контекст — initiative 0006 (frontend routing & code-split) мігрує
 * `apps/web` з самописного hash-router-а на `react-router@7`. Поки
 * міграція in-flight, rule працює у warn-level canary-режимі: підсвічує
 * нові callsite-и hash-router-у у `apps/web/src/modules/**`, але не блокує
 * рефакторинг. Після завершення Phase 2 ця rule переходить у `error`.
 *
 * Тести покривають три pattern-и detection-у:
 *   1. Імпорт з модуля, що містить `useHashRouter` / `useHashRoute` у
 *      шляху (наприклад `./hooks/useHashRouter` або
 *      `@/shared/hooks/useHashRoute`).
 *   2. Named import-specifier `useHashRouter` / `useHashRoute` з будь-якого
 *      модуля (на випадок якщо хук буде ре-експортнутий).
 *   3. Прямий call-expression `useHashRouter(...)` / `useHashRoute(...)`.
 *   4. Assignment `window.location.hash = ...` або `location.hash = ...`.
 *
 * Allow-list: тестові файли (`*.test.{ts,tsx}` / `*.spec.{ts,tsx}` /
 * `__tests__/`) не покриваються — там legacy-shim навмисно мокаємо.
 *
 * Scope: rule працює тільки у `apps/web/src/modules/**`. У `apps/web/src/
 * core/**`, `apps/web/src/shared/**`, `apps/server/**` — rule неактивна.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import path from "node:path";
import plugin from "../index.js";

const linter = new Linter();
const RULE_ID = "sergeant-design/no-hash-router-in-modules";

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

// ── BAD: модулі з hash-router callsite-ами фіксуються ────────────────────

describe("no-hash-router-in-modules — flags hash-router usage in modules", () => {
  it("flags ImportDeclaration with `useHashRouter` у шляху", () => {
    const messages = lint(
      `import { useHashRouter, useHashQueryParam } from "./hooks/useHashRouter";`,
      abs("apps/web/src/modules/finyk/FinykApp.tsx"),
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
    assert.match(messages[0].message, /initiative 0006/);
    assert.match(messages[0].message, /react-router@7/);
  });

  it("flags ImportDeclaration with `useHashRoute` у шляху", () => {
    const messages = lint(
      `import { useHashRoute } from "@/shared/hooks/useHashRoute";`,
      abs("apps/web/src/modules/fizruk/FizrukApp.tsx"),
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });

  it("flags ImportSpecifier `useHashRouter` навіть з нейтральним шляхом", () => {
    const messages = lint(
      `import { useHashRouter } from "@/shared/hooks";`,
      abs("apps/web/src/modules/finyk/FinykApp.tsx"),
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });

  it("flags direct call-expression `useHashRouter()`", () => {
    const messages = lint(
      `function FinykApp() { const [page, navigate] = useHashRouter(); return null; }`,
      abs("apps/web/src/modules/finyk/FinykApp.tsx"),
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });

  it("flags `window.location.hash = …` assignment", () => {
    const messages = lint(
      `function go() { window.location.hash = "#workouts"; }`,
      abs("apps/web/src/modules/fizruk/pages/Dashboard.tsx"),
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });

  it("flags bare `location.hash = …` assignment", () => {
    const messages = lint(
      `function go() { location.hash = "#plan"; }`,
      abs("apps/web/src/modules/fizruk/pages/PlanCalendar.tsx"),
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });

  it("flags template-literal hash assignment", () => {
    const messages = lint(
      "function go(id) { window.location.hash = `#exercise/${id}`; }",
      abs("apps/web/src/modules/fizruk/pages/Exercise.tsx"),
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });

  it("flags multiple callsites in the same file (each separately)", () => {
    const messages = lint(
      `import { useHashRouter } from "./hooks/useHashRouter";
       function go() { window.location.hash = "#x"; location.hash = "#y"; useHashRouter(); }`,
      abs("apps/web/src/modules/finyk/FinykApp.tsx"),
    );
    // 1 import + 1 useHashRouter call + 2 assignments = 4 reports
    assert.equal(messages.length, 4);
    for (const m of messages) {
      assert.equal(m.ruleId, RULE_ID);
    }
  });
});

// ── GOOD: rule не штрафує валідні patterns ───────────────────────────────

describe("no-hash-router-in-modules — leaves clean code alone", () => {
  it("ignores react-router import (валідний replacement)", () => {
    const messages = lint(
      `import { useNavigate, useParams } from "react-router";`,
      abs("apps/web/src/modules/finyk/FinykApp.tsx"),
    );
    assert.equal(messages.length, 0);
  });

  it("ignores reading `window.location.hash` (тільки assignment блокується)", () => {
    const messages = lint(
      `function read() { return window.location.hash; }`,
      abs("apps/web/src/modules/fizruk/pages/Dashboard.tsx"),
    );
    assert.equal(messages.length, 0);
  });

  it("ignores hashchange event subscription (підтримка legacy under hood ок)", () => {
    const messages = lint(
      `function init() { window.addEventListener("hashchange", () => {}); }`,
      abs("apps/web/src/modules/fizruk/pages/Dashboard.tsx"),
    );
    assert.equal(messages.length, 0);
  });

  it("ignores object-property hash that is NOT location.hash", () => {
    const messages = lint(
      `const config = { hash: "abc" }; const link = { hash: "#foo" };`,
      abs("apps/web/src/modules/finyk/FinykApp.tsx"),
    );
    assert.equal(messages.length, 0);
  });

  it("ignores Identifier названий useHashRouter, але БЕЗ call-expression (declaration only)", () => {
    const messages = lint(
      `function describeHashRouter() { return "doc"; }`,
      abs("apps/web/src/modules/finyk/FinykApp.tsx"),
    );
    assert.equal(messages.length, 0);
  });
});

// ── SCOPE: rule неактивна поза `apps/web/src/modules/**` ──────────────────

describe("no-hash-router-in-modules — scoped to apps/web/src/modules/**", () => {
  it("ignores `apps/web/src/shared/**` (там живе сам hook)", () => {
    const messages = lint(
      `export function useHashRoute() { window.location.hash = "#x"; return null; }`,
      abs("apps/web/src/shared/hooks/useHashRoute.ts"),
    );
    assert.equal(messages.length, 0);
  });

  it("ignores `apps/web/src/core/**` (там живе HubNavigation hook)", () => {
    const messages = lint(
      `import { useHashRoute } from "@/shared/hooks/useHashRoute";
       export function useHubNavigation() { return useHashRoute(); }`,
      abs("apps/web/src/core/hooks/useHubNavigation.ts"),
    );
    assert.equal(messages.length, 0);
  });

  it("ignores `apps/server/**` (server.js не має DOM)", () => {
    const messages = lint(
      `function fake() { window.location.hash = "#x"; }`,
      abs("apps/server/src/lib/whatever.ts"),
    );
    assert.equal(messages.length, 0);
  });

  it("ignores tests inside modules (.test.tsx / __tests__/)", () => {
    const messages1 = lint(
      `import { useHashRouter } from "./hooks/useHashRouter";`,
      abs("apps/web/src/modules/finyk/FinykApp.test.tsx"),
    );
    assert.equal(messages1.length, 0);

    const messages2 = lint(
      `function setup() { window.location.hash = "#workouts"; }`,
      abs("apps/web/src/modules/fizruk/__tests__/Dashboard.test.tsx"),
    );
    assert.equal(messages2.length, 0);
  });
});
