import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import {
  pickAnthropicPricing,
  estimateAnthropicCostUsd,
  ANTHROPIC_PRICING_USD_PER_MTOK,
} from "./aiPricing.js";
import { defaultChatModel } from "../env/chatModels.js";
import { aiRoutingEnvShape } from "../env/aiRoutingEnv.js";
import { tierModel } from "../modules/chat/aiQuotaTierModels.js";

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

  it("фактичний `cost` від шлюзу має пріоритет над таблицею", () => {
    // Таблиця дала б $3 за мільйон input-токенів Sonnet-а; шлюз каже, що
    // реально списано $0.42 — рахуємо саме списане.
    const usd = estimateAnthropicCostUsd("claude-3-5-sonnet", {
      input_tokens: 1_000_000,
      output_tokens: 0,
      cost: 0.42,
    });
    expect(usd).toBe(0.42);
  });

  it("нульовий/битий `cost` не затирає розрахунок за таблицею", () => {
    for (const cost of [0, -1, NaN, null, undefined]) {
      expect(
        estimateAnthropicCostUsd("claude-3-5-sonnet", {
          input_tokens: 1_000_000,
          output_tokens: 0,
          cost,
        }),
      ).toBeCloseTo(3.0, 6);
    }
  });

  it("моделі чату через OpenRouter мають ціну (інакше кост тихо = 0)", () => {
    expect(
      estimateAnthropicCostUsd("openai/gpt-5.1", {
        input_tokens: 1_000_000,
        output_tokens: 1_000_000,
      }),
    ).toBeCloseTo(11.25, 6);
    expect(
      estimateAnthropicCostUsd("google/gemini-2.5-flash-lite", {
        input_tokens: 1_000_000,
        output_tokens: 1_000_000,
      }),
    ).toBeCloseTo(0.5, 6);
  });
});

/**
 * B38 regression — pricing coverage for every model id the running chat/coach
 * paths can actually default to, walked straight from the two source-of-truth
 * modules instead of hand-copied literals. This is the guard that should have
 * existed before `deepseek/deepseek-v4-flash` and `z-ai/glm-5.2` (the real
 * `CHAT_VIA_OPENROUTER=true` chat defaults — see `env/chatModels.ts`) shipped
 * with `est_cost_usd` silently stuck at 0 for the bulk of chat traffic.
 */
describe("pricing coverage — model ids reachable from chatModels.ts / aiRoutingEnv.ts", () => {
  const CHAT_SLOTS = ["firstTurn", "synthesis", "standard", "floor"] as const;

  let savedChatViaOpenRouter: string | undefined;
  let savedOpenRouterApiKey: string | undefined;

  beforeEach(() => {
    savedChatViaOpenRouter = process.env["CHAT_VIA_OPENROUTER"];
    savedOpenRouterApiKey = process.env["OPENROUTER_API_KEY"];
  });

  afterEach(() => {
    if (savedChatViaOpenRouter === undefined) {
      delete process.env["CHAT_VIA_OPENROUTER"];
    } else {
      process.env["CHAT_VIA_OPENROUTER"] = savedChatViaOpenRouter;
    }
    if (savedOpenRouterApiKey === undefined) {
      delete process.env["OPENROUTER_API_KEY"];
    } else {
      process.env["OPENROUTER_API_KEY"] = savedOpenRouterApiKey;
    }
  });

  it.each(CHAT_SLOTS)(
    "chatModels.ts — OpenRouter-gateway default for slot '%s' has pricing",
    (slot) => {
      process.env["CHAT_VIA_OPENROUTER"] = "true";
      process.env["OPENROUTER_API_KEY"] = "test-key";
      const model = defaultChatModel(slot);
      expect(pickAnthropicPricing(model)).not.toBeNull();
    },
  );

  it.each(CHAT_SLOTS)(
    "chatModels.ts — Anthropic-direct default for slot '%s' has pricing",
    (slot) => {
      process.env["CHAT_VIA_OPENROUTER"] = "false";
      delete process.env["OPENROUTER_API_KEY"];
      const model = defaultChatModel(slot);
      expect(pickAnthropicPricing(model)).not.toBeNull();
    },
  );

  // `aiRoutingEnvShape` is the zod shape merged into the top-level `env`
  // object (see `env/env.ts`) — parsing it against `{}` resolves every
  // `OPENROUTER_*_MODEL` field to its real runtime default without
  // hand-copying the string literals (which is exactly how this gap
  // reappeared once already).
  const parsedDefaults = z.object(aiRoutingEnvShape).parse({});
  const modelKeys = Object.keys(aiRoutingEnvShape).filter(
    (key): key is keyof typeof parsedDefaults =>
      key.startsWith("OPENROUTER_") && key.endsWith("_MODEL"),
  );

  it("aiRoutingEnv.ts declares at least one *_MODEL default (sanity check for the walk below)", () => {
    expect(modelKeys.length).toBeGreaterThan(0);
  });

  it.each(modelKeys)("aiRoutingEnv.ts — %s default has pricing", (key) => {
    const model = parsedDefaults[key];
    expect(typeof model).toBe("string");
    if (model === "") {
      // `OPENROUTER_MODEL` is the empty-by-design global override sentinel
      // (empty string = "no override, use per-path default") — nothing to
      // price until a deployment actually sets it.
      return;
    }
    expect(pickAnthropicPricing(model as string)).not.toBeNull();
  });

  /**
   * Прогалина в самому гейті, знайдена 2026-08-26 при переведенні коуча на
   * `gemini-3.5-flash-lite`.
   *
   * Обидва обходи вище дивляться в `chatModels.ts` і в `OPENROUTER_*_MODEL`.
   * Але standard- і floor-моделі КОУЧА живуть у третьому місці —
   * `aiQuotaTierModels.ts::PRO_TIER_MODEL` — і беруться з `AI_PRO_*_COACH_MODEL`,
   * що під цей префікс не підпадає. Тобто гейт проти B38 покривав
   * premium-коуча (він читає `OPENROUTER_COACH_MODEL`) і мовчки НЕ покривав
   * два інші тири — рівно ті, куди новий id і ставили.
   *
   * Ходимо через публічний `tierModel()`, а не через приватну таблицю: так
   * тест бачить те саме, що й ран-тайм, включно з `envStr`-фолбеками.
   */
  const TIERS = ["premium", "standard", "floor"] as const;
  const ENDPOINTS = ["chat", "coach"] as const;
  const TIER_COMBOS = TIERS.flatMap((tier) =>
    ENDPOINTS.map((endpoint) => [tier, endpoint] as const),
  );

  it.each(TIER_COMBOS)(
    "aiQuotaTierModels.ts — default for tier '%s' × endpoint '%s' has pricing",
    (tier, endpoint) => {
      process.env["CHAT_VIA_OPENROUTER"] = "true";
      process.env["OPENROUTER_API_KEY"] = "test-key";
      const model = tierModel(tier, endpoint);
      expect(model).not.toBe("");
      expect(pickAnthropicPricing(model)).not.toBeNull();
    },
  );
});
