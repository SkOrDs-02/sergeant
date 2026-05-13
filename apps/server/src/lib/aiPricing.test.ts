import { describe, it, expect } from "vitest";
import {
  pickAnthropicPricing,
  estimateAnthropicCostUsd,
  ANTHROPIC_PRICING_USD_PER_MTOK,
} from "./aiPricing.js";

/**
 * PR-12 — unit-coverage для pricing-helper-ів. Перевіряємо:
 *  1) Pricing-map покриває вимагані сімейства (Sonnet 3/3.5/3.7/4,
 *     Haiku 3/3.5, Opus 3/4).
 *  2) `pickAnthropicPricing` стійкий до subversion-суфіксів (startsWith).
 *  3) `estimateAnthropicCostUsd` коректно множить токени на per-MTok price
 *     для input/output + cache-write/cache-read.
 *  4) Fail-safe behaviour: `null`/невідома модель/нульові токени → `null`/0.
 */

describe("ANTHROPIC_PRICING_USD_PER_MTOK — coverage", () => {
  it.each([
    ["claude-sonnet-4"],
    ["claude-3-7-sonnet"],
    ["claude-3-5-sonnet"],
    ["claude-3-sonnet"],
    ["claude-3-5-haiku"],
    ["claude-3-haiku"],
    ["claude-opus-4"],
    ["claude-3-opus"],
  ])("ціна заведена для %s", (prefix) => {
    expect(ANTHROPIC_PRICING_USD_PER_MTOK[prefix]).toBeDefined();
    const price = ANTHROPIC_PRICING_USD_PER_MTOK[prefix]!;
    expect(price.input).toBeGreaterThan(0);
    expect(price.output).toBeGreaterThan(0);
    // Anthropic prompt-caching: cacheWrite ≈ 1.25× input, cacheRead ≈ 0.10×
    // input. Anthropic округлює фактичні ціни (Haiku 3 cache write — $0.30, а
    // не строге 0.3125), тому перевіряємо діапазон [0.9×, 1.5×] цільового
    // multiplier-у — щоб зловити явно зламані рядки без false-fail на
    // 5-центовій rounded delta.
    expect(price.cacheWrite).toBeGreaterThanOrEqual(price.input * 0.9);
    expect(price.cacheWrite).toBeLessThanOrEqual(price.input * 1.5);
    expect(price.cacheRead).toBeGreaterThan(0);
    expect(price.cacheRead).toBeLessThanOrEqual(price.input * 0.15);
  });
});

describe("pickAnthropicPricing — prefix matching", () => {
  it("матчить Sonnet 3.5 за повним id (subversion-суфікс)", () => {
    const p = pickAnthropicPricing("claude-3-5-sonnet-20241022");
    expect(p).not.toBeNull();
    expect(p?.input).toBe(3.0);
    expect(p?.output).toBe(15.0);
  });

  it("матчить Haiku 3.5 для `claude-3-5-haiku-latest`", () => {
    const p = pickAnthropicPricing("claude-3-5-haiku-latest");
    expect(p).not.toBeNull();
    expect(p?.input).toBe(0.8);
    expect(p?.output).toBe(4.0);
  });

  it("матчить Opus 4 для `claude-opus-4-20250514`", () => {
    const p = pickAnthropicPricing("claude-opus-4-20250514");
    expect(p).not.toBeNull();
    expect(p?.input).toBe(15.0);
    expect(p?.output).toBe(75.0);
  });

  it("повертає null для невідомого family-prefix", () => {
    expect(pickAnthropicPricing("claude-future-bedrock-99")).toBeNull();
    expect(pickAnthropicPricing("gpt-4")).toBeNull();
  });

  it("повертає null для sentinel `unknown` і пустого рядка", () => {
    expect(pickAnthropicPricing("unknown")).toBeNull();
    expect(pickAnthropicPricing("")).toBeNull();
  });
});

describe("estimateAnthropicCostUsd — pricing math", () => {
  // Sonnet 3.5: input=$3/MTok, output=$15/MTok,
  // cacheWrite=$3.75/MTok, cacheRead=$0.30/MTok.
  it("input-only — 1M токенів Sonnet 3.5 = $3", () => {
    const usd = estimateAnthropicCostUsd("claude-3-5-sonnet-20241022", {
      input_tokens: 1_000_000,
      output_tokens: 0,
    });
    expect(usd).toBeCloseTo(3.0, 6);
  });

  it("output-only — 1M токенів Sonnet 3.5 = $15", () => {
    const usd = estimateAnthropicCostUsd("claude-3-5-sonnet-20241022", {
      input_tokens: 0,
      output_tokens: 1_000_000,
    });
    expect(usd).toBeCloseTo(15.0, 6);
  });

  it("mixed input+output — 100k in + 50k out Sonnet 3.5 = $1.05", () => {
    // 100_000 × $3/MTok = $0.30; 50_000 × $15/MTok = $0.75 → $1.05
    const usd = estimateAnthropicCostUsd("claude-3-5-sonnet-20241022", {
      input_tokens: 100_000,
      output_tokens: 50_000,
    });
    expect(usd).toBeCloseTo(1.05, 6);
  });

  it("включає cache_write/cache_read для Sonnet 3.5", () => {
    // input  10k × $3   /MTok = $0.030
    // output 10k × $15  /MTok = $0.150
    // c_wr   10k × $3.75/MTok = $0.0375
    // c_rd   10k × $0.30/MTok = $0.003
    // total = $0.2205
    const usd = estimateAnthropicCostUsd("claude-3-5-sonnet-20241022", {
      input_tokens: 10_000,
      output_tokens: 10_000,
      cache_creation_input_tokens: 10_000,
      cache_read_input_tokens: 10_000,
    });
    expect(usd).toBeCloseTo(0.2205, 6);
  });

  it("Haiku 3 — 1M in + 1M out = $0.25 + $1.25 = $1.50", () => {
    const usd = estimateAnthropicCostUsd("claude-3-haiku-20240307", {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    });
    expect(usd).toBeCloseTo(1.5, 6);
  });

  it("Opus 4 — 1M in + 1M out = $15 + $75 = $90", () => {
    const usd = estimateAnthropicCostUsd("claude-opus-4", {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    });
    expect(usd).toBeCloseTo(90.0, 6);
  });

  it("повертає null для невідомої моделі (НЕ нуль — щоб caller не плутав)", () => {
    expect(
      estimateAnthropicCostUsd("gpt-4", {
        input_tokens: 1_000_000,
        output_tokens: 1_000_000,
      }),
    ).toBeNull();
  });

  it("повертає null коли usage = null/undefined", () => {
    expect(estimateAnthropicCostUsd("claude-3-5-sonnet", null)).toBeNull();
    expect(estimateAnthropicCostUsd("claude-3-5-sonnet", undefined)).toBeNull();
  });

  it("повертає 0 коли всі токени = 0/negative/NaN/missing", () => {
    expect(
      estimateAnthropicCostUsd("claude-3-5-sonnet", {
        input_tokens: 0,
        output_tokens: 0,
      }),
    ).toBe(0);
    expect(
      estimateAnthropicCostUsd("claude-3-5-sonnet", {
        input_tokens: -5,
        output_tokens: NaN,
      }),
    ).toBe(0);
    expect(estimateAnthropicCostUsd("claude-3-5-sonnet", {})).toBe(0);
  });

  it("округляє fractional input до floor (захист від float-NaN-зривів)", () => {
    // 1_000_000.7 → floor 1_000_000 → $3 (а не зрив на 1_000_001 token-у).
    const usd = estimateAnthropicCostUsd("claude-3-5-sonnet", {
      input_tokens: 1_000_000.7,
      output_tokens: 0,
    });
    expect(usd).toBeCloseTo(3.0, 6);
  });
});
