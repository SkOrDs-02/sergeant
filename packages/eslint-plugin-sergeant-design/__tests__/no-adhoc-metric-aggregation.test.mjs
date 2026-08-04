/**
 * Unit tests for the `sergeant-design/no-adhoc-metric-aggregation` rule.
 *
 * The rule backs stage 5 of the metric registry
 * (`docs/02-engineering/architecture/metric-registry.md`): a domain metric
 * must be computed by a canonical function from `@sergeant/*-domain`, not
 * re-derived inline. It targets exactly one shape — an accumulated
 * `Math.abs(<tx>.amount / 100)`, i.e. a hand-rolled copy of
 * `getTxStatAmount` that silently drops splits.
 *
 * The narrowness is the point: a rule that fired on every `.reduce` with
 * arithmetic in it would need dozens of suppressions and would stop
 * gating anything. The valid cases below are the real code shapes that
 * must stay legal.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import plugin from "../index.js";

const linter = new Linter();
const RULE_ID = "sergeant-design/no-adhoc-metric-aggregation";

function lint(code, filename = "apps/web/src/core/lib/spendSummary.js") {
  return linter
    .verify(
      code,
      {
        plugins: { "sergeant-design": plugin },
        rules: { [RULE_ID]: "error" },
        languageOptions: { ecmaVersion: "latest", sourceType: "module" },
      },
      { filename },
    )
    .filter((m) => m.ruleId === RULE_ID);
}

// ─── Valid: canonical functions and non-metric arithmetic ───────────────

describe("no-adhoc-metric-aggregation — valid", () => {
  it("allows accumulating via the canonical getTxStatAmount", () => {
    const messages = lint(`
      import { getTxStatAmount } from "@sergeant/finyk-domain/lib/transactions";
      const total = txs.reduce((s, t) => s + getTxStatAmount(t, splits), 0);
    `);
    assert.equal(messages.length, 0);
  });

  it("allows the canonical period aggregate", () => {
    const messages = lint(`
      import { calcFinykPeriodAggregate } from "@sergeant/finyk-domain/lib/spending";
      const week = calcFinykPeriodAggregate(universe, from, to);
    `);
    assert.equal(messages.length, 0);
  });

  it("allows formatting a single transaction for display", () => {
    const messages = lint(`
      const totalAmount = Math.abs(transaction.amount / 100);
      const label = totalAmount + " грн";
    `);
    assert.equal(messages.length, 0);
  });

  it("allows an absolute amount used as a filter bound", () => {
    const messages = lint(`
      for (const t of rows) {
        const abs = Math.abs(t.amount / 100);
        if (abs > maxAbs) maxAbs = abs;
      }
    `);
    assert.equal(messages.length, 0);
  });

  it("allows summing income (positive amounts, no Math.abs)", () => {
    const messages = lint(`
      const totalIncome = income.reduce((s, t) => s + t.amount / 100, 0);
    `);
    assert.equal(messages.length, 0);
  });

  it("allows unrelated /100 arithmetic", () => {
    const messages = lint(`
      let pctSum = 0;
      for (const p of parts) pctSum += Math.abs(p.percent / 100);
      const perGram = grams / 100;
    `);
    assert.equal(messages.length, 0);
  });

  it("exempts the domain packages where the canon lives", () => {
    const messages = lint(
      `
      export function getTxStatAmount(tx, txSplits) {
        let sum = 0;
        sum += Math.abs(tx.amount / 100);
        return sum;
      }
    `,
      "packages/finyk-domain/src/lib/transactions.js",
    );
    assert.equal(messages.length, 0);
  });
});

// ─── Invalid: ad-hoc spending aggregation ──────────────────────────────

describe("no-adhoc-metric-aggregation — invalid", () => {
  it("flags `+=` accumulation in a loop", () => {
    const messages = lint(`
      let spendLastWeek = 0;
      for (const tx of transactions) {
        spendLastWeek += Math.abs(tx.amount / 100);
      }
    `);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
    assert.match(messages[0].message, /канонічну функцію/);
  });

  it("flags a reduce callback that sums inline", () => {
    const messages = lint(`
      const spent = txs
        .filter((t) => t.amount < 0)
        .reduce((s, t) => s + Math.abs(t.amount / 100), 0);
    `);
    assert.equal(messages.length, 1);
  });

  it("flags a conditional branch inside a reduce callback", () => {
    const messages = lint(`
      const spent = txs.reduce((s, t) => {
        return catOf(t) === cat.id ? s + Math.abs(t.amount / 100) : s;
      }, 0);
    `);
    assert.equal(messages.length, 1);
  });

  it("flags a keyed accumulator built with `= (acc[k] || 0) + …`", () => {
    const messages = lint(`
      for (const tx of monthTx) {
        const catId = txCategories[tx.id] || "other";
        categorySpend[catId] = (categorySpend[catId] || 0) + Math.abs(tx.amount / 100);
      }
    `);
    assert.equal(messages.length, 1);
  });

  it("flags the `Math.abs(x.amount) / 100` spelling too", () => {
    const messages = lint(`
      let total = 0;
      for (const tx of txs) total += Math.abs(tx.amount) / 100;
    `);
    assert.equal(messages.length, 1);
  });
});
