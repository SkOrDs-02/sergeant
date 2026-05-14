import { describe, it, expect } from "vitest";
import { MAX_TREND_DAYS, parseAiCostArgument } from "./aiCostParse.js";

describe("parseAiCostArgument", () => {
  it("порожній arg → ok без trendDays (legacy)", () => {
    expect(parseAiCostArgument("")).toEqual({ ok: true });
    expect(parseAiCostArgument("   ")).toEqual({ ok: true });
  });

  it("'7' → trendDays=7", () => {
    expect(parseAiCostArgument("7")).toEqual({ ok: true, trendDays: 7 });
    expect(parseAiCostArgument(" 7 ")).toEqual({ ok: true, trendDays: 7 });
  });

  it("'30' (boundary) → trendDays=30", () => {
    expect(parseAiCostArgument("30")).toEqual({
      ok: true,
      trendDays: MAX_TREND_DAYS,
    });
  });

  it("'1' (boundary) → trendDays=1", () => {
    expect(parseAiCostArgument("1")).toEqual({ ok: true, trendDays: 1 });
  });

  it("'0' → invalid (мін. 1)", () => {
    const out = parseAiCostArgument("0");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain("1..30");
  });

  it("'31' → invalid (max — 30)", () => {
    const out = parseAiCostArgument("31");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain("1..30");
  });

  it("'abc' → invalid (NaN)", () => {
    const out = parseAiCostArgument("abc");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain("цілим числом");
  });

  it("'7d' → invalid (suffix не приймається)", () => {
    const out = parseAiCostArgument("7d");
    expect(out.ok).toBe(false);
  });

  it("'-3' → invalid (мінус не приймається)", () => {
    const out = parseAiCostArgument("-3");
    expect(out.ok).toBe(false);
  });

  it("'7 foo' → invalid (extra tokens)", () => {
    const out = parseAiCostArgument("7 foo");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain("один аргумент");
  });

  it("'3.5' → invalid (десятковий)", () => {
    const out = parseAiCostArgument("3.5");
    expect(out.ok).toBe(false);
  });
});
