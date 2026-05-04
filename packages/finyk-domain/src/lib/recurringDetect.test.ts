import { describe, it, expect } from "vitest";
import {
  detectRecurring,
  normalizeMerchantKey,
  type RecurringTx,
} from "./recurringDetect";

const DAY = 86_400;

function tx(
  overrides: Partial<RecurringTx> & { id: string; time: number },
): RecurringTx {
  return {
    amount: -19900, // -199 грн
    description: "Netflix",
    currencyCode: 980,
    mcc: 5815,
    ...overrides,
  };
}

describe("finyk/recurringDetect", () => {
  describe("normalizeMerchantKey", () => {
    it("lowercases, strips digits/punctuation, keeps up to 3 tokens", () => {
      expect(normalizeMerchantKey("Netflix.com *1234")).toBe("netflix com");
      expect(normalizeMerchantKey("GOOGLE *YOUTUBE")).toBe("google youtube");
      expect(normalizeMerchantKey("  АТБ #237  ")).toBe("атб");
      expect(normalizeMerchantKey("")).toBe("");
      expect(normalizeMerchantKey(null)).toBe("");
      // Single-letter tokens (after stripping punctuation from "McDonald's") are filtered.
      expect(normalizeMerchantKey("McDonald's Kyiv 1")).toBe("mcdonald kyiv");
    });
  });

  describe("detectRecurring", () => {
    const now = Math.floor(new Date(2026, 1, 10).getTime() / 1000);
    // Starting point `now - 95 days`: first tx of a 4-month cadence.
    const baseFour = now - 95 * DAY;
    // `now - 65 days`: first tx of a 3-month cadence.
    const baseThree = now - 65 * DAY;
    // `now - 35 days`: first tx of a 2-month cadence.
    const baseTwo = now - 35 * DAY;

    it("returns empty array for empty input", () => {
      expect(detectRecurring([])).toEqual([]);
    });

    it("detects monthly cadence with stable amount (4 occurrences → high)", () => {
      const base = baseFour;
      const txs: RecurringTx[] = [
        tx({ id: "t1", time: base }),
        tx({ id: "t2", time: base + 30 * DAY }),
        tx({ id: "t3", time: base + 60 * DAY }),
        tx({ id: "t4", time: base + 90 * DAY }),
      ];
      const out = detectRecurring(txs, { nowSec: now });
      expect(out).toHaveLength(1);
      const [cand] = out;
      expect(cand!.cadence).toBe("monthly");
      expect(cand!.occurrences).toBe(4);
      expect(cand!.confidence).toBe("high");
      expect(cand!.avgAmount).toBe(199);
      expect(cand!.currency).toBe("UAH");
      expect(cand!.key).toBe("netflix");
      expect(cand!.billingDay).toBeGreaterThanOrEqual(1);
      expect(cand!.billingDay).toBeLessThanOrEqual(31);
      expect(cand!.sampleTxIds[0]).toBe("t4");
    });

    it("flags 3-occurrence group as medium", () => {
      const base = baseThree;
      const txs: RecurringTx[] = [
        tx({ id: "a", time: base, description: "Spotify" }),
        tx({ id: "b", time: base + 30 * DAY, description: "Spotify" }),
        tx({ id: "c", time: base + 60 * DAY, description: "Spotify" }),
      ];
      const out = detectRecurring(txs, { nowSec: now });
      expect(out).toHaveLength(1);
      expect(out[0]!.confidence).toBe("medium");
    });

    it("flags 2-occurrence group as low", () => {
      const base = baseTwo;
      const txs: RecurringTx[] = [
        tx({ id: "a", time: base, description: "Apple.com/bill" }),
        tx({ id: "b", time: base + 30 * DAY, description: "Apple.com/bill" }),
      ];
      const out = detectRecurring(txs, { nowSec: now });
      expect(out).toHaveLength(1);
      expect(out[0]!.confidence).toBe("low");
      expect(out[0]!.cadence).toBe("monthly");
    });

    it("rejects groups with high gap jitter", () => {
      const base = now - 115 * DAY;
      const txs: RecurringTx[] = [
        tx({ id: "a", time: base }),
        tx({ id: "b", time: base + 10 * DAY }),
        tx({ id: "c", time: base + 60 * DAY }),
        tx({ id: "d", time: base + 110 * DAY }),
      ];
      const out = detectRecurring(txs, { nowSec: now });
      expect(out).toHaveLength(0);
    });

    it("rejects groups with high amount variance", () => {
      const base = baseThree;
      const txs: RecurringTx[] = [
        tx({ id: "a", time: base, amount: -10000 }),
        tx({ id: "b", time: base + 30 * DAY, amount: -50000 }),
        tx({ id: "c", time: base + 60 * DAY, amount: -15000 }),
      ];
      const out = detectRecurring(txs, { nowSec: now });
      expect(out).toHaveLength(0);
    });

    it("skips group already covered by existing subscription keyword", () => {
      const base = baseThree;
      const txs: RecurringTx[] = [
        tx({ id: "a", time: base, description: "YouTube Premium" }),
        tx({ id: "b", time: base + 30 * DAY, description: "YouTube Premium" }),
        tx({ id: "c", time: base + 60 * DAY, description: "YouTube Premium" }),
      ];
      const out = detectRecurring(txs, {
        nowSec: now,
        subscriptions: [{ id: "yt", name: "YT", keyword: "youtube" }],
      });
      expect(out).toHaveLength(0);
    });

    it("skips group linked via subscription linkedTxId", () => {
      const base = baseThree;
      const txs: RecurringTx[] = [
        tx({ id: "a", time: base, description: "Some Service" }),
        tx({ id: "b", time: base + 30 * DAY, description: "Some Service" }),
        tx({ id: "c", time: base + 60 * DAY, description: "Some Service" }),
      ];
      const out = detectRecurring(txs, {
        nowSec: now,
        subscriptions: [{ id: "s", name: "S", linkedTxId: "c" }],
      });
      expect(out).toHaveLength(0);
    });

    it("respects dismissedKeys", () => {
      const base = baseThree;
      const txs: RecurringTx[] = [
        tx({ id: "a", time: base, description: "iCloud+" }),
        tx({ id: "b", time: base + 30 * DAY, description: "iCloud+" }),
        tx({ id: "c", time: base + 60 * DAY, description: "iCloud+" }),
      ];
      const out = detectRecurring(txs, {
        nowSec: now,
        dismissedKeys: ["icloud"],
      });
      expect(out).toHaveLength(0);
    });

    it("excludes transactions listed in excludedTxIds", () => {
      // c is excluded → a+b remain, latest tx age ~35 days (OK vs maxAgeDays=45).
      const base = baseThree;
      const txs: RecurringTx[] = [
        tx({ id: "a", time: base, description: "Service X" }),
        tx({ id: "b", time: base + 30 * DAY, description: "Service X" }),
        tx({ id: "c", time: base + 60 * DAY, description: "Service X" }),
      ];
      const out = detectRecurring(txs, {
        nowSec: now,
        excludedTxIds: ["c"],
      });
      // Only 2 left → still low confidence monthly.
      expect(out).toHaveLength(1);
      expect(out[0]!.occurrences).toBe(2);
      expect(out[0]!.sampleTxIds).not.toContain("c");
    });

    it("drops groups whose latest tx is older than maxAgeDays", () => {
      // Latest tx ~6 months ago.
      const base = now - 200 * DAY;
      const txs: RecurringTx[] = [
        tx({ id: "a", time: base, description: "Old Service" }),
        tx({ id: "b", time: base + 30 * DAY, description: "Old Service" }),
        tx({ id: "c", time: base + 60 * DAY, description: "Old Service" }),
      ];
      const out = detectRecurring(txs, { nowSec: now });
      expect(out).toHaveLength(0);
    });

    it("detects weekly cadence", () => {
      const base = now - 20 * DAY;
      const txs: RecurringTx[] = [
        tx({ id: "a", time: base, description: "Coffee sub" }),
        tx({ id: "b", time: base + 7 * DAY, description: "Coffee sub" }),
        tx({ id: "c", time: base + 14 * DAY, description: "Coffee sub" }),
      ];
      const out = detectRecurring(txs, { nowSec: now });
      expect(out).toHaveLength(1);
      expect(out[0]!.cadence).toBe("weekly");
    });

    it("sorts by confidence desc, then amount desc", () => {
      const base = baseFour;
      const clean: RecurringTx[] = [
        // Group A: low confidence (2 occ), large amount
        tx({
          id: "a1",
          time: base + 60 * DAY,
          description: "Big Rare",
          amount: -99900,
        }),
        tx({
          id: "a2",
          time: base + 90 * DAY,
          description: "Big Rare",
          amount: -99900,
        }),
        // Group B: high confidence (4 occ), small amount
        tx({ id: "b1", time: base, description: "Small Often", amount: -9900 }),
        tx({
          id: "b2",
          time: base + 30 * DAY,
          description: "Small Often",
          amount: -9900,
        }),
        tx({
          id: "b3",
          time: base + 60 * DAY,
          description: "Small Often",
          amount: -9900,
        }),
        tx({
          id: "b4",
          time: base + 90 * DAY,
          description: "Small Often",
          amount: -9900,
        }),
      ];
      const out = detectRecurring(clean, { nowSec: now });
      expect(out).toHaveLength(2);
      expect(out[0]!.key).toBe("small often");
      expect(out[0]!.confidence).toBe("high");
      expect(out[1]!.key).toBe("big rare");
      expect(out[1]!.confidence).toBe("low");
    });

    it("returns USD for currencyCode 840", () => {
      const base = baseTwo;
      const txs: RecurringTx[] = [
        tx({
          id: "a",
          time: base,
          description: "OpenAI *ChatGPT",
          currencyCode: 840,
          amount: -2000,
        }),
        tx({
          id: "b",
          time: base + 30 * DAY,
          description: "OpenAI *ChatGPT",
          currencyCode: 840,
          amount: -2000,
        }),
      ];
      const out = detectRecurring(txs, { nowSec: now });
      expect(out).toHaveLength(1);
      expect(out[0]!.currency).toBe("USD");
    });

    it("ignores positive (income) transactions", () => {
      const base = baseThree;
      const txs: RecurringTx[] = [
        tx({ id: "a", time: base, description: "Salary", amount: 100000 }),
        tx({
          id: "b",
          time: base + 30 * DAY,
          description: "Salary",
          amount: 100000,
        }),
        tx({
          id: "c",
          time: base + 60 * DAY,
          description: "Salary",
          amount: 100000,
        }),
      ];
      expect(detectRecurring(txs, { nowSec: now })).toHaveLength(0);
    });
  });
});
