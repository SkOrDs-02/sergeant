import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { Request, Response } from "express";
import { anthropicError } from "../../test/__mocks__/anthropic.js";

vi.mock("../../lib/llm/provider.js", () => ({
  getLLMProvider: vi.fn(() => ({ name: "stub" })),
  invokeLLM: vi.fn(),
}));

import { invokeLLM as _invokeLLM } from "../../lib/llm/provider.js";
import handler from "./recommend-recipes.js";

const invokeLLM = _invokeLLM as unknown as Mock;

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

beforeEach(() => {
  invokeLLM.mockReset();
});

describe("recommend-recipes handler", () => {
  it("returns normalized recipes from provider JSON", async () => {
    invokeLLM.mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({
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
    });

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

    const opts = asRecord(invokeLLM.mock.calls[0]?.[1]);
    expect(opts["model"]).toBe("claude-sonnet-4-6");
    expect(opts["maxTokens"]).toBe(2800);
    expect(String(opts["system"])).toContain("рецепт");
    expect(JSON.stringify(opts["messages"])).toContain("Ціль: protein");
    expect(JSON.stringify(opts["messages"])).toContain("Порції: 2");
    expect(JSON.stringify(opts["messages"])).toContain("яйця — 6 шт — домашні");
    expect(JSON.stringify(opts["messages"])).toContain("Не використовувати");
  });

  it("uses prompt defaults when preferences are omitted", async () => {
    invokeLLM.mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({ recipes: [] }),
    });

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
    const opts = asRecord(invokeLLM.mock.calls[0]?.[1]);
    expect(JSON.stringify(opts["messages"])).toContain("Ціль: balanced");
    expect(JSON.stringify(opts["messages"])).toContain("Порції: 1");
    expect(JSON.stringify(opts["messages"])).toContain("Час: 25 хв.");
  });

  it("returns raw text when provider response cannot be normalized", async () => {
    invokeLLM.mockResolvedValueOnce({
      ok: true,
      text: "не json відповідь",
    });

    const res = makeRes();
    await handler(makeReq({ pantry: ["рис"], locale: "uk-UA" }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ recipes: [], rawText: "не json відповідь" });
  });

  it("throws ValidationError for invalid request body without calling the provider", async () => {
    await expect(
      handler(makeReq({ count: 999, locale: "uk-UA" }), makeRes()),
    ).rejects.toMatchObject({
      name: "ValidationError",
      message: "Некоректні дані запиту",
    });
    expect(invokeLLM).not.toHaveBeenCalled();
  });

  it("throws ExternalServiceError when the provider returns a non-ok response", async () => {
    invokeLLM.mockResolvedValueOnce({
      ok: false,
      error: "anthropic overloaded",
      status: 503,
    });

    await expect(
      handler(makeReq({ pantry: ["гречка"], locale: "uk-UA" }), makeRes()),
    ).rejects.toMatchObject({
      name: "ExternalServiceError",
      message: "Асистент тимчасово недоступний. Спробуй пізніше.",
      status: 503,
      code: "ANTHROPIC_ERROR",
    });
  });

  it("propagates rejected provider transport errors", async () => {
    invokeLLM.mockRejectedValueOnce(
      anthropicError("network down", { status: 502 }),
    );

    await expect(
      handler(makeReq({ pantry: ["гречка"], locale: "uk-UA" }), makeRes()),
    ).rejects.toMatchObject({
      name: "ExternalServiceError",
      message: "network down",
    });
  });

  it("renders exclude placeholder and string pantry items in the prompt", async () => {
    invokeLLM.mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({ recipes: [] }),
    });

    await handler(
      makeReq({
        pantry: ["гречка", "рис"],
        preferences: { exclude: "", goal: "low-carb" },
        locale: "uk-UA",
      }),
      makeRes(),
    );

    const opts = asRecord(invokeLLM.mock.calls[0]?.[1]);
    const messages = JSON.stringify(opts["messages"]);
    expect(messages).toContain("Не використовувати/алергени: —");
    expect(messages).toContain("гречка");
    expect(messages).toContain("рис");
    expect(messages).toContain("Ціль: low-carb");
  });

  it("passes userId to the provider when session user is present", async () => {
    invokeLLM.mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({ recipes: [] }),
    });

    await handler(
      {
        anthropicKey: "test-anthropic-key",
        body: { pantry: [], locale: "uk-UA" },
        user: { id: "u_recipes" },
      } as unknown as Request,
      makeRes(),
    );

    const opts = asRecord(invokeLLM.mock.calls[0]?.[1]);
    expect(opts["userId"]).toBe("u_recipes");
  });
});
