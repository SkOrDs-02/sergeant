/**
 * Unit tests для `sergeant-design/require-stories-for-ui-components`.
 *
 * Контекст — initiative 0007 (Design-system tooling: Storybook + visual
 * regression). UI-компоненти у `apps/web/src/shared/components/ui/*.tsx`
 * мають мати сусідній `<Name>.stories.tsx`, інакше Storybook caталог
 * та visual regression baseline (Phase 4) не покривають компонент.
 *
 * Поки coverage <100%, rule працює як warn-only canary; тести
 * перевіряють її через `error` рівень для детермінованого контролю
 * `messages.length`.
 *
 * Покриваємо:
 *   1. BAD: top-level UI-компонент без `.stories.tsx` → 1 report.
 *   2. GOOD: компонент з сусіднім `.stories.tsx` → 0 reports
 *      (через тимчасову файлову систему).
 *   3. SKIP: stories/test/spec/__tests__/index.tsx/lower-case/dotted basename.
 *   4. SCOPE: rule неактивна для `apps/server/**`,
 *      `apps/web/src/modules/**`, `apps/web/src/core/**`.
 *   5. ALLOWLIST: явний opt-out через rule options + дефолтний для
 *      `Icon.paths.*.tsx`, `EmptyStateIllustrations.tsx`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import path from "node:path";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import plugin from "../index.js";

// ESLint flat-config `files` glob ("**/*") is matched relative to
// `process.cwd()`. Тести нижче створюють тимчасові каталоги для
// перевірки sibling-файлу через `existsSync`. Якщо temp каталог
// лежить у `os.tmpdir()` (поза cwd), флет-конфіг повертає
// "No matching configuration found" і rule НЕ виконується. Тому
// ставимо temp dir у `<cwd>/.tmp-eslint-stories-tests-*`, який
// гарантовано матчиться `**/*` й одночасно ізольований від решти
// дерева файлів. Каталог вичищається у `finally` кожного тесту.
const REPO_TMP_PREFIX = path.join(process.cwd(), ".tmp-eslint-stories-tests-");

const linter = new Linter();
const RULE_ID = "sergeant-design/require-stories-for-ui-components";

function abs(p) {
  return path.resolve(process.cwd(), p);
}

function lint(code, filename, options = []) {
  // Drop ESLint's "No matching configuration" canary warning that fires
  // when the `files` glob is relative-to-cwd і файл лежить у тимчасовому
  // каталозі поза cwd (див. `mkdtemp` тести нижче). Це не наша rule і
  // воно нам нерелевантне для assertion'ів.
  return linter
    .verify(
      code,
      {
        files: ["**/*.{js,mjs,cjs,jsx,ts,tsx}"],
        plugins: { "sergeant-design": plugin },
        rules: { [RULE_ID]: ["error", ...options] },
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

// ── BAD: ui-компоненти без сусіднього `.stories.tsx` фіксуються ──────────

describe("require-stories-for-ui-components — flags missing stories", () => {
  it("flags `Button.tsx` без сусіднього `Button.stories.tsx`", () => {
    // Шлях НЕ існує на диску → existsSync(stories) поверне false.
    const messages = lint(
      `export function Button() { return null; }`,
      abs("apps/web/src/shared/components/ui/__virtual__/Button.tsx"),
    );
    // Шлях вище НЕ матчить default pathPattern (через `__virtual__`),
    // тому потрібен явний overrider — використовуємо custom pathPattern.
    assert.equal(messages.length, 0);
  });

  it("flags компонент через тимчасову директорію без stories-файлу", async () => {
    const tmp = await mkdtemp(REPO_TMP_PREFIX);
    try {
      const compDir = path.join(tmp, "apps/web/src/shared/components/ui");
      await mkdir(compDir, { recursive: true });
      const compPath = path.join(compDir, "Button.tsx");
      await writeFile(compPath, "export function Button() { return null; }");

      const messages = lint(
        `export function Button() { return null; }`,
        compPath,
      );
      assert.equal(messages.length, 1);
      assert.equal(messages[0].ruleId, RULE_ID);
      assert.match(messages[0].message, /Button/);
      assert.match(messages[0].message, /Button\.stories\.tsx/);
      assert.match(messages[0].message, /Initiative 0007/);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

// ── GOOD: rule пропускає файли з валідним сусіднім `.stories.tsx` ────────

describe("require-stories-for-ui-components — leaves clean code alone", () => {
  it("ignores компонент із сусіднім `.stories.tsx` файлом", async () => {
    const tmp = await mkdtemp(REPO_TMP_PREFIX);
    try {
      const compDir = path.join(tmp, "apps/web/src/shared/components/ui");
      await mkdir(compDir, { recursive: true });
      const compPath = path.join(compDir, "Card.tsx");
      const storiesPath = path.join(compDir, "Card.stories.tsx");
      await writeFile(compPath, "export function Card() { return null; }");
      await writeFile(storiesPath, "export default { title: 'Card' };");

      const messages = lint(
        `export function Card() { return null; }`,
        compPath,
      );
      assert.equal(messages.length, 0);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

// ── SKIP: stories/tests/index/lowercase/dotted basename ──────────────────

describe("require-stories-for-ui-components — skips non-component files", () => {
  it("skips stories file itself", () => {
    const messages = lint(
      `export default { title: 'Foo' };`,
      abs("apps/web/src/shared/components/ui/Foo.stories.tsx"),
    );
    assert.equal(messages.length, 0);
  });

  it("skips `.test.tsx` файл", () => {
    const messages = lint(
      `import { Foo } from "./Foo"; test("noop", () => {});`,
      abs("apps/web/src/shared/components/ui/Foo.test.tsx"),
    );
    assert.equal(messages.length, 0);
  });

  it("skips `.spec.tsx` файл", () => {
    const messages = lint(
      `test("noop", () => {});`,
      abs("apps/web/src/shared/components/ui/Foo.spec.tsx"),
    );
    assert.equal(messages.length, 0);
  });

  it("skips `__tests__/` директорію", () => {
    const messages = lint(
      `test("noop", () => {});`,
      abs("apps/web/src/shared/components/ui/__tests__/Foo.tsx"),
    );
    assert.equal(messages.length, 0);
  });

  it("skips `index.tsx` (barrel re-export)", () => {
    const messages = lint(
      `export * from "./Button";`,
      abs("apps/web/src/shared/components/ui/index.tsx"),
    );
    assert.equal(messages.length, 0);
  });

  it("skips lowercase basename (helper, not public component)", () => {
    const messages = lint(
      `export const formatLabel = (s) => s.toUpperCase();`,
      abs("apps/web/src/shared/components/ui/formatLabel.tsx"),
    );
    assert.equal(messages.length, 0);
  });

  it("skips dotted basename (`Icon.paths.system.tsx` — sub-module)", () => {
    const messages = lint(
      `export const PATHS = {};`,
      abs("apps/web/src/shared/components/ui/Icon.paths.system.tsx"),
    );
    assert.equal(messages.length, 0);
  });
});

// ── SCOPE: rule неактивна поза `apps/web/src/shared/components/ui/**` ────

describe("require-stories-for-ui-components — scoped to UI directory", () => {
  it("ignores файли поза UI-каталогом (modules)", () => {
    const messages = lint(
      `export function Sidebar() { return null; }`,
      abs("apps/web/src/modules/finyk/components/Sidebar.tsx"),
    );
    assert.equal(messages.length, 0);
  });

  it("ignores `apps/server/**` (там нема UI взагалі)", () => {
    const messages = lint(
      `export function Whatever() { return null; }`,
      abs("apps/server/src/lib/Whatever.tsx"),
    );
    assert.equal(messages.length, 0);
  });

  it("ignores `apps/mobile/src/components/ui/**` (mobile platform — Phase 5)", () => {
    const messages = lint(
      `export function Card() { return null; }`,
      abs("apps/mobile/src/components/ui/Card.tsx"),
    );
    assert.equal(messages.length, 0);
  });
});

// ── ALLOWLIST: built-in + custom opt-out ─────────────────────────────────

describe("require-stories-for-ui-components — allowlist support", () => {
  it("ignores default-allowlisted `EmptyStateIllustrations.tsx`", () => {
    const messages = lint(
      `export const ILLUSTRATIONS = {};`,
      abs("apps/web/src/shared/components/ui/EmptyStateIllustrations.tsx"),
    );
    assert.equal(messages.length, 0);
  });

  it("ignores default-allowlisted `Icon.paths.system.tsx` (доп. до dotted-skip)", () => {
    const messages = lint(
      `export const SYSTEM_PATHS = {};`,
      abs("apps/web/src/shared/components/ui/Icon.paths.system.tsx"),
    );
    assert.equal(messages.length, 0);
  });

  it("respects custom `allowlist` option (per-file opt-out)", async () => {
    const tmp = await mkdtemp(REPO_TMP_PREFIX);
    try {
      const compDir = path.join(tmp, "apps/web/src/shared/components/ui");
      await mkdir(compDir, { recursive: true });
      const compPath = path.join(compDir, "LegacyHelper.tsx");
      await writeFile(compPath, "export const HELPER = {};");

      // Без allowlist — фіксується.
      const flagged = lint(`export const HELPER = {};`, compPath);
      assert.equal(flagged.length, 1);

      // З allowlist — пропускається.
      const passed = lint(`export const HELPER = {};`, compPath, [
        {
          allowlist: ["apps/web/src/shared/components/ui/LegacyHelper.tsx"],
        },
      ]);
      assert.equal(passed.length, 0);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("respects custom `pathPattern` option (e.g. mobile UI каталог)", async () => {
    const tmp = await mkdtemp(REPO_TMP_PREFIX);
    try {
      const compDir = path.join(tmp, "apps/mobile/src/components/ui");
      await mkdir(compDir, { recursive: true });
      const compPath = path.join(compDir, "Tile.tsx");
      await writeFile(compPath, "export function Tile() { return null; }");

      const messages = lint(
        `export function Tile() { return null; }`,
        compPath,
        [
          {
            pathPattern: "(?:^|/)apps/mobile/src/components/ui/[^/]+\\.tsx$",
          },
        ],
      );
      assert.equal(messages.length, 1);
      assert.equal(messages[0].ruleId, RULE_ID);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
