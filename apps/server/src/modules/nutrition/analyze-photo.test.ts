import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import type { Request, Response } from "express";
import {
  anthropicResponses,
  createAnthropicMockHandle,
} from "../../test/__mocks__/anthropic.js";

vi.mock("../../lib/anthropic.js", () => createAnthropicMockHandle());

import { anthropicMessages as _anthropicMessages } from "../../lib/anthropic.js";
import handler from "./analyze-photo.js";

const anthropicMessages = _anthropicMessages as unknown as Mock;

interface TestRes {
  statusCode: number;
  body: unknown;
  status(code: number): TestRes;
  json(payload: unknown): TestRes;
}

// Валідний PNG-заголовок (89 50 4E 47 …) — magic-byte detector визначить
// image/png. Padding до 200 байт, щоб пройти `min` decoded-cap у валідаторі.
const PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const PNG_BASE64 = Buffer.concat([
  PNG_HEADER,
  Buffer.alloc(Math.max(0, 200 - PNG_HEADER.length)),
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

beforeEach(() => {
  anthropicMessages.mockReset();
});

describe("nutrition analyze-photo handler — Anthropic invocation", () => {
  it("happy path: normalizes the model JSON and preserves raw text", async () => {
    const rawText = JSON.stringify({
      dishName: "Борщ",
      confidence: 0.82,
      portion: { label: "тарілка", gramsApprox: 350 },
      ingredients: [
        { name: "Буряк", notes: "варений" },
        { name: "Капуста", notes: null },
      ],
      macros: { kcal: 180, protein_g: 6, fat_g: 7, carbs_g: 22 },
      questions: ["Зі сметаною?"],
    });
    anthropicMessages.mockResolvedValueOnce(anthropicResponses.text(rawText));

    const res = makeRes();
    await handler(
      makeReq({
        image_base64: PNG_BASE64,
        mime_type: "image/png",
        locale: "uk-UA",
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    const body = asRecord(res.body);
    expect(body["rawText"]).toBe(rawText);
    expect(body["result"]).toEqual({
      dishName: "Борщ",
      confidence: 0.82,
      portion: { label: "тарілка", gramsApprox: 350 },
      ingredients: [
        { name: "Буряк", notes: "варений" },
        { name: "Капуста", notes: null },
      ],
      macros: { kcal: 180, protein_g: 6, fat_g: 7, carbs_g: 22 },
      questions: ["Зі сметаною?"],
    });
  });

  it("sends the canonical Anthropic payload (model, vision block, endpoint)", async () => {
    anthropicMessages.mockResolvedValueOnce(
      anthropicResponses.text('{"dishName":"Плов"}'),
    );

    await handler(
      makeReq({
        image_base64: PNG_BASE64,
        mime_type: "image/png",
        locale: "uk-UA",
      }),
      makeRes(),
    );

    expect(anthropicMessages).toHaveBeenCalledTimes(1);
    expect(anthropicMessages.mock.calls[0]?.[0]).toBe("sk-test");
    const payload = asRecord(anthropicMessages.mock.calls[0]?.[1]);
    expect(payload["model"]).toBe("claude-sonnet-4-6");
    expect(payload["temperature"]).toBe(0.2);
    const messages = payload["messages"] as Array<{
      role: string;
      content: Array<{ type: string; source?: { media_type: string } }>;
    }>;
    const imageBlock = messages[0]?.content.find((b) => b.type === "image");
    // Канонічний MIME визначає magic-byte detector, не клієнтський mime_type.
    expect(imageBlock?.source?.media_type).toBe("image/png");
    const options = asRecord(anthropicMessages.mock.calls[0]?.[2]);
    expect(options).toMatchObject({
      timeoutMs: 20000,
      endpoint: "analyze-photo",
    });
  });

  it("extracts JSON embedded in surrounding model prose", async () => {
    anthropicMessages.mockResolvedValueOnce(
      anthropicResponses.text(
        'Ось результат:\n{"dishName":"Омлет","macros":{"kcal":210}}\nГотово.',
      ),
    );

    const res = makeRes();
    await handler(
      makeReq({ image_base64: PNG_BASE64, mime_type: "image/png" }),
      res,
    );

    const result = asRecord(asRecord(res.body)["result"]);
    expect(result["dishName"]).toBe("Омлет");
    expect(asRecord(result["macros"])["kcal"]).toBe(210);
  });

  it("defaults to uk-UA locale in the prompt when locale is omitted", async () => {
    anthropicMessages.mockResolvedValueOnce(anthropicResponses.text("{}"));

    await handler(
      makeReq({ image_base64: PNG_BASE64, mime_type: "image/png" }),
      makeRes(),
    );

    const payload = asRecord(anthropicMessages.mock.calls[0]?.[1]);
    const messages = payload["messages"] as Array<{
      content: Array<{ type: string; text?: string }>;
    }>;
    const textBlock = messages[0]?.content.find((b) => b.type === "text");
    expect(textBlock?.text).toContain("Мова: uk-UA.");
  });

  it("falls back to a safe default result when the model returns no JSON", async () => {
    anthropicMessages.mockResolvedValueOnce(
      anthropicResponses.text("Вибач, не можу розпізнати."),
    );

    const res = makeRes();
    await handler(
      makeReq({ image_base64: PNG_BASE64, mime_type: "image/png" }),
      res,
    );

    expect(res.statusCode).toBe(200);
    const result = asRecord(asRecord(res.body)["result"]);
    expect(result["dishName"]).toBe("Результат");
    expect(result["macros"]).toEqual({
      kcal: null,
      protein_g: null,
      fat_g: null,
      carbs_g: null,
    });
    expect(result["ingredients"]).toEqual([]);
  });

  it("rejects invalid input via schema and never calls Anthropic", async () => {
    await expect(
      handler(makeReq({ image_base64: "", mime_type: "image/png" }), makeRes()),
    ).rejects.toMatchObject({ name: "ValidationError" });
    expect(anthropicMessages).not.toHaveBeenCalled();
  });

  it("throws ExternalServiceError when Anthropic returns a non-ok response", async () => {
    anthropicMessages.mockResolvedValueOnce({
      response: { ok: false, status: 502 },
      data: { error: { message: "bad gateway" } },
    });

    await expect(
      handler(
        makeReq({ image_base64: PNG_BASE64, mime_type: "image/png" }),
        makeRes(),
      ),
    ).rejects.toMatchObject({
      name: "ExternalServiceError",
      message: "Асистент тимчасово недоступний. Спробуй пізніше.",
      status: 502,
      code: "ANTHROPIC_ERROR",
    });
  });
});
