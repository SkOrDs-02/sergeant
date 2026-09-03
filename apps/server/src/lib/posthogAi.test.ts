// Ініціатива 0025, Фаза 1 — `$ai_generation` через `posthog-node`.
//
// Фіксує три інваріанти § «Контракт даних»:
//   * тумблер: без `POSTHOG_AI_OBSERVABILITY_KEY` клієнт не створюється і
//     capture — no-op;
//   * allowlist за конструкцією: невідомі ключі (у т.ч. `$ai_input`,
//     `$ai_output_choices`) не потрапляють у властивості події;
//   * fail-open: будь-яка помилка SDK глушиться `logger.warn`.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const envMock = vi.hoisted(() => ({
  POSTHOG_AI_OBSERVABILITY_KEY: "" as string | undefined,
  POSTHOG_HOST: undefined as string | undefined,
}));

vi.mock("../env.js", () => ({ env: envMock }));

const loggerMock = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock("../obs/logger.js", () => ({ logger: loggerMock }));

const posthogMock = vi.hoisted(() => {
  const instances: Array<{
    capture: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    shutdown: ReturnType<typeof vi.fn>;
    flush: ReturnType<typeof vi.fn>;
  }> = [];
  const ctorArgs: Array<[string, Record<string, unknown> | undefined]> = [];
  let throwOnCapture = false;
  let throwOnConstruct = false;
  class PostHog {
    capture = vi.fn(() => {
      if (throwOnCapture) throw new Error("boom");
    });
    on = vi.fn();
    shutdown = vi.fn(async () => undefined);
    flush = vi.fn(async () => undefined);
    constructor(key: string, options?: Record<string, unknown>) {
      if (throwOnConstruct) throw new Error("ctor boom");
      ctorArgs.push([key, options]);
      instances.push(this);
    }
  }
  return {
    PostHog,
    instances,
    ctorArgs,
    setThrowOnCapture: (v: boolean) => {
      throwOnCapture = v;
    },
    setThrowOnConstruct: (v: boolean) => {
      throwOnConstruct = v;
    },
  };
});

vi.mock("posthog-node", () => ({ PostHog: posthogMock.PostHog }));

import {
  AI_GENERATION_EVENT,
  AI_SYSTEM_DISTINCT_ID,
  type AiGenerationEvent,
  buildAiGenerationProperties,
  captureAiGeneration,
  flushPostHogAi,
  getPostHogAiClient,
  isPostHogAiEnabled,
  resetPostHogAiForTests,
  shutdownPostHogAi,
} from "./posthogAi.js";

function baseEvent(): AiGenerationEvent {
  return {
    userId: "user_abc",
    model: "claude-haiku-4-5",
    provider: "anthropic",
    feature: "chat",
    inputTokens: 120,
    outputTokens: 40,
    cacheReadInputTokens: 100,
    cacheCreationInputTokens: 0,
    costUsd: 0.0012,
    latencyMs: 1500,
    httpStatus: 200,
    promptVersion: "v42",
    traceId: "trace-1",
  };
}

beforeEach(() => {
  resetPostHogAiForTests();
  envMock.POSTHOG_AI_OBSERVABILITY_KEY = "";
  envMock.POSTHOG_HOST = undefined;
  posthogMock.instances.length = 0;
  posthogMock.ctorArgs.length = 0;
  posthogMock.setThrowOnCapture(false);
  posthogMock.setThrowOnConstruct(false);
  loggerMock.warn.mockClear();
});

afterEach(() => {
  resetPostHogAiForTests();
});

describe("buildAiGenerationProperties — allowlist за конструкцією", () => {
  it("мапить усі дозволені поля у формат PostHog AI Observability", () => {
    const props = buildAiGenerationProperties(baseEvent());
    expect(props).toEqual({
      $ai_model: "claude-haiku-4-5",
      $ai_provider: "anthropic",
      $ai_trace_id: "trace-1",
      $ai_latency: 1.5,
      $ai_input_tokens: 120,
      $ai_output_tokens: 40,
      $ai_cache_read_input_tokens: 100,
      $ai_cache_creation_input_tokens: 0,
      $ai_total_cost_usd: 0.0012,
      $ai_is_error: false,
      $ai_http_status: 200,
      feature: "chat",
      SYSTEM_PROMPT_VERSION: "v42",
    });
  });

  it("відкидає невідомі ключі — контент і бізнес-дані не мають шляху в подію", () => {
    const smuggled = {
      ...baseEvent(),
      $ai_input: [{ role: "user", content: "скільки я витратив на каву" }],
      $ai_output_choices: [{ role: "assistant", content: "₴1 240" }],
      balanceUah: 124_000,
      merchant: "Сільпо",
      email: "a@b.c",
    } as unknown as AiGenerationEvent;
    const props = buildAiGenerationProperties(smuggled) as unknown as Record<
      string,
      unknown
    >;
    for (const forbidden of [
      "$ai_input",
      "$ai_output_choices",
      "balanceUah",
      "merchant",
      "email",
    ]) {
      expect(props).not.toHaveProperty(forbidden);
    }
    expect(Object.keys(props).sort()).toEqual(
      Object.keys(buildAiGenerationProperties(baseEvent())).sort(),
    );
  });

  it("генерує trace id, коли caller його не передав, і пропускає не-числові метрики", () => {
    const props = buildAiGenerationProperties({
      model: "",
      provider: "openrouter",
      feature: "",
      latencyMs: null,
      costUsd: Number.NaN,
      isError: true,
      httpStatus: 529,
    });
    expect(props.$ai_model).toBe("unknown");
    expect(props.feature).toBe("unknown");
    expect(props.$ai_trace_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(props.$ai_is_error).toBe(true);
    expect(props.$ai_http_status).toBe(529);
    expect(props).not.toHaveProperty("$ai_latency");
    expect(props).not.toHaveProperty("$ai_total_cost_usd");
    expect(props).not.toHaveProperty("$ai_input_tokens");
    expect(props).not.toHaveProperty("SYSTEM_PROMPT_VERSION");
  });
});

describe("тумблер POSTHOG_AI_OBSERVABILITY_KEY", () => {
  it("без ключа — вимкнено: клієнт не створюється, capture повертає false", () => {
    expect(isPostHogAiEnabled()).toBe(false);
    expect(getPostHogAiClient()).toBeNull();
    expect(captureAiGeneration(baseEvent())).toBe(false);
    expect(posthogMock.ctorArgs).toHaveLength(0);
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });

  it("з ключем — один singleton на EU-хост з privacy-опціями", () => {
    envMock.POSTHOG_AI_OBSERVABILITY_KEY = "phc_test";
    expect(isPostHogAiEnabled()).toBe(true);
    const a = getPostHogAiClient();
    const b = getPostHogAiClient();
    expect(a).toBe(b);
    expect(posthogMock.ctorArgs).toHaveLength(1);
    const [key, options] = posthogMock.ctorArgs[0]!;
    expect(key).toBe("phc_test");
    expect(options).toMatchObject({
      host: "https://eu.i.posthog.com",
      disableGeoip: true,
      privacyMode: true,
      enableExceptionAutocapture: false,
    });
    // Слухач помилок SDK — інакше збій доставки був би тихим дропом.
    expect(posthogMock.instances[0]!.on).toHaveBeenCalledWith(
      "error",
      expect.any(Function),
    );
  });

  it("поважає POSTHOG_HOST, коли задано", () => {
    envMock.POSTHOG_AI_OBSERVABILITY_KEY = "phc_test";
    envMock.POSTHOG_HOST = "https://us.i.posthog.com";
    getPostHogAiClient();
    expect(posthogMock.ctorArgs[0]![1]).toMatchObject({
      host: "https://us.i.posthog.com",
    });
  });
});

describe("captureAiGeneration", () => {
  beforeEach(() => {
    envMock.POSTHOG_AI_OBSERVABILITY_KEY = "phc_test";
  });

  it("шле $ai_generation з distinctId = userId і лише allowlist-властивостями", () => {
    expect(captureAiGeneration(baseEvent())).toBe(true);
    const capture = posthogMock.instances[0]!.capture;
    expect(capture).toHaveBeenCalledTimes(1);
    const arg = capture.mock.calls[0]![0] as {
      distinctId: string;
      event: string;
      properties: Record<string, unknown>;
      disableGeoip: boolean;
    };
    expect(arg.event).toBe(AI_GENERATION_EVENT);
    expect(arg.distinctId).toBe("user_abc");
    expect(arg.disableGeoip).toBe(true);
    expect(arg.properties).toEqual(buildAiGenerationProperties(baseEvent()));
    expect(arg.properties).not.toHaveProperty("$ai_input");
    expect(arg.properties).not.toHaveProperty("$ai_output_choices");
  });

  it("без userId — системний distinctId `server`", () => {
    captureAiGeneration({ ...baseEvent(), userId: undefined });
    const arg = posthogMock.instances[0]!.capture.mock.calls[0]![0] as {
      distinctId: string;
    };
    expect(arg.distinctId).toBe(AI_SYSTEM_DISTINCT_ID);
  });

  it("fail-open: помилка SDK у capture глушиться warn-ом і не кидається", () => {
    posthogMock.setThrowOnCapture(true);
    expect(() => captureAiGeneration(baseEvent())).not.toThrow();
    expect(captureAiGeneration(baseEvent())).toBe(false);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ msg: "posthog_ai_capture_failed" }),
    );
  });

  it("fail-open: збій конструктора → клієнт null, warn один раз, без ретраїв", () => {
    posthogMock.setThrowOnConstruct(true);
    expect(captureAiGeneration(baseEvent())).toBe(false);
    expect(captureAiGeneration(baseEvent())).toBe(false);
    expect(loggerMock.warn).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ msg: "posthog_ai_init_failed" }),
    );
  });
});

describe("shutdown / flush", () => {
  it("shutdown дофлашує клієнт і скидає singleton; повторний виклик — no-op", async () => {
    envMock.POSTHOG_AI_OBSERVABILITY_KEY = "phc_test";
    getPostHogAiClient();
    await shutdownPostHogAi(1234);
    expect(posthogMock.instances[0]!.shutdown).toHaveBeenCalledWith(1234);
    await shutdownPostHogAi();
    expect(posthogMock.instances).toHaveLength(1);
  });

  it("flush без клієнта — no-op; з клієнтом — делегує SDK", async () => {
    await flushPostHogAi();
    envMock.POSTHOG_AI_OBSERVABILITY_KEY = "phc_test";
    getPostHogAiClient();
    await flushPostHogAi();
    expect(posthogMock.instances[0]!.flush).toHaveBeenCalledTimes(1);
  });

  it("shutdown fail-open: помилка SDK не кидається", async () => {
    envMock.POSTHOG_AI_OBSERVABILITY_KEY = "phc_test";
    const ph = getPostHogAiClient() as unknown as {
      shutdown: ReturnType<typeof vi.fn>;
    };
    ph.shutdown.mockRejectedValueOnce(new Error("net down"));
    await expect(shutdownPostHogAi()).resolves.toBeUndefined();
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ msg: "posthog_ai_shutdown_failed" }),
    );
  });
});
