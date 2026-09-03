// T2 audit finding #9 — unit tests for `computeRetryDelayMs`.
// Verifies that:
//   * `retry-after` (integer seconds) is preferred when the previous
//     response was a 429.
//   * `retry-after` (HTTP-date) is parsed correctly.
//   * `anthropic-ratelimit-*-reset` headers are honoured.
//   * Non-429 previous responses fall back to the jittered base delay.
//   * The chosen delay is clamped to `timeoutMs`.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `anthropic.ts` читає з env лише два поля — прапорець шлюзу і ключ
 * OpenRouter. Мокаємо саме їх, щоб тести перемикали транспорт без реального
 * env-модуля (він валідується один раз при імпорті і не мутується).
 */
const envMock = vi.hoisted(() => ({
  CHAT_VIA_OPENROUTER: false,
  OPENROUTER_API_KEY: "",
}));

vi.mock("../env.js", () => ({ env: envMock }));

const anthropicMocks = vi.hoisted(() => ({
  aiCostEstimateUsd: { inc: vi.fn() },
  aiRequestDurationMs: { observe: vi.fn() },
  aiRequestsTotal: { inc: vi.fn() },
  aiTokensTotal: { inc: vi.fn() },
  anthropicPromptCacheHitTotal: { inc: vi.fn() },
  externalHttpDurationMs: { observe: vi.fn() },
  externalHttpRequestsTotal: { inc: vi.fn() },
  recordUsageToDb: vi.fn(),
  sleep: vi.fn(async () => undefined),
}));

vi.mock("../obs/metrics.js", () => ({
  aiCostEstimateUsd: anthropicMocks.aiCostEstimateUsd,
  aiRequestDurationMs: anthropicMocks.aiRequestDurationMs,
  aiRequestsTotal: anthropicMocks.aiRequestsTotal,
  aiTokensTotal: anthropicMocks.aiTokensTotal,
  anthropicPromptCacheHitTotal: anthropicMocks.anthropicPromptCacheHitTotal,
  externalHttpDurationMs: anthropicMocks.externalHttpDurationMs,
  externalHttpRequestsTotal: anthropicMocks.externalHttpRequestsTotal,
}));

vi.mock("./anthropicUsageStore.js", () => ({
  recordAnthropicUsageToDb: anthropicMocks.recordUsageToDb,
}));

vi.mock("./timing.js", () => ({
  elapsedMs: () => 12,
  sleep: anthropicMocks.sleep,
}));

// Ініціатива 0025: PostHog AI Observability — третій sink поряд із
// Prometheus і ledger. Мокаємо helper цілком: тут перевіряємо, ЩО клієнт у
// нього передає (provider, латентність, статус), а allowlist самих
// властивостей закриває `posthogAi.test.ts`.
const captureAiGenerationMock = vi.hoisted(() =>
  vi.fn((_input: unknown) => true),
);
vi.mock("./posthogAi.js", () => ({
  captureAiGeneration: captureAiGenerationMock,
}));

import {
  anthropicMessages,
  anthropicMessagesStream,
  computeRetryDelayMs,
  extractAnthropicText,
  recordAnthropicUsage,
} from "./anthropic.js";

function mkResponse(headers: Record<string, string>, status = 429): Response {
  return new Response(null, { status, headers });
}

function resetAnthropicMocks(): void {
  envMock.CHAT_VIA_OPENROUTER = false;
  envMock.OPENROUTER_API_KEY = "";
  anthropicMocks.aiCostEstimateUsd.inc.mockClear();
  anthropicMocks.aiRequestDurationMs.observe.mockClear();
  anthropicMocks.aiRequestsTotal.inc.mockClear();
  anthropicMocks.aiTokensTotal.inc.mockClear();
  anthropicMocks.anthropicPromptCacheHitTotal.inc.mockClear();
  anthropicMocks.externalHttpDurationMs.observe.mockClear();
  anthropicMocks.externalHttpRequestsTotal.inc.mockClear();
  anthropicMocks.recordUsageToDb.mockClear();
  anthropicMocks.sleep.mockClear();
  captureAiGenerationMock.mockClear();
}

describe("computeRetryDelayMs (T2 audit #9)", () => {
  const NOW = Date.parse("2026-05-13T20:00:00.000Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("prefers `retry-after` seconds over the jittered base when the previous status was 429", () => {
    const previous = mkResponse({ "retry-after": "2" });
    const got = computeRetryDelayMs({
      baseMs: 250,
      timeoutMs: 60_000,
      previousResponse: previous,
    });
    expect(got).toBe(2000);
  });

  it("parses `retry-after` as an HTTP-date", () => {
    const at = new Date(NOW + 5_000).toUTCString();
    const previous = mkResponse({ "retry-after": at });
    const got = computeRetryDelayMs({
      baseMs: 250,
      timeoutMs: 60_000,
      previousResponse: previous,
    });
    // Within a 1s window — HTTP-date precision is seconds, not ms.
    expect(got).toBeGreaterThanOrEqual(4_000);
    expect(got).toBeLessThanOrEqual(6_000);
  });

  it("honours `anthropic-ratelimit-tokens-reset` (RFC 3339)", () => {
    const previous = mkResponse({
      "anthropic-ratelimit-tokens-reset": new Date(NOW + 3_500).toISOString(),
    });
    const got = computeRetryDelayMs({
      baseMs: 250,
      timeoutMs: 60_000,
      previousResponse: previous,
    });
    expect(got).toBe(3_500);
  });

  it("picks the earliest of multiple `anthropic-ratelimit-*-reset` headers", () => {
    const previous = mkResponse({
      "anthropic-ratelimit-tokens-reset": new Date(NOW + 8_000).toISOString(),
      "anthropic-ratelimit-requests-reset": new Date(NOW + 4_000).toISOString(),
    });
    const got = computeRetryDelayMs({
      baseMs: 250,
      timeoutMs: 60_000,
      previousResponse: previous,
    });
    expect(got).toBe(4_000);
  });

  it("clamps the upstream hint to `timeoutMs`", () => {
    const previous = mkResponse({ "retry-after": "600" }); // 10 minutes
    const got = computeRetryDelayMs({
      baseMs: 250,
      timeoutMs: 20_000,
      previousResponse: previous,
    });
    expect(got).toBe(20_000);
  });

  it("falls back to the jittered base when no useful hint is present", () => {
    const previous = mkResponse({}); // 429 but no headers
    // ±25% jitter around 1000 → [750, 1250]
    const samples = Array.from({ length: 100 }, () =>
      computeRetryDelayMs({
        baseMs: 1000,
        timeoutMs: 60_000,
        previousResponse: previous,
      }),
    );
    for (const s of samples) {
      expect(s).toBeGreaterThanOrEqual(750);
      expect(s).toBeLessThanOrEqual(1250);
    }
    // Verify it actually jitters (not constant).
    const distinct = new Set(samples);
    expect(distinct.size).toBeGreaterThan(5);
  });

  it("does NOT use `retry-after` when the previous response was not a 429", () => {
    const previous = mkResponse({ "retry-after": "60" }, 503);
    const got = computeRetryDelayMs({
      baseMs: 100,
      timeoutMs: 60_000,
      previousResponse: previous,
    });
    // Should be near baseMs (100ms ±25%), NOT 60_000.
    expect(got).toBeLessThanOrEqual(125);
    expect(got).toBeGreaterThanOrEqual(75);
  });

  it("returns the base delay when `previousResponse` is null (first attempt path)", () => {
    const got = computeRetryDelayMs({
      baseMs: 0,
      timeoutMs: 60_000,
      previousResponse: null,
    });
    expect(got).toBe(0);
  });
});

describe("anthropicMessages", () => {
  beforeEach(() => {
    resetAnthropicMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns parsed data, records usage, and sends the expected Anthropic headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          usage: {
            input_tokens: 100,
            output_tokens: 20,
            cache_creation_input_tokens: 5,
            cache_read_input_tokens: 7,
          },
          content: [{ type: "text", text: "hello" }],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await anthropicMessages(
      "sk-test",
      { model: "claude-3-5-sonnet-20241022", messages: [] },
      { endpoint: "chat", promptVersion: "v1" },
    );

    expect(result.response?.ok).toBe(true);
    expect(extractAnthropicText(result.data)).toBe("hello");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0]?.[1] as {
      headers: Record<string, string>;
      body: string;
    };
    expect(request.headers["x-api-key"]).toBe("sk-test");
    expect(request.headers["anthropic-version"]).toBe("2023-06-01");
    expect(JSON.parse(request.body)).toMatchObject({
      model: "claude-3-5-sonnet-20241022",
    });
    expect(anthropicMocks.aiTokensTotal.inc).toHaveBeenCalledWith(
      {
        provider: "anthropic",
        model: "claude-3-5-sonnet-20241022",
        endpoint: "chat",
        kind: "prompt",
      },
      100,
    );
    expect(
      anthropicMocks.anthropicPromptCacheHitTotal.inc,
    ).toHaveBeenCalledWith({ version: "v1", outcome: "hit" });
    expect(anthropicMocks.recordUsageToDb).toHaveBeenCalledOnce();
  });

  it("retries temporary Anthropic responses and then returns the successful response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "busy" } }), {
          status: 529,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ content: [{ type: "text", text: "ok" }] }),
          {
            status: 200,
          },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await anthropicMessages(
      "sk-test",
      { model: "claude-3-5-haiku-20241022" },
      { endpoint: "retry-test" },
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(anthropicMocks.sleep).toHaveBeenCalledOnce();
    expect(extractAnthropicText(result.data)).toBe("ok");
  });

  it("вичерпаний сумарний бюджет не розтягується до мінімального таймауту спроби", async () => {
    // B42, регрес ревʼю CodeRabbit 2026-08-26. Перша версія рахувала
    // `Math.max(MIN_USEFUL_ATTEMPT_MS, Math.min(timeoutMs, залишок))` — і
    // при `maxTotalMs: 1` все одно СТАРТУВАЛА спробу з таймаутом 1000 мс.
    // Тобто стеля, заведена саме щоб обмежити сумарний час, переставала
    // бути стелею. Гілка `break` ловила лише випадок зі сном, а перша
    // спроба має `baseDelay === 0` і проходила крізь неї.
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await anthropicMessages(
      "sk-test",
      { model: "claude-3-5-haiku-20241022" },
      { endpoint: "budget-test", timeoutMs: 20_000, maxTotalMs: 1 },
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.response).toBeNull();
  });

  it("достатній бюджет — спроба відбувається штатно", async () => {
    // Зворотний бік: перевірка залишку не має рубати нормальні виклики.
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ content: [{ type: "text", text: "ok" }] }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await anthropicMessages(
      "sk-test",
      { model: "claude-3-5-haiku-20241022" },
      { endpoint: "budget-test", timeoutMs: 20_000 },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(extractAnthropicText(result.data)).toBe("ok");
  });

  it("routes to OpenRouter with a Bearer token when the flag and the opt-in are both on", async () => {
    envMock.CHAT_VIA_OPENROUTER = true;
    envMock.OPENROUTER_API_KEY = "sk-or-test";
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await anthropicMessages(
      "sk-anthropic",
      { model: "openai/gpt-5.1" },
      { endpoint: "chat", allowOpenRouter: true },
    );

    const [url, request] = fetchMock.mock.calls[0] as [
      string,
      { headers: Record<string, string> },
    ];
    expect(url).toBe("https://openrouter.ai/api/v1/messages");
    expect(request.headers["Authorization"]).toBe("Bearer sk-or-test");
    // `x-api-key` шлюз ігнорує — не світимо туди Anthropic-ключ.
    expect(request.headers["x-api-key"]).toBeUndefined();
  });

  it("keeps non-chat callers on api.anthropic.com even when the flag is on", async () => {
    envMock.CHAT_VIA_OPENROUTER = true;
    envMock.OPENROUTER_API_KEY = "sk-or-test";
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await anthropicMessages(
      "sk-anthropic",
      { model: "claude-sonnet-4-6" },
      { endpoint: "day-plan" },
    );

    const [url, request] = fetchMock.mock.calls[0] as [
      string,
      { headers: Record<string, string> },
    ];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(request.headers["x-api-key"]).toBe("sk-anthropic");
  });

  it("falls back to Anthropic when the gateway key is missing", async () => {
    envMock.CHAT_VIA_OPENROUTER = true;
    envMock.OPENROUTER_API_KEY = "";
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await anthropicMessages(
      "sk-anthropic",
      { model: "claude-sonnet-4-6" },
      { endpoint: "chat", allowOpenRouter: true },
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.anthropic.com/v1/messages",
    );
  });

  it("does not retry an already aborted caller signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      anthropicMessages(
        "sk-test",
        { model: "claude-3-5-sonnet-20241022" },
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(anthropicMocks.externalHttpRequestsTotal.inc).toHaveBeenCalledWith({
      upstream: "anthropic",
      outcome: "timeout",
    });
  });
});

describe("anthropicMessagesStream", () => {
  beforeEach(() => {
    resetAnthropicMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("adds stream=true and records the stream outcome once", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("stream", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await anthropicMessagesStream(
      "sk-test",
      { model: "claude-3-5-sonnet-20241022" },
      { endpoint: "chat-stream" },
    );

    expect(result.response.ok).toBe(true);
    const request = fetchMock.mock.calls[0]?.[1] as { body: string };
    expect(JSON.parse(request.body)).toMatchObject({ stream: true });

    result.recordStreamEnd("ok");
    result.recordStreamEnd("error");
    expect(anthropicMocks.externalHttpRequestsTotal.inc).toHaveBeenCalledTimes(
      1,
    );
    expect(anthropicMocks.externalHttpRequestsTotal.inc).toHaveBeenCalledWith({
      upstream: "anthropic",
      outcome: "ok",
    });
  });

  // Регресія на конкретний клас дефекту: `anthropicMessagesStream` і його
  // `…Inner` — окрема пара від non-stream шляху, і опції перетікають туди
  // через власний destructure. Якщо `allowOpenRouter` там загубиться,
  // typecheck лишиться зеленим, а стрім тихо піде в Anthropic.
  it("routes the stream to OpenRouter when the flag and the opt-in are both on", async () => {
    envMock.CHAT_VIA_OPENROUTER = true;
    envMock.OPENROUTER_API_KEY = "sk-or-test";
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("stream", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await anthropicMessagesStream(
      "sk-anthropic",
      { model: "openai/gpt-5.1" },
      { endpoint: "chat-stream", allowOpenRouter: true },
    );

    const [url, request] = fetchMock.mock.calls[0] as [
      string,
      { headers: Record<string, string> },
    ];
    expect(url).toBe("https://openrouter.ai/api/v1/messages");
    expect(request.headers["Authorization"]).toBe("Bearer sk-or-test");
    expect(request.headers["x-api-key"]).toBeUndefined();
    result.recordStreamEnd("ok");
  });

  it("keeps the stream on api.anthropic.com without the opt-in", async () => {
    envMock.CHAT_VIA_OPENROUTER = true;
    envMock.OPENROUTER_API_KEY = "sk-or-test";
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("stream", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await anthropicMessagesStream(
      "sk-anthropic",
      { model: "claude-sonnet-4-6" },
      { endpoint: "day-plan" },
    );

    const [url, request] = fetchMock.mock.calls[0] as [
      string,
      { headers: Record<string, string> },
    ];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(request.headers["x-api-key"]).toBe("sk-anthropic");
    result.recordStreamEnd("ok");
  });

  it("records rate_limited for non-ok stream responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("nope", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await anthropicMessagesStream(
      "sk-test",
      { model: "claude-3-5-sonnet-20241022" },
      { endpoint: "chat-stream" },
    );

    expect(result.response.status).toBe(429);
    expect(anthropicMocks.externalHttpRequestsTotal.inc).toHaveBeenCalledWith({
      upstream: "anthropic",
      outcome: "rate_limited",
    });
  });

  it("records timeout when fetch aborts", async () => {
    const abortError = new DOMException("aborted", "AbortError");
    const fetchMock = vi.fn().mockRejectedValue(abortError);
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      anthropicMessagesStream(
        "sk-test",
        { model: "claude-3-5-sonnet-20241022" },
        { endpoint: "chat-stream" },
      ),
    ).rejects.toThrow("aborted");

    expect(anthropicMocks.externalHttpRequestsTotal.inc).toHaveBeenCalledWith({
      upstream: "anthropic",
      outcome: "timeout",
    });
  });
});

describe("recordAnthropicUsage / extractAnthropicText", () => {
  beforeEach(() => {
    resetAnthropicMocks();
  });

  it("joins only text blocks and trims whitespace", () => {
    expect(
      extractAnthropicText({
        content: [
          { type: "text", text: " first " },
          { type: "tool_use" },
          { type: "text", text: "second" },
        ],
      }),
    ).toBe("first \nsecond");
  });

  it("records cache miss usage and ignores missing usage", () => {
    expect(() =>
      recordAnthropicUsage(
        "claude-3-5-sonnet-20241022",
        "chat",
        undefined,
        "v1",
      ),
    ).not.toThrow();
    expect(anthropicMocks.aiTokensTotal.inc).not.toHaveBeenCalled();

    recordAnthropicUsage(
      "claude-3-5-sonnet-20241022",
      "chat",
      {
        input_tokens: 10,
        output_tokens: 3,
        cache_read_input_tokens: 0,
      },
      "v1",
    );

    expect(
      anthropicMocks.anthropicPromptCacheHitTotal.inc,
    ).toHaveBeenCalledWith({ version: "v1", outcome: "miss" });
    expect(anthropicMocks.recordUsageToDb).toHaveBeenCalledOnce();
  });

  // Знахідка B1 (`docs/90-work/audits/ai-pipeline-2026-08-05.md`): раніше тут
  // стояв гейт `if (pickAnthropicPricing(model))`, який відсікав саме моделі
  // шлюзу — а вони єдині, хто присилає фактичний `usage.cost`. Наслідок:
  // `ai_cost_estimate_usd_total` під `CHAT_VIA_OPENROUTER=true` не рухався,
  // і `anthropicBudgetGuard` (який читає рівно цей лічильник) не бачив
  // найдорожчої поверхні. Тест фіксує, що вартість доїжджає до лічильника.
  it("records the gateway-reported cost for a model absent from the pricing table", () => {
    recordAnthropicUsage("z-ai/glm-5.2", "chat", {
      input_tokens: 10_000,
      output_tokens: 500,
      cost: 0.42,
    });

    expect(anthropicMocks.aiCostEstimateUsd.inc).toHaveBeenCalledWith(
      { provider: "anthropic", model: "z-ai/glm-5.2", endpoint: "chat" },
      0.42,
    );
  });

  it("still records nothing when the model is unknown AND no cost is reported", () => {
    recordAnthropicUsage("some/unpriced-model", "chat", {
      input_tokens: 10_000,
      output_tokens: 500,
    });

    expect(anthropicMocks.aiCostEstimateUsd.inc).not.toHaveBeenCalled();
  });
});

// Ініціатива 0025 (PostHog AI Observability, Фаза 1): центральний клієнт шле
// `$ai_generation` на КОЖЕН виклик — успішний з токенами й латентністю,
// неуспішний з `isError` і HTTP-статусом. Контент сюди не потрапляє за
// конструкцією helper-а (див. `posthogAi.test.ts`); тут — що саме передаємо.
describe("PostHog $ai_generation (initiative 0025)", () => {
  beforeEach(() => {
    resetAnthropicMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("успішний non-stream виклик → подія з провайдером, токенами, статусом і латентністю", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            usage: {
              input_tokens: 100,
              output_tokens: 20,
              cache_read_input_tokens: 7,
              cache_creation_input_tokens: 5,
            },
            content: [{ type: "text", text: "hello" }],
          }),
          { status: 200 },
        ),
      ),
    );

    await anthropicMessages(
      "sk-test",
      { model: "claude-3-5-sonnet-20241022", messages: [] },
      { endpoint: "chat", promptVersion: "v1", userId: "user_1" },
    );

    expect(captureAiGenerationMock).toHaveBeenCalledTimes(1);
    expect(captureAiGenerationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        model: "claude-3-5-sonnet-20241022",
        provider: "anthropic",
        feature: "chat",
        inputTokens: 100,
        outputTokens: 20,
        cacheReadInputTokens: 7,
        cacheCreationInputTokens: 5,
        httpStatus: 200,
        promptVersion: "v1",
        latencyMs: expect.any(Number),
      }),
    );
    const arg = captureAiGenerationMock.mock.calls[0]?.[0] as unknown as Record<
      string,
      unknown
    >;
    expect(arg["isError"]).toBeUndefined();
    // Промпт/відповідь не передаються навіть у helper.
    expect(arg).not.toHaveProperty("$ai_input");
    expect(arg).not.toHaveProperty("messages");
    expect(arg).not.toHaveProperty("content");
  });

  it("не-ретраєна HTTP-помилка → подія з isError і статусом, без токенів", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "bad" } }), {
          status: 400,
        }),
      ),
    );

    await anthropicMessages(
      "sk-test",
      { model: "claude-3-5-sonnet-20241022", messages: [] },
      { endpoint: "digest" },
    );

    expect(captureAiGenerationMock).toHaveBeenCalledTimes(1);
    expect(captureAiGenerationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "anthropic",
        feature: "digest",
        isError: true,
        httpStatus: 400,
      }),
    );
    const arg = captureAiGenerationMock.mock.calls[0]?.[0] as unknown as Record<
      string,
      unknown
    >;
    expect(arg["inputTokens"]).toBeUndefined();
    expect(anthropicMocks.recordUsageToDb).not.toHaveBeenCalled();
  });

  it("stream: не-ok відповідь → isError-подія; результат несе provider і elapsedMs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 529 })),
    );

    const result = await anthropicMessagesStream(
      "sk-test",
      { model: "claude-3-5-sonnet-20241022" },
      { endpoint: "chat-stream", userId: "user_2" },
    );

    expect(result.provider).toBe("anthropic");
    expect(typeof result.elapsedMs).toBe("function");
    expect(captureAiGenerationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_2",
        feature: "chat-stream",
        isError: true,
        httpStatus: 529,
        latencyMs: 12,
      }),
    );
  });

  it("stream через OpenRouter → provider=openrouter у результаті, без події до usage", async () => {
    envMock.OPENROUTER_API_KEY = "sk-or-test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("data: {}\n\n", { status: 200 })),
    );

    const result = await anthropicMessagesStream(
      "sk-test",
      { model: "z-ai/glm-5.2" },
      { endpoint: "chat", allowOpenRouter: true },
    );

    expect(result.provider).toBe("openrouter");
    // Usage стріму знає лише chat-модуль (SSE `message_start`) — подія
    // успіху народжується там через `recordAnthropicUsage(..., meta)`.
    expect(captureAiGenerationMock).not.toHaveBeenCalled();
    result.recordStreamEnd("ok");
    expect(captureAiGenerationMock).not.toHaveBeenCalled();
  });

  it("recordAnthropicUsage прокидає meta (provider/latency) у подію; без meta — anthropic", () => {
    recordAnthropicUsage(
      "z-ai/glm-5.2",
      "chat",
      { input_tokens: 10, output_tokens: 5, cost: 0.01 },
      "v9",
      "user_3",
      { provider: "openrouter", latencyMs: 777 },
    );
    expect(captureAiGenerationMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        userId: "user_3",
        provider: "openrouter",
        feature: "chat",
        latencyMs: 777,
        costUsd: 0.01,
        promptVersion: "v9",
      }),
    );

    recordAnthropicUsage("claude-3-5-sonnet-20241022", "digest", {
      input_tokens: 10,
      output_tokens: 5,
    });
    expect(captureAiGenerationMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ provider: "anthropic", feature: "digest" }),
    );
  });

  it("fail-open: збій helper-а не ламає виклик і не чіпає ledger", async () => {
    captureAiGenerationMock.mockImplementationOnce(() => {
      throw new Error("posthog down");
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            usage: { input_tokens: 1, output_tokens: 1 },
            content: [{ type: "text", text: "ok" }],
          }),
          { status: 200 },
        ),
      ),
    );

    const result = await anthropicMessages(
      "sk-test",
      { model: "claude-3-5-sonnet-20241022", messages: [] },
      { endpoint: "chat" },
    );

    expect(result.response?.ok).toBe(true);
    expect(extractAnthropicText(result.data)).toBe("ok");
    expect(anthropicMocks.recordUsageToDb).toHaveBeenCalledOnce();
  });
});
