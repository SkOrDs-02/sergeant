import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { Request, Response } from "express";
import { anthropicError } from "../../test/__mocks__/anthropic.js";

vi.mock("../../lib/llm/provider.js", () => ({
  getLLMProvider: vi.fn(() => ({ name: "stub" })),
  invokeLLM: vi.fn(),
}));

import { invokeLLM as _invokeLLM } from "../../lib/llm/provider.js";
import handler from "./week-plan.js";

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

describe("week-plan handler", () => {
  it("returns a normalized 7-day plan without generating shopping items", async () => {
    invokeLLM.mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({
        days: Array.from({ length: 8 }, (_, i) => ({
          label: i === 0 ? "Понеділок".repeat(10) : `День ${i + 1}`,
          note: i === 0 ? "коротко".repeat(100) : `нотатка ${i + 1}`,
          meals: ["омлет", "", " обід — рис ", "вечеря — риба"],
        })),
        shoppingList: [
          "рис",
          "",
          "риба",
          ...Array.from({ length: 60 }, () => "x"),
        ],
      }),
    });

    const res = makeRes();
    await handler(
      makeReq({
        pantry: [{ name: "яйця", qty: 6, unit: "шт" }, "гречка"],
        preferences: { goal: "protein" },
        locale: "uk-UA",
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    const body = asRecord(res.body);
    const plan = asRecord(body["plan"]);
    expect(plan["days"]).toHaveLength(7);
    expect(plan["shoppingList"]).toEqual([]);
    expect(plan["rawText"]).toBeUndefined();
    expect(body["rawText"]).toBeNull();
    expect(plan["days"]).toContainEqual(
      expect.objectContaining({
        label: "ПонеділокПонеділокПонеділокПонеділокПоне",
        note: expect.stringMatching(/^коротко/),
        meals: ["омлет", "обід — рис", "вечеря — риба"],
      }),
    );

    const opts = asRecord(invokeLLM.mock.calls[0]?.[1]);
    expect(opts["maxTokens"]).toBe(2000);
    expect(JSON.stringify(opts["messages"])).toContain("Ціль: protein");
    expect(JSON.stringify(opts["messages"])).toContain("яйця");
    expect(JSON.stringify(opts["messages"])).toContain("гречка");
  });

  it("falls back to default labels for malformed day entries", async () => {
    invokeLLM.mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({
        days: [null, { meals: ["сніданок"] }],
        shoppingList: ["молоко"],
      }),
    });

    const res = makeRes();
    await handler(makeReq({ pantry: [], locale: "uk-UA" }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      plan: {
        days: [
          { label: "День 1", note: "", meals: [] },
          { label: "День 2", note: "", meals: ["сніданок"] },
        ],
        shoppingList: [],
      },
      rawText: null,
    });
  });

  it("returns raw text when the provider emits invalid JSON", async () => {
    invokeLLM.mockResolvedValueOnce({
      ok: true,
      text: "не json відповідь",
    });

    const res = makeRes();
    await handler(makeReq({ pantry: ["рис"], locale: "uk-UA" }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      plan: { days: [], shoppingList: [] },
      rawText: "не json відповідь",
    });
  });

  it("throws ValidationError for invalid pantry item without calling the provider", async () => {
    await expect(
      handler(
        makeReq({ pantry: [{ name: "x", qty: {} }], locale: "uk-UA" }),
        makeRes(),
      ),
    ).rejects.toMatchObject({
      name: "ValidationError",
      message: "Некоректні дані запиту",
    });
    expect(invokeLLM).not.toHaveBeenCalled();
  });

  it("throws ExternalServiceError when the provider returns a non-ok response", async () => {
    invokeLLM.mockResolvedValueOnce({
      ok: false,
      error: "model failed",
      status: 500,
    });

    await expect(
      handler(makeReq({ pantry: ["гречка"], locale: "uk-UA" }), makeRes()),
    ).rejects.toMatchObject({
      name: "ExternalServiceError",
      message: "Асистент тимчасово недоступний. Спробуй пізніше.",
      status: 500,
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

  it("returns empty plan when JSON extraction throws", async () => {
    const jsonSafe = await import("../../http/jsonSafe.js");
    vi.spyOn(jsonSafe, "extractJsonFromText").mockImplementationOnce(() => {
      throw new Error("parse exploded");
    });
    invokeLLM.mockResolvedValueOnce({
      ok: true,
      text: "не json відповідь",
    });

    const res = makeRes();
    await handler(makeReq({ pantry: [], locale: "uk-UA" }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      plan: { days: [], shoppingList: [] },
      rawText: "не json відповідь",
    });
  });

  it("passes userId to the provider when session user is present", async () => {
    invokeLLM.mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({ days: [], shoppingList: [] }),
    });

    await handler(
      {
        anthropicKey: "test-anthropic-key",
        body: { pantry: [], locale: "uk-UA" },
        user: { id: "u_week_plan" },
      } as unknown as Request,
      makeRes(),
    );

    const opts = asRecord(invokeLLM.mock.calls[0]?.[1]);
    expect(opts["userId"]).toBe("u_week_plan");
  });
});
