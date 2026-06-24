// @vitest-environment jsdom
/**
 * Tests for `seedFinyk` — the demo-data seeder that populates the Finyk
 * localStorage surface (tx cache, manual expenses, custom cats, monthly
 * plan, manual-only flag) so the dashboard renders with realistic numbers.
 *
 * Asserts on the persisted blobs via the real `@shared/storage` wrapper
 * (jsdom localStorage), verifying shape + invariants rather than exact
 * fixture values: signed-kopeck amounts, income/expense split, snapshot
 * mirror, and the manual-only gate.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { safeReadLS, safeReadStringLS } from "@shared/lib/storage/storage";
import {
  FINYK_CUSTOM_CATS_KEY,
  FINYK_MANUAL_EXPENSES_KEY,
  FINYK_MANUAL_ONLY_KEY,
  FINYK_MONTHLY_PLAN_KEY,
  FINYK_TX_CACHE_KEY,
  FINYK_TX_CACHE_LAST_GOOD_KEY,
} from "./keys";
import type { ManualExpense, MonoTx } from "./utils";
import { seedFinyk } from "./seedFinyk";

interface TxSnapshot {
  txs: MonoTx[];
  timestamp: number;
}

describe("seedFinyk", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("writes a tx-cache snapshot and a matching last-good mirror", () => {
    seedFinyk();

    const cache = safeReadLS<TxSnapshot>(FINYK_TX_CACHE_KEY);
    const lastGood = safeReadLS<TxSnapshot>(FINYK_TX_CACHE_LAST_GOOD_KEY);

    expect(cache).not.toBeNull();
    expect(Array.isArray(cache?.txs)).toBe(true);
    expect(cache?.txs.length).toBeGreaterThan(0);
    expect(typeof cache?.timestamp).toBe("number");

    // Last-good is seeded as an identical mirror of the primary cache.
    expect(lastGood?.txs.length).toBe(cache?.txs.length);
  });

  it("encodes expense amounts as negative kopecks and income as positive", () => {
    seedFinyk();
    const cache = safeReadLS<TxSnapshot>(FINYK_TX_CACHE_KEY)!;

    const expense = cache.txs.find((t) => t.type === "expense");
    const income = cache.txs.find((t) => t.type === "income");

    expect(expense).toBeDefined();
    expect(income).toBeDefined();
    expect(expense!.amount).toBeLessThan(0);
    expect(income!.amount).toBeGreaterThan(0);

    // 45000 UAH income → +4_500_000 kopecks.
    expect(income!.amount).toBe(45000 * 100);
    // Every seeded tx carries the mono source marker + integer kopecks.
    for (const tx of cache.txs) {
      expect(tx.source).toBe("mono");
      expect(Number.isInteger(tx.amount)).toBe(true);
    }
  });

  it("seeds manual expenses with stable ids and ISO dates", () => {
    seedFinyk();
    const manual = safeReadLS<ManualExpense[]>(FINYK_MANUAL_EXPENSES_KEY)!;

    expect(Array.isArray(manual)).toBe(true);
    expect(manual.length).toBeGreaterThan(0);
    for (const e of manual) {
      expect(typeof e.id).toBe("string");
      expect(e.id.startsWith("demo_fx")).toBe(true);
      expect(typeof e.amount).toBe("number");
      // ISO date string parses cleanly.
      expect(Number.isNaN(Date.parse(e.date))).toBe(false);
    }
  });

  it("seeds an empty custom-category list and a monthly plan", () => {
    seedFinyk();

    expect(safeReadLS(FINYK_CUSTOM_CATS_KEY)).toEqual([]);
    expect(safeReadLS(FINYK_MONTHLY_PLAN_KEY)).toEqual({
      income: 45000,
      expense: 28000,
    });
  });

  it("sets the manual-only gate so Finyk skips the Monobank-login wall", () => {
    seedFinyk();
    expect(safeReadStringLS(FINYK_MANUAL_ONLY_KEY)).toBe("1");
  });
});
