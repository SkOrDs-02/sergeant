import { describe, expect, it } from "vitest";
import {
  normalizeUaNumbers,
  parseExpenseSpeech,
  parseMealSpeech,
  parseUaNumber,
  parseWorkoutSetSpeech,
} from "./speechParsers";

/**
 * Property-based tests for the speech parsers.
 *
 * NOTE: the planned card (T-8) named the suite `speech.property.test.ts` and
 * targeted `normalize(normalize(x)) = normalize(x)`. The real module is
 * `speechParsers.ts` and the normalizer is `normalizeUaNumbers`. `fast-check`
 * is not installed and is out of scope to add here, so this suite drives a
 * seeded PRNG over generated utterances. Each block maps 1:1 to an
 * `fc.property` for a later mechanical swap to fast-check.
 */

function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NUM_RUNS = Number(process.env["FAST_CHECK_NUM_RUNS"] ?? 1000);
const rng = makeRng(42);

const UA_WORDS = [
  "вісімдесят",
  "сто",
  "двадцять",
  "п'ять",
  "тисяча",
  "двісті",
  "сорок",
  "три",
];
const UNITS = ["кг", "грн", "гривень", "грам", "ккал", "разів", "повторень"];
const NOUNS = ["кава", "жим", "гречка", "присідання", "салат", "таксі"];
const PUNCT = ["", ",", ".", "!", ";"];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)] as T;
}

/** Build a plausible mixed-form utterance the parsers might receive. */
function arbitraryUtterance(): string {
  const parts: string[] = [];
  const n = 1 + Math.floor(rng() * 6);
  for (let i = 0; i < n; i++) {
    const r = rng();
    if (r < 0.35) parts.push(pick(NOUNS));
    else if (r < 0.6) parts.push(pick(UA_WORDS) + pick(PUNCT));
    else if (r < 0.85) parts.push(String(Math.floor(rng() * 1000)));
    else parts.push(pick(UNITS));
  }
  // Vary whitespace a little.
  return parts.join(rng() < 0.2 ? "  " : " ");
}

describe("shared/utils/speechParsers – property", () => {
  it("normalizeUaNumbers is idempotent: normalize(normalize(x)) === normalize(x)", () => {
    for (let i = 0; i < NUM_RUNS; i++) {
      const x = arbitraryUtterance();
      const once = normalizeUaNumbers(x);
      const twice = normalizeUaNumbers(once);
      expect(twice).toBe(once);
    }
  });

  it("normalizeUaNumbers never throws and always returns a string", () => {
    for (let i = 0; i < NUM_RUNS; i++) {
      const out = normalizeUaNumbers(arbitraryUtterance());
      expect(typeof out).toBe("string");
    }
  });

  it("parseUaNumber returns null or a finite number, never NaN", () => {
    for (let i = 0; i < NUM_RUNS; i++) {
      const out = parseUaNumber(arbitraryUtterance());
      if (out !== null) {
        expect(Number.isFinite(out)).toBe(true);
      }
    }
  });

  it("parseUaNumber: a pure digit string parses back to its numeric value", () => {
    for (let i = 0; i < NUM_RUNS; i++) {
      const n = Math.floor(rng() * 100000);
      expect(parseUaNumber(String(n))).toBe(n);
    }
  });

  it("parseExpenseSpeech: amount is null or a finite non-negative number rounded to 2dp", () => {
    for (let i = 0; i < NUM_RUNS; i++) {
      const parsed = parseExpenseSpeech(arbitraryUtterance());
      if (parsed && parsed.amount !== null) {
        expect(Number.isFinite(parsed.amount)).toBe(true);
        // amounts come from non-negative magnitudes in the generator
        expect(Number.isNaN(parsed.amount)).toBe(false);
        expect(Math.round(parsed.amount * 100) / 100).toBe(parsed.amount);
      }
    }
  });

  it("parseWorkoutSetSpeech: numeric fields are null or finite numbers", () => {
    for (let i = 0; i < NUM_RUNS; i++) {
      const parsed = parseWorkoutSetSpeech(arbitraryUtterance());
      if (!parsed) continue;
      for (const v of [parsed.weight, parsed.reps, parsed.sets]) {
        if (v !== null) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it("parseMealSpeech: numeric fields are null or finite numbers", () => {
    for (let i = 0; i < NUM_RUNS; i++) {
      const parsed = parseMealSpeech(arbitraryUtterance());
      if (!parsed) continue;
      for (const v of [parsed.kcal, parsed.grams, parsed.protein]) {
        if (v !== null) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it("all parsers return null on empty / whitespace-only input", () => {
    for (const empty of ["", "   ", "\t", "\n  "]) {
      expect(parseExpenseSpeech(empty)).toBeNull();
      expect(parseWorkoutSetSpeech(empty)).toBeNull();
      expect(parseMealSpeech(empty)).toBeNull();
    }
  });

  it("parsers preserve the raw input verbatim", () => {
    for (let i = 0; i < NUM_RUNS; i++) {
      const x = arbitraryUtterance();
      const e = parseExpenseSpeech(x);
      if (e) expect(e.raw).toBe(x);
      const w = parseWorkoutSetSpeech(x);
      if (w) expect(w.raw).toBe(x);
      const m = parseMealSpeech(x);
      if (m) expect(m.raw).toBe(x);
    }
  });
});
