// T2 audit finding #9 — unit tests for `computeRetryDelayMs`.
// Verifies that:
//   * `retry-after` (integer seconds) is preferred when the previous
//     response was a 429.
//   * `retry-after` (HTTP-date) is parsed correctly.
//   * `anthropic-ratelimit-*-reset` headers are honoured.
//   * Non-429 previous responses fall back to the jittered base delay.
//   * The chosen delay is clamped to `timeoutMs`.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("../obs/spans.js", () => ({
  aiSpan: async (
    _name: string,
    fn: () => Promise<unknown>,
    _attrs: Record<string, unknown>,
  ) => {
    const result = await fn();
    return Array.isArray(result) && result.length === 2 ? result[0] : result;
  },
}));

vi.mock("./anthropicUsageStore.js", () => ({
  recordAnthropicUsageToDb: anthropicMocks.recordUsageToDb,
}));

vi.mock("./timing.js", () => ({
  elapsedMs: () => 12,
  sleep: anthropicMocks.sleep,
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
  anthropicMocks.aiCostEstimateUsd.inc.mockClear();
  anthropicMocks.aiRequestDurationMs.observe.mockClear();
  anthropicMocks.aiRequestsTotal.inc.mockClear();
  anthropicMocks.aiTokensTotal.inc.mockClear();
  anthropicMocks.anthropicPromptCacheHitTotal.inc.mockClear();
  anthropicMocks.externalHttpDurationMs.observe.mockClear();
  anthropicMocks.externalHttpRequestsTotal.inc.mockClear();
  anthropicMocks.recordUsageToDb.mockClear();
  anthropicMocks.sleep.mockClear();
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
});
