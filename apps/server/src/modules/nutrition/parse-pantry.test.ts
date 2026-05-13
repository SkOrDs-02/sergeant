import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import type { Request, Response } from "express";
import {
  anthropicResponses,
  createAnthropicMockHandle,
} from "../../test/__mocks__/anthropic.js";

vi.mock("../../lib/anthropic.js", () => createAnthropicMockHandle());

import { anthropicMessages as _anthropicMessages } from "../../lib/anthropic.js";
import handler from "./parse-pantry.js";

const anthropicMessages = _anthropicMessages as unknown as Mock;

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
  anthropicMessages.mockReset();
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
    anthropicMessages.mockResolvedValueOnce(anthropicResponses.text(rawText));

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
    expect(anthropicMessages).toHaveBeenCalledTimes(1);
    expect(anthropicMessages.mock.calls[0]?.[0]).toBe("sk-test");
    const payload = asRecord(anthropicMessages.mock.calls[0]?.[1]);
    expect(payload["model"]).toBe("claude-sonnet-4-6");
    expect(payload["temperature"]).toBe(0.2);
    expect(payload["messages"]).toEqual([
      {
        role: "user",
        content: expect.stringContaining("3 яблука, молоко 1 л"),
      },
    ]);
    const options = asRecord(anthropicMessages.mock.calls[0]?.[2]);
    expect(options).toMatchObject({
      timeoutMs: 20000,
      endpoint: "parse-pantry",
    });
  });

  it("extracts JSON embedded in surrounding Anthropic text", async () => {
    anthropicMessages.mockResolvedValueOnce(
      anthropicResponses.text(
        'Готово:\n{"items":[{"name":"Гречка","qty":"500","unit":"г","notes":null}]}',
      ),
    );

    const res = makeRes();
    await handler(makeReq({ text: "гречка 500 г", locale: "uk-UA" }), res);

    expect(asRecord(res.body)["items"]).toEqual([
      { name: "Гречка", qty: 500, unit: "г", notes: null },
    ]);
  });

  it("limits normalized pantry items to eighty", async () => {
    anthropicMessages.mockResolvedValueOnce(
      anthropicResponses.text(
        JSON.stringify({
          items: Array.from({ length: 90 }, (_, index) => ({
            name: `Продукт ${index + 1}`,
          })),
        }),
      ),
    );

    const res = makeRes();
    await handler(makeReq({ text: "багато продуктів", locale: "uk-UA" }), res);

    expect(asRecord(res.body)["items"]).toHaveLength(80);
  });

  it("uses default locale in the prompt when locale is omitted", async () => {
    anthropicMessages.mockResolvedValueOnce(
      anthropicResponses.text('{"items":[]}'),
    );

    await handler(makeReq({ text: "яблука" }), makeRes());

    const payload = asRecord(anthropicMessages.mock.calls[0]?.[1]);
    const messages = payload["messages"] as Array<{ content: string }>;
    expect(messages[0]?.content).toContain("Мова: uk-UA.");
  });

  it("returns a validation response and skips Anthropic for invalid args", async () => {
    const res = makeRes();

    await handler(makeReq({ text: "", locale: "uk-UA" }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: "Некоректні дані запиту" });
    expect(anthropicMessages).not.toHaveBeenCalled();
  });

  it("throws ExternalServiceError when Anthropic returns an error response", async () => {
    anthropicMessages.mockResolvedValueOnce({
      response: { ok: false, status: 502 },
      data: { error: { message: "bad gateway" } },
    });

    await expect(
      handler(makeReq({ text: "яблука", locale: "uk-UA" }), makeRes()),
    ).rejects.toMatchObject({
      name: "ExternalServiceError",
      message: "bad gateway",
      status: 502,
      code: "ANTHROPIC_ERROR",
    });
  });
});
