import { describe, expect, it } from "vitest";
import {
  assertPerCallCapAllowed,
  checkPerCallCap,
  DEFAULT_MAX_PER_CALL_USD,
  estimateMaxCallCostUsd,
  parseMaxPerCallUsd,
  PerCallCapExceededError,
} from "./policy.js";

describe("estimateMaxCallCostUsd", () => {
  // Locks the conservative output-only cost estimate.
  // Output price for sonnet-4-6 = $15 / 1M tokens, so:
  //   max_tokens=1000 → $0.015
  //   max_tokens=8000 → $0.12
  // Anything that drifts here means pricing changed and the table
  // in policy.ts needs the same update.
  it.each([
    ["claude-sonnet-4-6", 1000, 0.015],
    ["claude-sonnet-4-6", 4096, 0.06144],
    ["claude-sonnet-4-6", 8000, 0.12],
    ["claude-haiku-4-20250414", 4096, 0.02048],
    ["claude-opus-4-20250514", 4096, 0.3072],
    ["claude-sonnet-4-6", 0, 0],
    ["claude-sonnet-4-6", -1, 0],
    ["claude-sonnet-4-6", Number.NaN, 0],
  ])(
    "estimates max cost for model=%s max_tokens=%d as $%f",
    (model, maxTokens, expected) => {
      expect(estimateMaxCallCostUsd(model, maxTokens)).toBeCloseTo(expected, 6);
    },
  );

  it("fails closed for unknown model ids — uses Opus pricing", () => {
    // Unknown model must NOT silently bypass the cap.
    // Opus pricing = $75/1M output, so max_tokens=1000 → $0.075.
    const cost = estimateMaxCallCostUsd("future-claude-9000", 1000);
    expect(cost).toBeCloseTo(0.075, 6);
  });
});

describe("checkPerCallCap", () => {
  // Default cap = $0.50. Sonnet @ max_tokens=8000 = $0.12 (allow).
  // Sonnet @ max_tokens=40000 = $0.60 (reject).
  // Opus @ max_tokens=8000 = $0.60 (reject — premium pricing).
  it.each<[string, string, number, number, "allow" | "reject"]>([
    ["sonnet within cap", "claude-sonnet-4-6", 4096, 0.5, "allow"],
    ["sonnet at cap edge", "claude-sonnet-4-6", 33333, 0.5, "allow"],
    ["sonnet over cap", "claude-sonnet-4-6", 40000, 0.5, "reject"],
    ["haiku within cap", "claude-haiku-4-20250414", 8000, 0.5, "allow"],
    ["opus within cap", "claude-opus-4-20250514", 4096, 0.5, "allow"],
    ["opus over cap", "claude-opus-4-20250514", 8000, 0.5, "reject"],
    [
      "unknown model treated as opus",
      "future-claude-9000",
      8000,
      0.5,
      "reject",
    ],
    ["zero tokens always allow", "claude-sonnet-4-6", 0, 0.5, "allow"],
  ])("%s", (_name, model, maxTokens, capUsd, expected) => {
    const result = checkPerCallCap(model, maxTokens, capUsd);
    expect(result.kind).toBe(expected);
    expect(result.capUsd).toBe(capUsd);
  });

  it("returns the projected cost on allow + reject", () => {
    const allow = checkPerCallCap("claude-sonnet-4-6", 4096, 0.5);
    expect(allow.projectedUsd).toBeCloseTo(0.06144, 6);

    const reject = checkPerCallCap("claude-sonnet-4-6", 40000, 0.5);
    expect(reject.projectedUsd).toBeCloseTo(0.6, 6);
  });
});

describe("parseMaxPerCallUsd", () => {
  // Fail-closed: a typo'd env var must NOT silently disable the cap.
  it.each<[string, string | undefined, number]>([
    ["unset returns default", undefined, DEFAULT_MAX_PER_CALL_USD],
    ["empty string returns default", "", DEFAULT_MAX_PER_CALL_USD],
    ["zero returns default", "0", DEFAULT_MAX_PER_CALL_USD],
    ["negative returns default", "-1", DEFAULT_MAX_PER_CALL_USD],
    ["NaN-like returns default", "abc", DEFAULT_MAX_PER_CALL_USD],
    ["valid number passes through", "1.25", 1.25],
    ["whitespace tolerated", "  0.25  ", 0.25],
  ])("%s", (_name, input, expected) => {
    expect(parseMaxPerCallUsd(input)).toBe(expected);
  });
});

describe("assertPerCallCapAllowed", () => {
  it("does not throw when within cap", () => {
    expect(() =>
      assertPerCallCapAllowed("claude-sonnet-4-6", 4096, 0.5),
    ).not.toThrow();
  });

  it("throws PerCallCapExceededError with structured payload over cap", () => {
    let caught: unknown = null;
    try {
      assertPerCallCapAllowed("claude-sonnet-4-6", 40000, 0.5);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(PerCallCapExceededError);
    const err = caught as PerCallCapExceededError;
    expect(err.model).toBe("claude-sonnet-4-6");
    expect(err.maxTokens).toBe(40000);
    expect(err.capUsd).toBe(0.5);
    expect(err.projectedUsd).toBeCloseTo(0.6, 6);
    expect(err.message).toContain("OpenClaw per-call USD cap exceeded");
    expect(err.message).toContain("$0.60");
    expect(err.message).toContain("$0.50");
  });
});
