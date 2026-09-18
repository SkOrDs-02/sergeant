/**
 * Unit tests for `sergeant-design/no-inline-body-size-limit` rule
 * (stack-pulse PR-07 — Body-size declarative policy).
 *
 * Контракт. ВСЕ inline-mount-и `express.json({ limit })` /
 * `express.raw({ ..., limit })` мусять жити у
 * `apps/server/src/http/bodySizePolicy.ts`. Поза тим файлом rule
 * блокує такі виклики, бо вони обходять декларативну
 * `BODY_SIZE_POLICY`-таблицю і ламають specificity-order при mount-і.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import path from "node:path";
import plugin from "../index.js";

const linter = new Linter();
const RULE_ID = "sergeant-design/no-inline-body-size-limit";

function abs(p) {
  return path.resolve(process.cwd(), p);
}

function lint(code, filename) {
  return linter.verify(
    code,
    {
      files: ["**/*.{js,mjs,cjs,ts,tsx}"],
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

// ── BAD: inline `express.json({ limit })` поза policy-файлом ─────────────

describe("no-inline-body-size-limit — flags inline express.json/raw with `limit`", () => {
  it("flags `express.json({ limit })` у app.ts", () => {
    const messages = lint(
      `import express from "express";
       const app = express();
       app.use("/api/foo", express.json({ limit: "10mb" }));`,
      abs("apps/server/src/app.ts"),
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
    assert.match(messages[0].message, /bodySizePolicy\.ts/);
    assert.match(messages[0].message, /BODY_SIZE_POLICY/);
  });

  it("flags `express.raw({ type, limit })` у домінному router-і", () => {
    const messages = lint(
      `import express from "express";
       const router = express.Router();
       router.use(express.raw({ type: "application/json", limit: "128kb" }));`,
      abs("apps/server/src/routes/billing.ts"),
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });

  it("flags bare `json({ limit })` після destructured-import", () => {
    const messages = lint(
      `import { json } from "express";
       const app = createApp();
       app.use("/api/sync", json({ limit: "6mb" }));`,
      abs("apps/server/src/routes/sync.ts"),
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });

  it("flags декілька викликів у тому самому файлі (each separately)", () => {
    const messages = lint(
      `import express from "express";
       const app = express();
       app.use("/api/a", express.json({ limit: "10mb" }));
       app.use("/api/b", express.raw({ type: "audio/*", limit: "10mb" }));
       app.use(express.json({ limit: "128kb" }));`,
      abs("apps/server/src/app.ts"),
    );
    assert.equal(messages.length, 3);
    for (const m of messages) {
      assert.equal(m.ruleId, RULE_ID);
    }
  });
});

// ── GOOD: rule не штрафує валідні patterns ───────────────────────────────

describe("no-inline-body-size-limit — leaves clean code alone", () => {
  it("ignores `express.json()` без `limit`", () => {
    const messages = lint(
      `import express from "express";
       const app = express();
       app.use(express.json());`,
      abs("apps/server/src/app.ts"),
    );
    assert.equal(messages.length, 0);
  });

  it("ignores `express.json({ strict: false })` без `limit` ключа", () => {
    const messages = lint(
      `import express from "express";
       const app = express();
       app.use(express.json({ strict: false }));`,
      abs("apps/server/src/app.ts"),
    );
    assert.equal(messages.length, 0);
  });

  it("ignores `applyBodySizePolicy(app)` (canonical entrypoint)", () => {
    const messages = lint(
      `import { applyBodySizePolicy } from "./http/bodySizePolicy.js";
       const app = createApp();
       applyBodySizePolicy(app);`,
      abs("apps/server/src/app.ts"),
    );
    assert.equal(messages.length, 0);
  });

  it("ignores сторонні method calls названі json/raw з `limit` поза express", () => {
    // Наша rule навмисно ширше hits будь-яке `.json({ limit })` —
    // у Sergeant-кодбазі немає легітимних callsite-ів з такою формою
    // поза body-парсером, тож false-positive ризик мінімальний. Це
    // тест-документація поведінки: якщо хтось десь напише
    // `someThing.json({ limit: 1 })` — rule зловить, хай і false-pos.
    // Тоді або переіменовуємо callsite, або вузить-ся scope правила.
    const messages = lint(
      `class Fake { json(o) { return o; } }
       const x = new Fake();
       x.json({ limit: 1 });`,
      abs("apps/server/src/app.ts"),
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });
});

// ── ALLOWED: bodySizePolicy.ts і його тест — єдині exempt-и ─────────────

describe("no-inline-body-size-limit — bodySizePolicy.ts is exempt", () => {
  it("ignores самого `bodySizePolicy.ts`", () => {
    const messages = lint(
      `import express from "express";
       export const m = express.json({ limit: "128kb" });`,
      abs("apps/server/src/http/bodySizePolicy.ts"),
    );
    assert.equal(messages.length, 0);
  });

  it("ignores `bodySizePolicy.test.ts`", () => {
    const messages = lint(
      `import express from "express";
       const app = express();
       app.use(express.json({ limit: "1mb" }));`,
      abs("apps/server/src/http/bodySizePolicy.test.ts"),
    );
    assert.equal(messages.length, 0);
  });
});
