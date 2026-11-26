import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../../http/errorHandler.js";

const { getLLMProviderMock, invokeLLMMock, envMock } = vi.hoisted(() => ({
  getLLMProviderMock: vi.fn(() => ({ name: "stub" })),
  invokeLLMMock: vi.fn(),
  envMock: {
    LLM_READONLY_PROVIDER: "openrouter",
    OPENROUTER_API_KEY: "or-key",
    ANTHROPIC_API_KEY: "",
  } as Record<string, unknown>,
}));

// Реальний гейт `requireLlmUpstream` читає env; керуємо готовністю ключем шлюзу.
vi.mock("../../env.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../env.js")>();
  return {
    env: new Proxy(actual.env, {
      get: (t, k) => (k in envMock ? envMock[k as string] : Reflect.get(t, k)),
    }),
  };
});

vi.mock("../../lib/llm/provider.js", () => ({
  getLLMProvider: getLLMProviderMock,
  invokeLLM: invokeLLMMock,
}));

async function makeApp(): Promise<express.Express> {
  const { createCategorizeInternalRouter } = await import("./categorize.js");
  const app = express();
  app.use(express.json());
  app.use(createCategorizeInternalRouter());
  app.use(errorHandler);
  return app;
}

describe("parseCategory", () => {
  it("extracts fenced JSON and clamps confidence to the 0..1 range", async () => {
    const { parseCategory } = await import("./categorize.js");

    expect(
      parseCategory('```json\n{"category":"dining","confidence":1.7}\n```'),
    ).toEqual({ category: "dining", confidence: 1 });
  });

  it("falls back to other/0 for unknown categories or malformed text", async () => {
    const { parseCategory } = await import("./categorize.js");

    expect(parseCategory('{"category":"crypto","confidence":0.8}')).toEqual({
      category: "other",
      confidence: 0.8,
    });
    expect(parseCategory("not json")).toEqual({
      category: "other",
      confidence: 0,
    });
  });
});

describe("createCategorizeInternalRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock["OPENROUTER_API_KEY"] = "or-key";
  });

  it("returns 503 ANTHROPIC_KEY_MISSING when the readonly upstream is not ready", async () => {
    envMock["OPENROUTER_API_KEY"] = "";
    const app = await makeApp();

    const res = await request(app)
      .post("/api/internal/categorize")
      .send({ description: "Unknown merchant", amount: 12345 });

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      error: "Сержант тимчасово недоступний. Спробуй пізніше.",
      code: "ANTHROPIC_KEY_MISSING",
    });
    expect(getLLMProviderMock).not.toHaveBeenCalled();
    expect(invokeLLMMock).not.toHaveBeenCalled();
  });

  it("still answers a known MCC from the table when the readonly upstream is not ready", async () => {
    envMock["OPENROUTER_API_KEY"] = "";
    const app = await makeApp();

    const res = await request(app).post("/api/internal/categorize").send({
      description: "АТБ Київ",
      amount: 25050,
      mcc: 5411,
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ category: "groceries", confidence: 1 });
    expect(invokeLLMMock).not.toHaveBeenCalled();
  });

  it("rejects whitespace-only descriptions before LLM work", async () => {
    const app = await makeApp();

    const res = await request(app)
      .post("/api/internal/categorize")
      .send({ description: "   ", amount: 19900 });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "description is required" });
    expect(invokeLLMMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a description over the 500-char cap before LLM work", async () => {
    const app = await makeApp();

    const res = await request(app)
      .post("/api/internal/categorize")
      .send({ description: "x".repeat(501) });

    expect(res.status).toBe(400);
    expect(invokeLLMMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-string description or malformed mcc/amount", async () => {
    const app = await makeApp();

    for (const body of [
      { description: { $ne: "" } },
      { description: "ok", mcc: "5411" },
      { description: "ok", amount: "19900" },
      {},
    ]) {
      const res = await request(app)
        .post("/api/internal/categorize")
        .send(body);
      expect(res.status).toBe(400);
    }
    expect(invokeLLMMock).not.toHaveBeenCalled();
  });

  it("uses the deterministic MCC fast path without invoking the LLM", async () => {
    const app = await makeApp();

    const res = await request(app).post("/api/internal/categorize").send({
      description: "АТБ Київ",
      amount: 25050,
      mcc: 5411,
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ category: "groceries", confidence: 1 });
    expect(invokeLLMMock).not.toHaveBeenCalled();
  });

  it("maps upstream classifier failures to the route 502 contract", async () => {
    invokeLLMMock.mockResolvedValueOnce({ ok: false, status: 503, text: "" });
    const app = await makeApp();

    const res = await request(app).post("/api/internal/categorize").send({
      description: "Unknown merchant",
      amount: 12345,
      mcc: 1234,
    });

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: "AI service error" });
    expect(getLLMProviderMock).toHaveBeenCalledTimes(1);
    expect(invokeLLMMock).toHaveBeenCalledTimes(1);
  });
});
