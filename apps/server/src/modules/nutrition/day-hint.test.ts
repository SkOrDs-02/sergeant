import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import type { Request, Response } from "express";

vi.mock("../../lib/llm/provider.js", () => ({
  getLLMProvider: vi.fn(() => ({ name: "stub" })),
  invokeLLM: vi.fn(),
}));

import { invokeLLM as _invokeLLM } from "../../lib/llm/provider.js";
import handler from "./day-hint.js";

const invokeLLM = _invokeLLM as unknown as Mock;

interface TestRes {
  statusCode: number;
  body: unknown;
  status(code: number): TestRes;
  json(payload: unknown): TestRes;
}

function makeReq(body: unknown): Request {
  return { anthropicKey: "sk-test", body } as unknown as Request;
}

function makeRes(): TestRes & Response {
  const res: TestRes = {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res as TestRes & Response;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

beforeEach(() => {
  invokeLLM.mockReset();
});

describe("nutrition day-hint handler", () => {
  it("returns a normalized hint from provider JSON", async () => {
    invokeLLM.mockResolvedValueOnce({
      ok: true,
      text: '{"hint":"Додай білок до вечері."}',
    });

    const res = makeRes();
    await handler(
      makeReq({
        macros: { kcal: 1600, protein_g: 90, fat_g: 50, carbs_g: 180 },
        targets: {
          dailyTargetKcal: 2000,
          dailyTargetProtein_g: 120,
          dailyTargetFat_g: 70,
          dailyTargetCarbs_g: 220,
        },
        hasMeals: true,
        hasAnyMacros: true,
        macroSources: { manual: 2, ai: 1 },
        locale: "uk-UA",
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ hint: "Додай білок до вечері." });
    expect(invokeLLM).toHaveBeenCalledTimes(1);
    const opts = asRecord(invokeLLM.mock.calls[0]?.[1]);
    expect(opts["model"]).toBe("claude-sonnet-4-6");
    expect(opts["temperature"]).toBe(0.3);
    expect(opts["endpoint"]).toBe("day-hint");
    expect(opts["timeoutMs"]).toBe(20000);
    expect(opts["messages"]).toEqual([
      {
        role: "user",
        content: expect.stringContaining("Мова: uk-UA"),
      },
    ]);
  });

  it("truncates long hints returned in JSON", async () => {
    const longHint = "а".repeat(1300);
    invokeLLM.mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({ hint: longHint }),
    });

    const res = makeRes();
    await handler(makeReq({ macros: {}, locale: "uk-UA" }), res);

    expect(res.statusCode).toBe(200);
    expect(asRecord(res.body)["hint"]).toBe(longHint.slice(0, 1200));
  });

  it("returns the default hint when provider text has no JSON payload", async () => {
    invokeLLM.mockResolvedValueOnce({ ok: true, text: "Порада без JSON" });

    const res = makeRes();
    await handler(makeReq({ macros: {}, locale: "uk-UA" }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ hint: "Не вдалося сформувати підказку." });
  });

  it("throws ValidationError and skips the provider for invalid args", async () => {
    await expect(
      handler(makeReq({ locale: "u" }), makeRes()),
    ).rejects.toMatchObject({
      name: "ValidationError",
      message: "Некоректні дані запиту",
    });
    expect(invokeLLM).not.toHaveBeenCalled();
  });

  it("throws ExternalServiceError when the provider returns an error result", async () => {
    invokeLLM.mockResolvedValueOnce({
      ok: false,
      error: "overloaded",
      status: 503,
    });

    await expect(
      handler(makeReq({ macros: {}, locale: "uk-UA" }), makeRes()),
    ).rejects.toMatchObject({
      name: "ExternalServiceError",
      message: "Асистент тимчасово недоступний. Спробуй пізніше.",
      status: 503,
      code: "ANTHROPIC_ERROR",
    });
  });

  it("adds no-macro and macro-source context to the prompt", async () => {
    invokeLLM.mockResolvedValueOnce({
      ok: true,
      text: '{"hint":"Заповни КБЖВ для страв."}',
    });

    await handler(
      makeReq({
        macros: {},
        hasMeals: true,
        hasAnyMacros: false,
        macroSources: { ai: 3 },
        locale: "uk-UA",
      }),
      makeRes(),
    );

    const opts = asRecord(invokeLLM.mock.calls[0]?.[1]);
    const messages = opts["messages"] as Array<{ content: string }>;
    expect(messages[0]?.content).toContain("без КБЖВ");
    expect(messages[0]?.content).toContain('"ai":3');
  });

  it("falls back to raw provider text when JSON extraction throws", async () => {
    const jsonSafe = await import("../../http/jsonSafe.js");
    vi.spyOn(jsonSafe, "extractJsonFromText").mockImplementationOnce(() => {
      throw new Error("parse exploded");
    });
    invokeLLM.mockResolvedValueOnce({
      ok: true,
      text: "Порада без JSON обгортки",
    });

    const res = makeRes();
    await handler(makeReq({ macros: {}, locale: "uk-UA" }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ hint: "Порада без JSON обгортки" });
  });

  it("passes userId to the provider when session user is present", async () => {
    invokeLLM.mockResolvedValueOnce({ ok: true, text: '{"hint":"ok"}' });

    await handler(
      {
        anthropicKey: "sk-test",
        body: { macros: {}, locale: "uk-UA" },
        user: { id: "u_day_hint" },
      } as unknown as Request,
      makeRes(),
    );

    const opts = asRecord(invokeLLM.mock.calls[0]?.[1]);
    expect(opts["userId"]).toBe("u_day_hint");
  });
});
