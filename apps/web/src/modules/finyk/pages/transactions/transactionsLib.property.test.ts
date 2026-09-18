import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { computeDaySummary, type DaySummaryTx } from "./transactionsLib";

// Transactions with unique ids and integer minor-unit (kopiyka) amounts.
// Amounts kept within a safe integer band so summation stays exact.
const txArb = fc.uniqueArray(
  fc.record({
    id: fc.string({ minLength: 1, maxLength: 8 }),
    amount: fc.integer({ min: -100_000_000, max: 100_000_000 }),
  }),
  { selector: (t) => t.id, maxLength: 40 },
);

const sumAmounts = (items: readonly DaySummaryTx[]): number =>
  items.reduce((acc, t) => acc + t.amount, 0);

describe("computeDaySummary — property invariants", () => {
  it("total equals the plain sum of amounts (no splits, no exclusions)", () => {
    fc.assert(
      fc.property(txArb, (items) => {
        expect(computeDaySummary(items).total).toBe(sumAmounts(items));
      }),
    );
  });

  it("count is always the input length; statCount matches with no exclusions", () => {
    fc.assert(
      fc.property(txArb, (items) => {
        const r = computeDaySummary(items);
        expect(r.count).toBe(items.length);
        expect(r.statCount).toBe(items.length);
      }),
    );
  });

  it("is commutative — reordering transactions never changes the total", () => {
    fc.assert(
      fc.property(txArb, fc.integer(), (items, seed) => {
        // Deterministic shuffle driven by the generated seed.
        const shuffled = [...items].sort(
          (a, b) =>
            ((a.id.charCodeAt(0) ^ seed) & 0xff) -
            ((b.id.charCodeAt(0) ^ seed) & 0xff),
        );
        expect(computeDaySummary(shuffled).total).toBe(
          computeDaySummary(items).total,
        );
      }),
    );
  });

  it("excluding every transaction zeroes the total and statCount", () => {
    fc.assert(
      fc.property(txArb, (items) => {
        const excludedTxIds = new Set(items.map((t) => t.id));
        const r = computeDaySummary(items, { excludedTxIds });
        expect(r.total).toBe(0);
        expect(r.statCount).toBe(0);
        // count still reports the full group size.
        expect(r.count).toBe(items.length);
      }),
    );
  });

  it("is additive — total of a whole equals the sum of its disjoint parts", () => {
    fc.assert(
      fc.property(txArb, (items) => {
        const mid = Math.floor(items.length / 2);
        const left = items.slice(0, mid);
        const right = items.slice(mid);
        expect(computeDaySummary(items).total).toBe(
          computeDaySummary(left).total + computeDaySummary(right).total,
        );
      }),
    );
  });
});
