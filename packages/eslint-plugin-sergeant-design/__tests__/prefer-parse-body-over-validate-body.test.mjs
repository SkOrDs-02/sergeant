/**
 * Unit tests for `sergeant-design/prefer-parse-body-over-validate-body`.
 *
 * Backend-perf PR-11 governance rule. Забороняє новий callsite
 * `validateBody` / `validateQuery` у server-handler-ах
 * (`apps/server/**`) після того, як PR-09 + PR-10 мігрували всі
 * існуючі callsite-и на throw-based `parseBody` / `parseQuery`.
 *
 * Rollout: `warn` → `error` через 1 sprint (після підтвердження, що
 * migration повна). Дивись docs/governance/rules/27-prefer-parse-body.md.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import path from "node:path";
import plugin from "../index.js";

const linter = new Linter();
const RULE_ID = "sergeant-design/prefer-parse-body-over-validate-body";

function abs(p) {
  return path.resolve(process.cwd(), p);
}

function lint(code, filename) {
  return linter.verify(
    code,
    {
      // flat-config: `files` must match the `filename` option passed below
      // or ESLint returns "No matching configuration" meta-error.
      files: ["**/*.{js,mjs,cjs,ts,tsx}"],
      plugins: { "sergeant-design": plugin },
      rules: { [RULE_ID]: "warn" },
      languageOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    { filename },
  );
}

// ── BAD: should flag validateBody / validateQuery у server handler-ах ─────

describe("prefer-parse-body-over-validate-body — flags validateBody", () => {
  it("warns on validateBody() у server routes файлі", () => {
    const messages = lint(
      `import { validateBody } from "../../http/validate.js";
       function handler(req, res) {
         const parsed = validateBody(MySchema, req, res);
         if (!parsed.ok) return;
       }`,
      abs("apps/server/src/modules/nutrition/day-plan.ts"),
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
    assert.match(messages[0].message, /parseBody/);
  });

  it("warns on validateQuery() у server routes файлі", () => {
    const messages = lint(
      `import { validateQuery } from "../../http/validate.js";
       function handler(req, res) {
         const parsed = validateQuery(QuerySchema, req, res);
         if (!parsed.ok) return;
       }`,
      abs("apps/server/src/modules/nutrition/food-search.ts"),
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
    assert.match(messages[0].message, /parseQuery/);
  });

  it("warns on validateBody у routes/billing.ts", () => {
    const messages = lint(
      `validateBody(BillingSchema, req, res);`,
      abs("apps/server/src/routes/billing.ts"),
    );
    assert.equal(messages.length, 1);
  });

  it("warns once per callsite (multiple calls → multiple warnings)", () => {
    const messages = lint(
      `validateBody(SchemaA, req, res);
       validateBody(SchemaB, req, res);`,
      abs("apps/server/src/routes/internal/openclaw.ts"),
    );
    assert.equal(messages.length, 2);
  });
});

// ── GOOD: allowed в exempted files / non-server files ─────────────────────

describe("prefer-parse-body-over-validate-body — does NOT flag in allowlisted files", () => {
  it("does NOT flag у самому validate.ts (визначення функції)", () => {
    const messages = lint(
      `export function validateBody(schema, req, res) { /* impl */ }`,
      abs("apps/server/src/http/validate.ts"),
    );
    assert.equal(messages.length, 0);
  });

  it("does NOT flag у validate.test.ts (тест для визначення)", () => {
    const messages = lint(
      `validateBody(MySchema, req, res);`,
      abs("apps/server/src/http/validate.test.ts"),
    );
    assert.equal(messages.length, 0);
  });

  it("does NOT flag у .test.ts файлах (legacy test paths)", () => {
    const messages = lint(
      `validateBody(SchemaA, req, res);`,
      abs("apps/server/src/modules/nutrition/day-plan.test.ts"),
    );
    assert.equal(messages.length, 0);
  });
});

describe("prefer-parse-body-over-validate-body — does NOT flag outside apps/server", () => {
  it("does NOT flag у apps/web (інший workspace)", () => {
    const messages = lint(
      `validateBody(MySchema, req, res);`,
      abs("apps/web/src/modules/finyk/someHandler.ts"),
    );
    assert.equal(messages.length, 0);
  });

  it("does NOT flag у packages/* (lib files)", () => {
    const messages = lint(
      `validateBody(MySchema, req, res);`,
      abs("packages/shared/src/lib/validate.ts"),
    );
    assert.equal(messages.length, 0);
  });
});

// ── GOOD: parseBody / parseQuery calls are always fine ────────────────────

describe("prefer-parse-body-over-validate-body — parseBody / parseQuery not flagged", () => {
  it("does NOT flag parseBody() у server handler", () => {
    const messages = lint(
      `import { parseBody } from "../../http/validate.js";
       const { foo } = parseBody(MySchema, req);`,
      abs("apps/server/src/modules/nutrition/day-plan.ts"),
    );
    assert.equal(messages.length, 0);
  });

  it("does NOT flag parseQuery() у server handler", () => {
    const messages = lint(
      `import { parseQuery } from "../../http/validate.js";
       const { q } = parseQuery(QuerySchema, req);`,
      abs("apps/server/src/modules/nutrition/food-search.ts"),
    );
    assert.equal(messages.length, 0);
  });
});
