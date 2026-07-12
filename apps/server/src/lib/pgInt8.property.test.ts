import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { parseInt8 } from "./pgInt8.js";

/**
 * Property tests for the Hard Rule #1 driver-level int8 parser. Postgres
 * returns int8 (BIGINT / SUM / COUNT) as text; parseInt8 coerces to number
 * but must refuse — loudly — any value that Number() cannot represent
 * exactly, rather than silently corrupting a money total.
 */
describe("parseInt8 — property invariants", () => {
  it("round-trips any safe integer through its text form", () => {
    fc.assert(
      fc.property(fc.maxSafeInteger(), (n) => {
        expect(parseInt8(String(n))).toBe(n);
      }),
    );
  });

  it("a non-throwing result is always a safe integer", () => {
    fc.assert(
      fc.property(fc.maxSafeInteger(), (n) => {
        expect(Number.isSafeInteger(parseInt8(String(n)))).toBe(true);
      }),
    );
  });

  it("preserves sign for in-range values", () => {
    fc.assert(
      fc.property(fc.maxSafeInteger(), (n) => {
        expect(Math.sign(parseInt8(String(n)))).toBe(Math.sign(n));
      }),
    );
  });

  it("throws on any int8 outside the safe range instead of truncating", () => {
    // bigints strictly beyond [MIN_SAFE, MAX_SAFE], up to the int8 domain
    // (±2^63). Number() would round these onto (or past) 2^53, which is not
    // a safe integer — the parser must reject, never return.
    const unsafeInt8 = fc.oneof(
      fc.bigInt({
        min: BigInt(Number.MAX_SAFE_INTEGER) + 1n,
        max: 9223372036854775807n,
      }),
      fc.bigInt({
        min: -9223372036854775808n,
        max: BigInt(Number.MIN_SAFE_INTEGER) - 1n,
      }),
    );
    fc.assert(
      fc.property(unsafeInt8, (big) => {
        expect(() => parseInt8(big.toString())).toThrow(/MAX_SAFE_INTEGER/);
      }),
    );
  });
});
