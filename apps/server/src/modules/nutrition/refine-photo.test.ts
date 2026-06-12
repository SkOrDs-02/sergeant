import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import type { Request, Response } from "express";
import {
  anthropicResponses,
  createAnthropicMockHandle,
} from "../../test/__mocks__/anthropic.js";

vi.mock("../../lib/anthropic.js", () => createAnthropicMockHandle());

import { anthropicMessages as _anthropicMessages } from "../../lib/anthropic.js";
import handler from "./refine-photo.js";

const anthropicMessages = _anthropicMessages as unknown as Mock;

interface TestRes {
  statusCode: number;
  body: unknown;
  status(code: number): TestRes;
  json(payload: unknown): TestRes;
}

// Валідний JPEG-заголовок (FF D8 FF …), padded до 200 байт.
const JPEG_HEADER = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);
const JPEG_BASE64 = Buffer.concat([
  JPEG_HEADER,
  Buffer.alloc(Math.max(0, 200 - JPEG_HEADER.length)),
]).toString("base64");

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

function baseReq(extra: Record<string, unknown> = {}): unknown {
  return {
    image_base64: JPEG_BASE64,
    mime_type: "image/jpeg",
    prior_result: { dishName: "Плов" },
    locale: "uk-UA",
    ...extra,
  };
}

beforeEach(() => {
  anthropicMessages.mockReset();
});

describe("nutrition refine-photo handler — Anthropic invocation", () => {
  it("happy path: normalizes refined model JSON and preserves raw text", async () => {
    const rawText = JSON.stringify({
      dishName: "Плов з куркою",
      confidence: 0.91,
      portion: { label: "порція", gramsApprox: 300 },
      ingredients: [{ name: "Рис", notes: null }],
      macros: { kcal: 520, protein_g: 22, fat_g: 18, carbs_g: 64 },
      questions: [],
    });
    anthropicMessages.mockResolvedValueOnce(anthropicResponses.text(rawText));

    const res = makeRes();
    await handler(makeReq(baseReq({ portion_grams: 300 })), res);

    expect(res.statusCode).toBe(200);
    const body = asRecord(res.body);
    expect(body["rawText"]).toBe(rawText);
    expect(body["result"]).toEqual({
      dishName: "Плов з куркою",
      confidence: 0.91,
      portion: { label: "порція", gramsApprox: 300 },
      ingredients: [{ name: "Рис", notes: null }],
      macros: { kcal: 520, protein_g: 22, fat_g: 18, carbs_g: 64 },
      questions: [],
    });
  });

  it("sends the canonical payload with the refine-photo endpoint tag", async () => {
    anthropicMessages.mockResolvedValueOnce(
      anthropicResponses.text('{"dishName":"Плов"}'),
    );

    await handler(makeReq(baseReq()), makeRes());

    expect(anthropicMessages).toHaveBeenCalledTimes(1);
    expect(anthropicMessages.mock.calls[0]?.[0]).toBe("sk-test");
    const payload = asRecord(anthropicMessages.mock.calls[0]?.[1]);
    expect(payload["model"]).toBe("claude-sonnet-4-6");
    const messages = payload["messages"] as Array<{
      content: Array<{ type: string; source?: { media_type: string } }>;
    }>;
    const imageBlock = messages[0]?.content.find((b) => b.type === "image");
    expect(imageBlock?.source?.media_type).toBe("image/jpeg");
    const options = asRecord(anthropicMessages.mock.calls[0]?.[2]);
    expect(options).toMatchObject({
      timeoutMs: 20000,
      endpoint: "refine-photo",
    });
  });

  it("threads portion_grams and qna into the user prompt", async () => {
    anthropicMessages.mockResolvedValueOnce(anthropicResponses.text("{}"));

    await handler(
      makeReq(
        baseReq({
          portion_grams: 275,
          qna: [{ question: "Скільки олії?", answer: "1 ложка" }],
        }),
      ),
      makeRes(),
    );

    const payload = asRecord(anthropicMessages.mock.calls[0]?.[1]);
    const messages = payload["messages"] as Array<{
      content: Array<{ type: string; text?: string }>;
    }>;
    const text = messages[0]?.content.find((b) => b.type === "text")?.text;
    expect(text).toContain("275");
    expect(text).toContain("Скільки олії?");
  });

  it("uses portion_grams as a fallback portion when the model omits one", async () => {
    anthropicMessages.mockResolvedValueOnce(
      anthropicResponses.text('{"dishName":"Салат"}'),
    );

    const res = makeRes();
    await handler(makeReq(baseReq({ portion_grams: 180 })), res);

    const result = asRecord(asRecord(res.body)["result"]);
    expect(result["portion"]).toEqual({ label: "180 г", gramsApprox: 180 });
  });

  it("rejects invalid input via schema and never calls Anthropic", async () => {
    await expect(
      handler(makeReq(baseReq({ image_base64: "" })), makeRes()),
    ).rejects.toMatchObject({ name: "ValidationError" });
    expect(anthropicMessages).not.toHaveBeenCalled();
  });

  it("throws ExternalServiceError when Anthropic returns a non-ok response", async () => {
    anthropicMessages.mockResolvedValueOnce({
      response: { ok: false, status: 503 },
      data: { error: { message: "overloaded" } },
    });

    await expect(handler(makeReq(baseReq()), makeRes())).rejects.toMatchObject({
      name: "ExternalServiceError",
      message: "Асистент тимчасово недоступний. Спробуй пізніше.",
      status: 503,
      code: "ANTHROPIC_ERROR",
    });
  });
});
