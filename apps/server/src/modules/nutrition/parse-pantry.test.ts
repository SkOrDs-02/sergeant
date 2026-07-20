import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import type { Request, Response } from "express";

vi.mock("../../lib/llm/provider.js", () => ({
  getLLMProvider: vi.fn(() => ({ name: "stub" })),
  invokeLLM: vi.fn(),
}));

import { invokeLLM as _invokeLLM } from "../../lib/llm/provider.js";
import handler from "./parse-pantry.js";

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

describe("nutrition parse-pantry handler", () => {
  it("returns normalized pantry items and preserves raw text", async () => {
    const rawText = JSON.stringify({
      items: [
        { name: "Яблуко", qty: "3", unit: "", notes: "" },
        { name: "Молоко", qty: 1, unit: "л", notes: "2.5%" },
        { name: "", qty: 5, unit: "шт" },
      ],
    });
    invokeLLM.mockResolvedValueOnce({ ok: true, text: rawText });

    const res = makeRes();
    await handler(
      makeReq({
        text: "3 яблука, молоко 1 л",
        locale: "uk-UA",
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      items: [
        { name: "Яблуко", qty: 3, unit: "шт", notes: null },
        { name: "Молоко", qty: 1, unit: "л", notes: "2.5%" },
      ],
      rawText,
    });
    expect(invokeLLM).toHaveBeenCalledTimes(1);
    const opts = asRecord(invokeLLM.mock.calls[0]?.[1]);
    expect(opts["model"]).toBe("claude-sonnet-4-6");
    expect(opts["temperature"]).toBe(0.2);
    expect(opts["messages"]).toEqual([
      {
        role: "user",
        content: expect.stringContaining("3 яблука, молоко 1 л"),
      },
    ]);
    expect(opts).toMatchObject({
      timeoutMs: 20000,
      endpoint: "parse-pantry",
    });
  });

  it("extracts JSON embedded in surrounding provider text", async () => {
    invokeLLM.mockResolvedValueOnce({
      ok: true,
      text: 'Готово:\n{"items":[{"name":"Гречка","qty":"500","unit":"г","notes":null}]}',
    });

    const res = makeRes();
    await handler(makeReq({ text: "гречка 500 г", locale: "uk-UA" }), res);

    expect(asRecord(res.body)["items"]).toEqual([
      { name: "Гречка", qty: 500, unit: "г", notes: null },
    ]);
  });

  it("limits normalized pantry items to eighty", async () => {
    invokeLLM.mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({
        items: Array.from({ length: 90 }, (_, index) => ({
          name: `Продукт ${index + 1}`,
        })),
      }),
    });

    const res = makeRes();
    await handler(makeReq({ text: "багато продуктів", locale: "uk-UA" }), res);

    expect(asRecord(res.body)["items"]).toHaveLength(80);
  });

  it("uses default locale in the prompt when locale is omitted", async () => {
    invokeLLM.mockResolvedValueOnce({ ok: true, text: '{"items":[]}' });

    await handler(makeReq({ text: "яблука" }), makeRes());

    const opts = asRecord(invokeLLM.mock.calls[0]?.[1]);
    const messages = opts["messages"] as Array<{ content: string }>;
    expect(messages[0]?.content).toContain("Мова: uk-UA.");
  });

  it("throws ValidationError and skips the provider for invalid args", async () => {
    await expect(
      handler(makeReq({ text: "", locale: "uk-UA" }), makeRes()),
    ).rejects.toMatchObject({
      name: "ValidationError",
      message: "Некоректні дані запиту",
    });
    expect(invokeLLM).not.toHaveBeenCalled();
  });

  it("throws ExternalServiceError when the provider returns an error result", async () => {
    invokeLLM.mockResolvedValueOnce({
      ok: false,
      error: "bad gateway",
      status: 502,
    });

    await expect(
      handler(makeReq({ text: "яблука", locale: "uk-UA" }), makeRes()),
    ).rejects.toMatchObject({
      name: "ExternalServiceError",
      message: "Асистент тимчасово недоступний. Спробуй пізніше.",
      status: 502,
      code: "ANTHROPIC_ERROR",
    });
  });

  it("passes userId to the provider when session user is present", async () => {
    invokeLLM.mockResolvedValueOnce({ ok: true, text: '{"items":[]}' });

    await handler(
      {
        anthropicKey: "sk-test",
        body: { text: "яблука", locale: "uk-UA" },
        user: { id: "u_parse_pantry" },
      } as unknown as Request,
      makeRes(),
    );

    const opts = asRecord(invokeLLM.mock.calls[0]?.[1]);
    expect(opts["userId"]).toBe("u_parse_pantry");
  });
});
