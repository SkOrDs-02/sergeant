/**
 * Unit tests for the `sergeant-design/no-bigint-string` rule.
 *
 * The rule catches the pattern where pg `.rows` are mapped into an
 * object literal without `Number(…)` coercion on columns that look
 * like `bigint` / `int8` (e.g. `id`, `*_id`, `*_at`, `amount`).
 * See AGENTS.md hard rule #1.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import plugin from "../index.js";

const linter = new Linter();
const RULE_ID = "sergeant-design/no-bigint-string";

function lint(code, options) {
  const ruleConfig = options ? ["error", options] : "error";
  return linter.verify(code, {
    plugins: { "sergeant-design": plugin },
    rules: { [RULE_ID]: ruleConfig },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
  });
}

// ── BAD: should flag ────────────────────────────────────────────────────

describe("no-bigint-string – flags missing Number() coercion", () => {
  it("flags `id: r.id` in rows.map arrow (concise body)", () => {
    const messages = lint(`
      const data = result.rows.map((r) => ({
        id: r.id,
        name: r.name,
      }));
    `);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
    assert.ok(messages[0].message.includes("id"));
  });

  it("flags `amount: r.amount` in rows.map", () => {
    const messages = lint(`
      const data = res.rows.map((r) => ({
        id: Number(r.id),
        amount: r.amount,
      }));
    `);
    assert.equal(messages.length, 1);
    assert.ok(messages[0].message.includes("amount"));
  });

  it("flags multiple uncoerced numeric columns", () => {
    const messages = lint(`
      const data = result.rows.map((row) => ({
        id: row.id,
        user_id: row.user_id,
        name: row.name,
        created_at: row.created_at,
      }));
    `);
    assert.equal(messages.length, 3);
  });

  it("flags `*_id` suffix columns by heuristic", () => {
    const messages = lint(`
      const data = result.rows.map((r) => ({
        workspace_id: r.workspace_id,
      }));
    `);
    assert.equal(messages.length, 1);
    assert.ok(messages[0].message.includes("workspace_id"));
  });

  it("flags `*_at` suffix columns by heuristic", () => {
    const messages = lint(`
      const data = result.rows.map((r) => ({
        sent_at: r.sent_at,
      }));
    `);
    assert.equal(messages.length, 1);
    assert.ok(messages[0].message.includes("sent_at"));
  });

  it("flags in block-body arrow with return statement", () => {
    const messages = lint(`
      const data = result.rows.map((r) => {
        return {
          id: r.id,
          name: r.name,
        };
      });
    `);
    assert.equal(messages.length, 1);
    assert.ok(messages[0].message.includes("id"));
  });

  it("flags in function expression callback", () => {
    const messages = lint(`
      const data = result.rows.map(function (r) {
        return {
          id: r.id,
        };
      });
    `);
    assert.equal(messages.length, 1);
  });

  it("flags `balance: r.balance`", () => {
    const messages = lint(`
      const data = result.rows.map((r) => ({
        balance: r.balance,
      }));
    `);
    assert.equal(messages.length, 1);
  });

  it("flags `count: r.count`", () => {
    const messages = lint(`
      const data = result.rows.map((r) => ({
        count: r.count,
      }));
    `);
    assert.equal(messages.length, 1);
  });

  it("flags `version: r.version`", () => {
    const messages = lint(`
      const data = result.rows.map((r) => ({
        version: r.version,
      }));
    `);
    assert.equal(messages.length, 1);
  });
});

// ── GOOD: should NOT flag ───────────────────────────────────────────────

describe("no-bigint-string – allows properly coerced values", () => {
  it("allows Number(r.id)", () => {
    const messages = lint(`
      const data = result.rows.map((r) => ({
        id: Number(r.id),
        amount: Number(r.amount),
      }));
    `);
    assert.equal(messages.length, 0);
  });

  it("allows +r.id (unary plus)", () => {
    const messages = lint(`
      const data = result.rows.map((r) => ({
        id: +r.id,
      }));
    `);
    assert.equal(messages.length, 0);
  });

  it("allows parseInt(r.id)", () => {
    const messages = lint(`
      const data = result.rows.map((r) => ({
        id: parseInt(r.id),
      }));
    `);
    assert.equal(messages.length, 0);
  });

  it("allows parseFloat(r.amount)", () => {
    const messages = lint(`
      const data = result.rows.map((r) => ({
        amount: parseFloat(r.amount),
      }));
    `);
    assert.equal(messages.length, 0);
  });

  it("allows toNumberOrNull(r.balance)", () => {
    const messages = lint(`
      const data = result.rows.map((r) => ({
        balance: toNumberOrNull(r.balance),
      }));
    `);
    assert.equal(messages.length, 0);
  });

  it("allows ternary with Number fallback", () => {
    const messages = lint(`
      const data = result.rows.map((r) => ({
        id: r.id ? Number(r.id) : 0,
      }));
    `);
    assert.equal(messages.length, 0);
  });

  it("allows ternary with null fallback", () => {
    const messages = lint(`
      const data = result.rows.map((r) => ({
        deleted_at: r.deleted_at ? Number(r.deleted_at) : null,
      }));
    `);
    assert.equal(messages.length, 0);
  });

  it("does NOT flag non-numeric column names", () => {
    const messages = lint(`
      const data = result.rows.map((r) => ({
        name: r.name,
        email: r.email,
        description: r.description,
      }));
    `);
    assert.equal(messages.length, 0);
  });

  it("does NOT flag spread elements", () => {
    const messages = lint(`
      const data = result.rows.map((r) => ({
        ...r,
        id: Number(r.id),
      }));
    `);
    assert.equal(messages.length, 0);
  });

  it("does NOT flag array.map that is not .rows.map", () => {
    const messages = lint(`
      const data = items.map((r) => ({
        id: r.id,
      }));
    `);
    assert.equal(messages.length, 0);
  });

  it("does NOT flag destructured callback params", () => {
    const messages = lint(`
      const data = result.rows.map(({ id, name }) => ({
        id: id,
        name: name,
      }));
    `);
    assert.equal(messages.length, 0);
  });

  it("does NOT flag when .rows is not the callee object", () => {
    const messages = lint(`
      const data = getRows().map((r) => ({
        id: r.id,
      }));
    `);
    assert.equal(messages.length, 0);
  });
});

// ── Custom config ───────────────────────────────────────────────────────

describe("no-bigint-string – custom numericColumns config", () => {
  it("uses custom numericColumns list", () => {
    const messages = lint(
      `
      const data = result.rows.map((r) => ({
        id: r.id,
        custom_field: r.custom_field,
      }));
    `,
      { numericColumns: ["custom_field"] },
    );
    // `id` is NOT in the custom list, but matches `*_id` heuristic? No — `id` itself
    // is only in default list. With custom config, only `custom_field` should match.
    // Actually `id` does not end with `_id` so it depends on the custom list.
    // custom list = ["custom_field"], no `id` → `id` should not flag
    assert.equal(messages.length, 1);
    assert.ok(messages[0].message.includes("custom_field"));
  });
});
