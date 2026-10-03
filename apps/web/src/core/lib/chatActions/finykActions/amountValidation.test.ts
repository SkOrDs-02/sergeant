import { describe, it, expect } from "vitest";
import { validatePositiveAmount } from "./amountValidation";
import { MAX_AMOUNT_HRYVNIA } from "@shared/lib/format/amount";

describe("validatePositiveAmount", () => {
  it("accepts a plain positive number", () => {
    const out = validatePositiveAmount(5000, "limit");
    expect(out).toEqual({ ok: true, value: 5000 });
  });

  it("accepts a positive numeric string (LLM tool calls often send strings)", () => {
    const out = validatePositiveAmount("2500", "amount");
    expect(out).toEqual({ ok: true, value: 2500 });
  });

  it("accepts a value exactly at the domain ceiling", () => {
    const out = validatePositiveAmount(MAX_AMOUNT_HRYVNIA, "limit");
    expect(out).toEqual({ ok: true, value: MAX_AMOUNT_HRYVNIA });
  });

  it("rejects NaN", () => {
    const out = validatePositiveAmount(Number.NaN, "limit");
    expect(out.ok).toBe(false);
    expect((out as { message: string }).message).toContain("додатний limit");
  });

  it("rejects +Infinity", () => {
    const out = validatePositiveAmount(Number.POSITIVE_INFINITY, "amount");
    expect(out.ok).toBe(false);
    expect((out as { message: string }).message).toContain("додатний amount");
  });

  it("rejects a negative value", () => {
    const out = validatePositiveAmount(-100, "amount");
    expect(out.ok).toBe(false);
    expect((out as { message: string }).message).toContain("додатний amount");
  });

  it("rejects zero", () => {
    const out = validatePositiveAmount(0, "amount");
    expect(out.ok).toBe(false);
    expect((out as { message: string }).message).toContain("додатний amount");
  });

  it("rejects a non-numeric string", () => {
    const out = validatePositiveAmount("тисяча гривень", "amount");
    expect(out.ok).toBe(false);
    expect((out as { message: string }).message).toContain("додатний amount");
  });

  it("rejects undefined/missing input", () => {
    const out = validatePositiveAmount(undefined, "amount");
    expect(out.ok).toBe(false);
  });

  it("rejects a value above the domain ceiling, mentioning the field", () => {
    const out = validatePositiveAmount(MAX_AMOUNT_HRYVNIA + 1, "limit");
    expect(out.ok).toBe(false);
    const message = (out as { message: string }).message;
    expect(message).toContain("limit");
    expect(message).toContain("завелика");
  });

  it("rejects an absurdly large value (1e12)", () => {
    const out = validatePositiveAmount(1_000_000_000_000, "target_amount");
    expect(out.ok).toBe(false);
    expect((out as { message: string }).message).toContain("завелика");
  });
});
