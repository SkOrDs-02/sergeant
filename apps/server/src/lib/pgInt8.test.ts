import { describe, it, expect } from "vitest";
import pg from "pg";
import { parseInt8, installInt8Parser } from "./pgInt8.js";

describe("parseInt8", () => {
  it("coerces an int8 text value to a number", () => {
    expect(parseInt8("42")).toBe(42);
  });

  it("handles negative values (expenses in kopiykas)", () => {
    expect(parseInt8("-123456")).toBe(-123_456);
  });

  it("handles zero", () => {
    expect(parseInt8("0")).toBe(0);
  });

  it("coerces values at the safe-integer boundary", () => {
    expect(parseInt8(String(Number.MAX_SAFE_INTEGER))).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  it("throws on values beyond Number.MAX_SAFE_INTEGER instead of losing precision", () => {
    // MAX_SAFE_INTEGER + 2 — найменше int8-значення, де Number() уже бреше.
    expect(() => parseInt8("9007199254740993")).toThrow(/MAX_SAFE_INTEGER/);
  });
});

describe("installInt8Parser", () => {
  it("registers the parser for the int8 OID on the global pg type registry", () => {
    installInt8Parser();
    const parser = pg.types.getTypeParser(20) as (v: string) => unknown;
    expect(parser("987654321")).toBe(987_654_321);
  });
});
