import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getLLMProviderMock, invokeLLMMock } = vi.hoisted(() => ({
  getLLMProviderMock: vi.fn(() => ({ name: "stub" })),
  invokeLLMMock: vi.fn(),
}));

vi.mock("../../lib/llm/provider.js", () => ({
  getLLMProvider: getLLMProviderMock,
  invokeLLM: invokeLLMMock,
}));

async function makeApp(): Promise<express.Express> {
  const { createCategorizeInternalRouter } = await import("./categorize.js");
  const app = express();
  app.use(express.json());
  app.use(createCategorizeInternalRouter());
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
