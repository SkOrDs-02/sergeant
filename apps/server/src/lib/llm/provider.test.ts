/** @status Active */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../anthropic.js", () => ({
  anthropicMessages: vi.fn(),
  extractAnthropicText: vi.fn(
    (data: { content?: Array<{ type: string; text?: string }> } | null) =>
      (data?.content ?? [])
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("\n")
        .trim(),
  ),
}));

import { anthropicMessages as anthropicMessagesMock } from "../anthropic.js";
import {
  AnthropicProvider,
  FallbackProvider,
  getLLMProvider,
  invokeLLM,
  OpenRouterProvider,
  StubProvider,
  type LLMGenerateOpts,
  type LLMGenerateResult,
  type LLMProvider,
} from "./provider.js";

type AnthropicMock = ReturnType<typeof vi.fn> & {
  mockResolvedValueOnce: (...args: unknown[]) => void;
  mockRejectedValueOnce: (...args: unknown[]) => void;
  mock: { calls: unknown[][] };
};
const anthropicMessagesM = anthropicMessagesMock as unknown as AnthropicMock;

function baseOpts(override: Partial<LLMGenerateOpts> = {}): LLMGenerateOpts {
  return {
    model: "claude-haiku-4-5-20251001",
    messages: [{ role: "user", content: "Hi" }],
    maxTokens: 100,
    ...override,
  };
}

function okResponse(text: string, usage?: Record<string, number>) {
  return {
    response: { ok: true, status: 200 } as unknown as Response,
    data: {
      content: [{ type: "text", text }],
      ...(usage ? { usage } : {}),
    },
  };
}

function errorResponse(
  status: number,
  message: string,
): {
  response: Response | null;
  data: Record<string, unknown>;
} {
  return {
    response: { ok: false, status } as unknown as Response,
    data: { error: { message } },
  };
}

describe("AnthropicProvider", () => {
  beforeEach(() => {
    anthropicMessagesM.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns ok=false з code=missing_api_key коли apiKey пустий", async () => {
    const provider = new AnthropicProvider("");
    const result = await provider.generate(baseOpts());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("missing_api_key");
      expect(result.error).toMatch(/ANTHROPIC_API_KEY/);
    }
    expect(anthropicMessagesM).not.toHaveBeenCalled();
  });

  it("повертає ok=true з text + usage коли response.ok", async () => {
    anthropicMessagesM.mockResolvedValueOnce(
      okResponse("hello world", {
        input_tokens: 12,
        output_tokens: 34,
        cache_read_input_tokens: 5,
      }),
    );
    const provider = new AnthropicProvider("sk-fake");
    const result = await provider.generate(
      baseOpts({ endpoint: "test", temperature: 0.2, system: "be terse" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toBe("hello world");
      expect(result.usage).toEqual({
        inputTokens: 12,
        outputTokens: 34,
        cacheReadInputTokens: 5,
      });
    }
    expect(anthropicMessagesM).toHaveBeenCalledOnce();
    const [apiKey, payload, callOpts] = anthropicMessagesM.mock.calls[0]!;
    expect(apiKey).toBe("sk-fake");
    expect(payload).toMatchObject({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 100,
      temperature: 0.2,
      system: "be terse",
      messages: [{ role: "user", content: "Hi" }],
    });
    expect(callOpts).toMatchObject({ endpoint: "test" });
  });

  it("повертає ok=false з code=rate_limited на HTTP 429", async () => {
    anthropicMessagesM.mockResolvedValueOnce(
      errorResponse(429, "rate-limited by Anthropic"),
    );
    const provider = new AnthropicProvider("sk-fake");
    const result = await provider.generate(baseOpts());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("rate_limited");
      expect(result.status).toBe(429);
      expect(result.error).toBe("rate-limited by Anthropic");
    }
  });

  it("повертає ok=false з code=anthropic_error на HTTP 500", async () => {
    anthropicMessagesM.mockResolvedValueOnce(
      errorResponse(500, "upstream-down"),
    );
    const provider = new AnthropicProvider("sk-fake");
    const result = await provider.generate(baseOpts());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("anthropic_error");
      expect(result.status).toBe(500);
    }
  });

  it("повертає ok=false якщо anthropicMessages кидає AbortError → code=timeout", async () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    anthropicMessagesM.mockRejectedValueOnce(err);
    const provider = new AnthropicProvider("sk-fake");
    const result = await provider.generate(baseOpts());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("timeout");
    }
  });

  it("повертає ok=false з code=anthropic_throw для генеричної помилки", async () => {
    anthropicMessagesM.mockRejectedValueOnce(new Error("network down"));
    const provider = new AnthropicProvider("sk-fake");
    const result = await provider.generate(baseOpts());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("anthropic_throw");
      expect(result.error).toBe("network down");
    }
  });

  it("прокидає signal/promptVersion/timeoutMs до anthropicMessages", async () => {
    anthropicMessagesM.mockResolvedValueOnce(okResponse("ok"));
    const controller = new AbortController();
    const provider = new AnthropicProvider("sk-fake");
    await provider.generate(
      baseOpts({
        signal: controller.signal,
        promptVersion: "v3",
        timeoutMs: 5000,
      }),
    );
    const [, , callOpts] = anthropicMessagesM.mock.calls[0]!;
    expect(callOpts).toMatchObject({
      signal: controller.signal,
      promptVersion: "v3",
      timeoutMs: 5000,
    });
  });

  it("не падає на response без usage", async () => {
    anthropicMessagesM.mockResolvedValueOnce({
      response: { ok: true, status: 200 } as unknown as Response,
      data: { content: [{ type: "text", text: "no usage" }] },
    });
    const provider = new AnthropicProvider("sk-fake");
    const result = await provider.generate(baseOpts());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toBe("no usage");
      expect(result.usage).toBeUndefined();
    }
  });
});

describe("StubProvider", () => {
  it("повертає дефолтний text та zero-usage без override", async () => {
    const provider = new StubProvider();
    const result = await provider.generate(baseOpts());
    expect(result).toEqual<LLMGenerateResult>({
      ok: true,
      text: '{"ok":true,"stub":true}',
      usage: { inputTokens: 0, outputTokens: 0 },
    });
  });

  it("повертає custom text + usage коли передано в конструктор", async () => {
    const provider = new StubProvider({
      text: '{"class":"chat"}',
      inputTokens: 200,
      outputTokens: 50,
    });
    const result = await provider.generate(baseOpts());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toBe('{"class":"chat"}');
      expect(result.usage).toEqual({ inputTokens: 200, outputTokens: 50 });
    }
  });

  it("name='stub' (для logging / metrics labels)", () => {
    expect(new StubProvider().name).toBe("stub");
  });
});

describe("getLLMProvider factory", () => {
  it("override.provider='stub' → StubProvider навіть якщо env=anthropic", () => {
    const p = getLLMProvider({ provider: "stub" });
    expect(p).toBeInstanceOf(StubProvider);
    expect(p.name).toBe("stub");
  });

  it("override.provider='anthropic' + apiKey → AnthropicProvider", () => {
    const p = getLLMProvider({
      provider: "anthropic",
      anthropicApiKey: "sk-test",
    });
    expect(p).toBeInstanceOf(AnthropicProvider);
    expect(p.name).toBe("anthropic");
  });

  it("override.provider='anthropic' БЕЗ apiKey → fallback на StubProvider", () => {
    const p = getLLMProvider({ provider: "anthropic", anthropicApiKey: "" });
    expect(p).toBeInstanceOf(StubProvider);
    expect(p.name).toBe("stub");
  });

  it("override.provider='openrouter' → fallback на StubProvider (reserved)", () => {
    const p = getLLMProvider({ provider: "openrouter" });
    expect(p).toBeInstanceOf(StubProvider);
    expect(p.name).toBe("stub");
  });

  it("override.stubResponse прокидається у StubProvider", async () => {
    const p = getLLMProvider({
      provider: "stub",
      stubResponse: { text: "custom-stub" },
    });
    const result = await p.generate(baseOpts());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toBe("custom-stub");
    }
  });

  it("без override читає env.LLM_PROVIDER + env.ANTHROPIC_API_KEY", () => {
    // env reads default = "anthropic"; ANTHROPIC_API_KEY = "" у test-env →
    // factory деградує у stub. Це precondition для local-dev/test без ключа.
    const p = getLLMProvider();
    // Test runs without real ANTHROPIC_API_KEY → factory повертає stub.
    expect(p.name).toBe("stub");
  });
});

describe("invokeLLM observability wrapper (PR-24)", () => {
  function fakeProvider(
    name: "anthropic" | "stub" | "openrouter",
    result: LLMGenerateResult,
  ): LLMProvider {
    return {
      name,
      generate: () => Promise.resolve(result),
    };
  }

  it("emits Sentry breadcrumb з category=llm.provider на ok-path", async () => {
    const breadcrumbs: Array<{
      category: string;
      level: string;
      data: Record<string, unknown>;
    }> = [];

    const result = await invokeLLM(
      fakeProvider("anthropic", { ok: true, text: "hello" }),
      { ...baseOpts({ endpoint: "internal/test" }) },
      { addBreadcrumb: (b) => breadcrumbs.push(b) },
    );

    expect(result.ok).toBe(true);
    expect(breadcrumbs).toHaveLength(1);
    expect(breadcrumbs[0]).toMatchObject({
      category: "llm.provider",
      level: "info",
      data: {
        provider: "anthropic",
        endpoint: "internal/test",
        outcome: "ok",
        model: "claude-haiku-4-5-20251001",
      },
    });
  });

  it("emits Sentry breadcrumb level=warning + code/error на error-path", async () => {
    const breadcrumbs: Array<{
      level: string;
      data: Record<string, unknown>;
    }> = [];

    const result = await invokeLLM(
      fakeProvider("anthropic", {
        ok: false,
        error: "boom",
        code: "anthropic_error",
        status: 502,
      }),
      { ...baseOpts({ endpoint: "internal/test" }) },
      { addBreadcrumb: (b) => breadcrumbs.push(b) },
    );

    expect(result.ok).toBe(false);
    expect(breadcrumbs[0]).toMatchObject({
      level: "warning",
      data: {
        outcome: "error",
        code: "anthropic_error",
        error: "boom",
      },
    });
  });

  it("outcome=missing_api_key коли AnthropicProvider не має ключа", async () => {
    const breadcrumbs: Array<{
      data: Record<string, unknown>;
    }> = [];
    const provider = new AnthropicProvider("");
    await invokeLLM(
      provider,
      { ...baseOpts({ endpoint: "internal/test" }) },
      { addBreadcrumb: (b) => breadcrumbs.push(b) },
    );
    expect(breadcrumbs[0]?.data).toMatchObject({
      outcome: "missing_api_key",
      code: "missing_api_key",
    });
  });

  it("outcome=rate_limited при code=rate_limited", async () => {
    const breadcrumbs: Array<{ data: Record<string, unknown> }> = [];
    await invokeLLM(
      fakeProvider("anthropic", {
        ok: false,
        error: "429",
        code: "rate_limited",
        status: 429,
      }),
      { ...baseOpts({ endpoint: "internal/test" }) },
      { addBreadcrumb: (b) => breadcrumbs.push(b) },
    );
    expect(breadcrumbs[0]?.data).toMatchObject({ outcome: "rate_limited" });
  });

  it("outcome=timeout при code=timeout (AbortError)", async () => {
    const breadcrumbs: Array<{ data: Record<string, unknown> }> = [];
    await invokeLLM(
      fakeProvider("anthropic", {
        ok: false,
        error: "aborted",
        code: "timeout",
      }),
      { ...baseOpts({ endpoint: "internal/test" }) },
      { addBreadcrumb: (b) => breadcrumbs.push(b) },
    );
    expect(breadcrumbs[0]?.data).toMatchObject({ outcome: "timeout" });
  });

  it("endpoint default-иться на 'unknown' коли opts.endpoint не передано", async () => {
    const breadcrumbs: Array<{ data: Record<string, unknown> }> = [];
    await invokeLLM(
      fakeProvider("stub", { ok: true, text: "ok" }),
      baseOpts(),
      { addBreadcrumb: (b) => breadcrumbs.push(b) },
    );
    expect(breadcrumbs[0]?.data).toMatchObject({ endpoint: "unknown" });
  });

  it("повертає той самий result без модифікації (метрики — sidecar)", async () => {
    const fixed: LLMGenerateResult = {
      ok: true,
      text: "hello",
      usage: { inputTokens: 11, outputTokens: 22 },
    };
    const result = await invokeLLM(
      fakeProvider("anthropic", fixed),
      baseOpts(),
      { addBreadcrumb: () => {} },
    );
    expect(result).toEqual(fixed);
  });
});

// ─── OpenRouterProvider model precedence ─────────────────────────────────
// Цей механізм (modelOverride > opts.model) — те, на що спирається per-path
// конфіг: factory передає `OPENROUTER_READONLY_MODEL`/`OPENROUTER_DIGEST_MODEL`
// (з fallback на `OPENROUTER_MODEL`) як modelOverride. Тут фіксуємо контракт
// провайдера через mock-fetch, без потреби в env.
describe("OpenRouterProvider — model precedence", () => {
  const realFetch = global.fetch;
  let lastBody: { model?: string } | null = null;

  beforeEach(() => {
    lastBody = null;
    global.fetch = vi.fn(async (_url: unknown, init: unknown) => {
      const body = (init as { body?: string }).body;
      lastBody = body ? JSON.parse(body) : null;
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "ok" } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  const opts: LLMGenerateOpts = {
    model: "callsite/model",
    messages: [{ role: "user", content: "hi" }],
    maxTokens: 10,
  };

  it("modelOverride (per-path) перекриває model виклику", async () => {
    const p = new OpenRouterProvider("or-key", "readonly/model");
    const r = await p.generate(opts);
    expect(r.ok).toBe(true);
    expect(lastBody?.model).toBe("readonly/model");
  });

  it("порожній modelOverride → forward-иться model самого виклику", async () => {
    const p = new OpenRouterProvider("or-key", "");
    await p.generate(opts);
    expect(lastBody?.model).toBe("callsite/model");
  });

  it("підтримує @preset/<slug> як model (forward as-is)", async () => {
    const p = new OpenRouterProvider("or-key", "@preset/sergeant-digest");
    await p.generate(opts);
    expect(lastBody?.model).toBe("@preset/sergeant-digest");
  });
});

// ─── FallbackProvider ────────────────────────────────────────────────────
describe("FallbackProvider", () => {
  function fakeProvider(
    name: "anthropic" | "openrouter" | "stub",
    result: LLMGenerateResult | (() => Promise<LLMGenerateResult>),
  ): LLMProvider {
    return {
      name,
      generate:
        typeof result === "function" ? result : () => Promise.resolve(result),
    };
  }

  it("primary ok → повертає primary result, fallback НЕ викликається", async () => {
    const fallbackGenerate = vi.fn();
    const provider = new FallbackProvider({
      primary: fakeProvider("openrouter", { ok: true, text: "from-primary" }),
      fallback: fakeProvider(
        "anthropic",
        fallbackGenerate as unknown as LLMGenerateResult,
      ),
    });

    const result = await provider.generate(baseOpts());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).toBe("from-primary");
    expect(fallbackGenerate).not.toHaveBeenCalled();
    expect(provider.name).toBe("openrouter");
  });

  it("primary fail → fallback ok → повертає fallback result", async () => {
    const logs: Array<{ message: string; fields?: Record<string, unknown> }> =
      [];
    const provider = new FallbackProvider({
      primary: fakeProvider("openrouter", {
        ok: false,
        error: "rate limited",
        code: "rate_limited",
        status: 429,
      }),
      fallback: fakeProvider("anthropic", { ok: true, text: "from-fallback" }),
      log: (_level, message, fields) => logs.push({ message, fields }),
    });

    const result = await provider.generate(baseOpts());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).toBe("from-fallback");
    expect(logs.some((l) => l.message === "llm.fallback.triggered")).toBe(true);
    expect(logs.some((l) => l.message === "llm.fallback.result")).toBe(true);
  });

  it("primary fail + fallback fail → повертає primary error", async () => {
    const provider = new FallbackProvider({
      primary: fakeProvider("openrouter", {
        ok: false,
        error: "primary-down",
        code: "openrouter_error",
        status: 502,
      }),
      fallback: fakeProvider("anthropic", {
        ok: false,
        error: "anthropic-down",
        code: "anthropic_error",
        status: 503,
      }),
    });

    const result = await provider.generate(baseOpts());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("primary-down");
      expect(result.code).toBe("openrouter_error");
    }
  });

  it("fallback throw → повертає primary error", async () => {
    const provider = new FallbackProvider({
      primary: fakeProvider("openrouter", {
        ok: false,
        error: "primary-err",
        code: "openrouter_error",
      }),
      fallback: fakeProvider("anthropic", async () => {
        throw new Error("network down");
      }),
    });

    const result = await provider.generate(baseOpts());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("primary-err");
  });

  it("fallback НЕ викликається при ok=true навіть якщо text порожній", async () => {
    const fallbackGenerate = vi.fn();
    const provider = new FallbackProvider({
      primary: fakeProvider("openrouter", { ok: true, text: "" }),
      fallback: fakeProvider(
        "anthropic",
        fallbackGenerate as unknown as LLMGenerateResult,
      ),
    });

    const result = await provider.generate(baseOpts());
    expect(result.ok).toBe(true);
    expect(fallbackGenerate).not.toHaveBeenCalled();
  });
});

// ─── getLLMProvider fallback chain ───────────────────────────────────────
// env об'єкт парситься при import, тому vi.stubEnv не впливає на нього.
// Для тестів fallback chain мокаємо env-модуль через vi.mock.
describe("getLLMProvider — fallback chain", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore process.env to original state.
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
    vi.restoreAllMocks();
  });

  async function importProviderWithEnv(envOverrides: Record<string, string>) {
    // Set env vars before dynamic import so the env module picks them up.
    for (const [k, v] of Object.entries(envOverrides)) {
      process.env[k] = v;
    }
    // Dynamic re-import picks up new process.env. Vitest caches modules,
    // so we use vi.resetModules() to force re-evaluation.
    vi.resetModules();
    const mod = await import("./provider.js");
    return mod;
  }

  it("openrouter + fallback enabled + ANTHROPIC_KEY → FallbackProvider", async () => {
    const { getLLMProvider: freshGet, FallbackProvider: FP } =
      await importProviderWithEnv({
        OPENROUTER_API_KEY: "or-key",
        ANTHROPIC_API_KEY: "ant-key",
        LLM_FALLBACK_ENABLED: "true",
      });
    const p = freshGet({ provider: "openrouter" });
    expect(p).toBeInstanceOf(FP);
  });

  it("openrouter + LLM_FALLBACK_ENABLED=false → plain OpenRouterProvider", async () => {
    const { getLLMProvider: freshGet, OpenRouterProvider: ORP } =
      await importProviderWithEnv({
        OPENROUTER_API_KEY: "or-key",
        ANTHROPIC_API_KEY: "ant-key",
        LLM_FALLBACK_ENABLED: "false",
      });
    const p = freshGet({ provider: "openrouter" });
    expect(p).toBeInstanceOf(ORP);
  });

  it("openrouter + fallback enabled, але БЕЗ ANTHROPIC_KEY → plain OpenRouterProvider", async () => {
    const { getLLMProvider: freshGet, OpenRouterProvider: ORP } =
      await importProviderWithEnv({
        OPENROUTER_API_KEY: "or-key",
        ANTHROPIC_API_KEY: "",
        LLM_FALLBACK_ENABLED: "true",
      });
    const p = freshGet({ provider: "openrouter" });
    expect(p).toBeInstanceOf(ORP);
  });

  it("openrouter + disableFallback=true → plain OpenRouterProvider", async () => {
    const { getLLMProvider: freshGet, OpenRouterProvider: ORP } =
      await importProviderWithEnv({
        OPENROUTER_API_KEY: "or-key",
        ANTHROPIC_API_KEY: "ant-key",
        LLM_FALLBACK_ENABLED: "true",
      });
    const p = freshGet({ provider: "openrouter", disableFallback: true });
    expect(p).toBeInstanceOf(ORP);
  });

  it("anthropic provider ніколи не обгортається у FallbackProvider", async () => {
    const { getLLMProvider: freshGet, AnthropicProvider: AP } =
      await importProviderWithEnv({ LLM_FALLBACK_ENABLED: "true" });
    const p = freshGet({ provider: "anthropic", anthropicApiKey: "key" });
    expect(p).toBeInstanceOf(AP);
  });
});
