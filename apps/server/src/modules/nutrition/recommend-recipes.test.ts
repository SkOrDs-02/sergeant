import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { Request, Response } from "express";
import {
  anthropicError,
  anthropicResponses,
  createAnthropicMockHandle,
} from "../../test/__mocks__/anthropic.js";

vi.mock("../../lib/anthropic.js", () => createAnthropicMockHandle());

import { anthropicMessages as anthropicMessagesMock } from "../../lib/anthropic.js";
import handler from "./recommend-recipes.js";

interface TestRes {
  statusCode: number;
  body: unknown;
  status(code: number): TestRes;
  json(payload: unknown): TestRes;
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

function makeReq(body: unknown): Request & { anthropicKey: string } {
  return {
    body,
    anthropicKey: "test-anthropic-key",
  } as Request & { anthropicKey: string };
}

function asRecord(value: unknown): Record<string, unknown> {
  expect(value).toBeTruthy();
  expect(typeof value).toBe("object");
  expect(Array.isArray(value)).toBe(false);
  return value as Record<string, unknown>;
}

const anthropicMessages = anthropicMessagesMock as unknown as Mock;

beforeEach(() => {
  anthropicMessages.mockReset();
});

describe("recommend-recipes handler", () => {
  it("returns normalized recipes from Anthropic JSON", async () => {
    anthropicMessages.mockResolvedValueOnce(
      anthropicResponses.text(
        JSON.stringify({
          recipes: [
            {
              title: "Омлет зі шпинатом",
              timeMinutes: "15",
              servings: 2,
              ingredients: ["яйця", "шпинат", ""],
              steps: ["Збити яйця", "Посмажити"],
              tips: ["Не перегрівай пательню"],
              macros: {
                kcal: 420,
                protein_g: "28",
                fat_g: 18,
                carbs_g: -3,
              },
            },
          ],
        }),
      ),
    );

    const res = makeRes();
    await handler(
      makeReq({
        pantry: [
          { name: "яйця", qty: 6, unit: "шт", notes: "домашні" },
          "шпинат",
        ],
        preferences: {
          goal: "protein",
          servings: 2,
          timeMinutes: 20,
          exclude: "горіхи",
          locale: "uk-UA",
        },
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      recipes: [
        {
          title: "Омлет зі шпинатом",
          timeMinutes: 15,
          servings: 2,
          ingredients: ["яйця", "шпинат"],
          steps: ["Збити яйця", "Посмажити"],
          tips: ["Не перегрівай пательню"],
          macros: {
            kcal: 420,
            protein_g: 28,
            fat_g: 18,
            carbs_g: null,
          },
        },
      ],
      rawText: null,
    });

    const payload = asRecord(anthropicMessages.mock.calls[0]?.[1]);
    expect(payload["model"]).toBe("claude-sonnet-4-6");
    expect(payload["max_tokens"]).toBe(2800);
    expect(String(payload["system"])).toContain("рецепт");
    expect(JSON.stringify(payload["messages"])).toContain("Ціль: protein");
    expect(JSON.stringify(payload["messages"])).toContain("Порції: 2");
    expect(JSON.stringify(payload["messages"])).toContain(
      "яйця — 6 шт — домашні",
    );
    expect(JSON.stringify(payload["messages"])).toContain("Не використовувати");
  });

  it("uses prompt defaults when preferences are omitted", async () => {
    anthropicMessages.mockResolvedValueOnce(
      anthropicResponses.text(JSON.stringify({ recipes: [] })),
    );

    const res = makeRes();
    await handler(
      makeReq({
        pantry: [],
        locale: "uk-UA",
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ recipes: [], rawText: '{"recipes":[]}' });
    const payload = asRecord(anthropicMessages.mock.calls[0]?.[1]);
    expect(JSON.stringify(payload["messages"])).toContain("Ціль: balanced");
    expect(JSON.stringify(payload["messages"])).toContain("Порції: 1");
    expect(JSON.stringify(payload["messages"])).toContain("Час: 25 хв.");
  });

  it("returns raw text when Anthropic response cannot be normalized", async () => {
    anthropicMessages.mockResolvedValueOnce(
      anthropicResponses.text("не json відповідь"),
    );

    const res = makeRes();
    await handler(makeReq({ pantry: ["рис"], locale: "uk-UA" }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ recipes: [], rawText: "не json відповідь" });
  });

  it("returns 400 for invalid request body without calling Anthropic", async () => {
    const res = makeRes();

    await handler(makeReq({ count: 999, locale: "uk-UA" }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: "Некоректні дані запиту" });
    expect(anthropicMessages).not.toHaveBeenCalled();
  });

  it("throws ExternalServiceError when Anthropic returns non-ok response", async () => {
    anthropicMessages.mockResolvedValueOnce({
      response: { ok: false, status: 503 },
      data: { error: { message: "anthropic overloaded" } },
    });

    await expect(
      handler(makeReq({ pantry: ["гречка"], locale: "uk-UA" }), makeRes()),
    ).rejects.toMatchObject({
      name: "ExternalServiceError",
      message: "anthropic overloaded",
      status: 503,
      code: "ANTHROPIC_ERROR",
    });
  });

  it("propagates rejected Anthropic transport errors", async () => {
    anthropicMessages.mockRejectedValueOnce(
      anthropicError("network down", { status: 502 }),
    );

    await expect(
      handler(makeReq({ pantry: ["гречка"], locale: "uk-UA" }), makeRes()),
    ).rejects.toMatchObject({
      name: "ExternalServiceError",
      message: "network down",
    });
  });
});
