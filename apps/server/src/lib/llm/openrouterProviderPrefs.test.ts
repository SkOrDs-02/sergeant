import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Шов `providerPrefs` для стенду `eval:models` (замір fp4-ендпойнтів
 * 2026-11-19). Прод поле не передає, тож головна властивість — без нього
 * тіло прод-запиту байт-у-байт відоме (deny + квантизація від 8 біт). Явні
 * `quantizations`/`ignore` стенду перемагають дефолтний список, інакше стенд
 * не зміг би міряти інші варіанти.
 */

vi.mock("../../obs/metrics.js", () => ({
  aiTokensTotal: { inc: vi.fn() },
  aiCostEstimateUsd: { inc: vi.fn() },
  aiRequestsTotal: { inc: vi.fn() },
  llmProviderInvocationsTotal: { inc: vi.fn() },
}));

vi.mock("../../sentry.js", () => ({
  Sentry: { addBreadcrumb: vi.fn() },
}));

vi.mock("../anthropicUsageStore.js", () => ({
  ANTHROPIC_PROVIDER_SUBJECT: "provider:anthropic",
  recordAnthropicUsageToDb: vi.fn(),
}));

const { OpenRouterProvider } = await import("./provider.js");

function stubGateway() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: "ок" } }] }),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function sentBody(fetchMock: ReturnType<typeof stubGateway>): string {
  const init = fetchMock.mock.calls[0]?.[1] as { body: string };
  return init.body;
}

const BASE = {
  model: "z-ai/glm-5.2",
  system: "sys",
  maxTokens: 100,
  messages: [{ role: "user" as const, content: "привіт" }],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenRouterProvider — providerPrefs (лише для стенду)", () => {
  it("без параметра тіло прод-запиту рівно таке (deny + квантизація від 8 біт)", async () => {
    const fetchMock = stubGateway();
    await new OpenRouterProvider("k").generate(BASE);
    expect(sentBody(fetchMock)).toBe(
      JSON.stringify({
        model: "z-ai/glm-5.2",
        messages: [
          { role: "system", content: "sys" },
          { role: "user", content: "привіт" },
        ],
        max_tokens: 100,
        usage: { include: true },
        provider: {
          data_collection: "deny",
          quantizations: ["fp8", "mxfp8", "fp16", "bf16", "fp32", "unknown"],
        },
      }),
    );
  });

  it("квантизації й ignore стенду перемагають дефолтний список, data_collection лишає deny", async () => {
    const fetchMock = stubGateway();
    await new OpenRouterProvider("k").generate({
      ...BASE,
      providerPrefs: {
        quantizations: ["fp8", "unknown"],
        ignore: ["relace"],
        data_collection: "allow",
      },
    });
    const body = JSON.parse(sentBody(fetchMock)) as Record<string, unknown>;
    expect(body["provider"]).toEqual({
      quantizations: ["fp8", "unknown"],
      ignore: ["relace"],
      data_collection: "deny",
    });
  });

  it("лише ignore від стенду: дефолтний список квантизацій не додається", async () => {
    const fetchMock = stubGateway();
    await new OpenRouterProvider("k").generate({
      ...BASE,
      providerPrefs: { ignore: ["relace"] },
    });
    const body = JSON.parse(sentBody(fetchMock)) as Record<string, unknown>;
    expect(body["provider"]).toEqual({
      ignore: ["relace"],
      data_collection: "deny",
    });
  });
});
