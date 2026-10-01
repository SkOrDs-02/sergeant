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
  // AI-CONTEXT: до 2026-08-06 рушій умів лише витрати — фільтр
  // `tx.amount >= 0` стояв просто в циклі групування, тож дохід
  // відкидався за побудовою. Ці тести тримають обидва боки і, головне,
  // дефолт: жоден наявний виклик не мав змінити поведінки.
  describe("flow", () => {
    const salary = (id: string, time: number, amount = 4_500_00) =>
      tx({ id, time, amount, description: "ТОВ РОБОТА зарплата", mcc: 0 });

    const NOW = 1_760_000_000;

    it("ignores income by default", () => {
      const out = detectRecurring(
        [
          salary("s1", NOW - 62 * DAY),
          salary("s2", NOW - 31 * DAY),
          salary("s3", NOW - 1 * DAY),
        ],
        { nowSec: NOW },
      );
      expect(out).toHaveLength(0);
    });

    it("finds a monthly salary with flow: income", () => {
      const out = detectRecurring(
        [
          salary("s1", NOW - 62 * DAY),
          salary("s2", NOW - 31 * DAY),
          salary("s3", NOW - 1 * DAY),
        ],
        { nowSec: NOW, flow: "income" },
      );
      expect(out).toHaveLength(1);
      expect(out[0]?.cadence).toBe("monthly");
      // Сума додатна, як і для витрат: рушій завжди рахує на Math.abs.
      expect(out[0]?.avgAmount).toBe(4500);
      expect(out[0]?.occurrences).toBe(3);
    });

    it("ignores expenses when asked for income", () => {
      const out = detectRecurring(
        [
          tx({ id: "n1", time: NOW - 62 * DAY }),
          tx({ id: "n2", time: NOW - 31 * DAY }),
          tx({ id: "n3", time: NOW - 1 * DAY }),
        ],
        { nowSec: NOW, flow: "income" },
      );
      expect(out).toHaveLength(0);
    });

    it("separates the two sides of a mixed history", () => {
      const mixed = [
        salary("s1", NOW - 62 * DAY),
        salary("s2", NOW - 31 * DAY),
        salary("s3", NOW - 1 * DAY),
        tx({ id: "n1", time: NOW - 60 * DAY }),
        tx({ id: "n2", time: NOW - 30 * DAY }),
        tx({ id: "n3", time: NOW - 2 * DAY }),
      ];
      const expenses = detectRecurring(mixed, { nowSec: NOW });
      const income = detectRecurring(mixed, { nowSec: NOW, flow: "income" });
      expect(expenses.map((c) => c.displayName)).toEqual(["Netflix"]);
      expect(income).toHaveLength(1);
      expect(income[0]?.displayName).toMatch(/робота/i);
    });

    // Нуль не належить жодному боку — інакше службова транзакція на 0
    // потрапляла б і у витрати, і в дохід.
    it("counts a zero amount as neither side", () => {
      const zeros = [
        tx({ id: "z1", time: NOW - 62 * DAY, amount: 0, description: "Тест" }),
        tx({ id: "z2", time: NOW - 31 * DAY, amount: 0, description: "Тест" }),
        tx({ id: "z3", time: NOW - 1 * DAY, amount: 0, description: "Тест" }),
      ];
      expect(detectRecurring(zeros, { nowSec: NOW })).toHaveLength(0);
      expect(
        detectRecurring(zeros, { nowSec: NOW, flow: "income" }),
      ).toHaveLength(0);
    });
  });

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

    // §7.1 спеки аналітики v2: два списання Netflix 199 з інтервалом 30
    // днів уже дають кандидата «щомісяця» з сумою й днем останнього.
    it("two Netflix 199 charges 30 days apart make a monthly candidate", () => {
      const out = detectRecurring(
        [
          tx({ id: "n1", time: baseTwo }),
          tx({ id: "n2", time: baseTwo + 30 * DAY }),
        ],
        { nowSec: now },
      );
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({
        key: "netflix",
        cadence: "monthly",
        avgAmount: 199,
        billingDay: new Date((baseTwo + 30 * DAY) * 1000).getDate(),
      });
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

    it("breaks a confidence+amount tie by more recent lastTxTime", () => {
      const base = baseThree;
      const clean: RecurringTx[] = [
        // Group A: same confidence (2 occ) and amount as B, older lastTxTime
        tx({ id: "a1", time: base, description: "Older Sub", amount: -19900 }),
        tx({
          id: "a2",
          time: base + 30 * DAY,
          description: "Older Sub",
          amount: -19900,
        }),
        // Group B: same confidence/amount, more recent lastTxTime
        tx({
          id: "b1",
          time: base + 5 * DAY,
          description: "Newer Sub",
          amount: -19900,
        }),
        tx({
          id: "b2",
          time: base + 35 * DAY,
          description: "Newer Sub",
          amount: -19900,
        }),
      ];
      const out = detectRecurring(clean, { nowSec: now });
      expect(out).toHaveLength(2);
      expect(out[0]!.key).toBe("newer sub");
      expect(out[1]!.key).toBe("older sub");
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

    // AI-CONTEXT: кандидати зʼявлялись хвилями, бо входом було «усе дзеркало»
    // до відповіді мережі й «лише поточний місяць» після неї. Вікно робить
    // результат функцією даних у вікні, а не того, скільки їх передали.
    describe("lookbackDays (фіксоване вікно історії)", () => {
      const monthly = (from: number, count: number, description = "Netflix") =>
        Array.from({ length: count }, (_, i) =>
          tx({
            id: `${description}-${i}`,
            time: from + i * 30 * DAY,
            description,
          }),
        );

      it("ignores charges older than the 120-day default window", () => {
        // −125, −95, −65, −35, −5: найстаріше випадає за вікно.
        const out = detectRecurring(monthly(now - 125 * DAY, 5), {
          nowSec: now,
        });
        expect(out).toHaveLength(1);
        expect(out[0]!.occurrences).toBe(4);
        expect(out[0]!.sampleTxIds).not.toContain("Netflix-0");
      });

      it("gives the same candidates whatever older history the caller adds", () => {
        const inWindow = monthly(now - 95 * DAY, 4);
        const withOlder = [
          ...monthly(now - 400 * DAY, 8),
          ...inWindow,
          tx({ id: "ancient", time: now - 900 * DAY, description: "Netflix" }),
        ];

        expect(detectRecurring(withOlder, { nowSec: now })).toEqual(
          detectRecurring(inWindow, { nowSec: now }),
        );
      });

      it("does not depend on input order", () => {
        const txs = monthly(now - 95 * DAY, 4);
        expect(detectRecurring([...txs].reverse(), { nowSec: now })).toEqual(
          detectRecurring(txs, { nowSec: now }),
        );
      });

      it("needs two charges inside the window: one month of data cannot make a monthly candidate", () => {
        expect(
          detectRecurring([tx({ id: "only", time: now - 5 * DAY })], {
            nowSec: now,
          }),
        ).toEqual([]);
      });

      it("a custom window widens or narrows the history", () => {
        const txs = monthly(now - 125 * DAY, 5);
        expect(
          detectRecurring(txs, { nowSec: now, lookbackDays: 200 })[0]
            ?.occurrences,
        ).toBe(5);
        expect(
          detectRecurring(txs, { nowSec: now, lookbackDays: 40 })[0]
            ?.occurrences,
        ).toBe(2);
      });

      it("Infinity or a non-positive window turns the window off", () => {
        const txs = monthly(now - 125 * DAY, 5);
        for (const lookbackDays of [Infinity, 0, -1]) {
          expect(
            detectRecurring(txs, { nowSec: now, lookbackDays })[0]?.occurrences,
          ).toBe(5);
        }
      });

      it("yearly charges fall outside the default window", () => {
        const yearly = [
          tx({ id: "y1", time: now - 375 * DAY, description: "Adobe" }),
          tx({ id: "y2", time: now - 10 * DAY, description: "Adobe" }),
        ];
        expect(detectRecurring(yearly, { nowSec: now })).toEqual([]);
        expect(
          detectRecurring(yearly, { nowSec: now, lookbackDays: Infinity })[0]
            ?.cadence,
        ).toBe("yearly");
      });
    });
  });
});
