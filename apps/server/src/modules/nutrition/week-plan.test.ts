import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { Request, Response } from "express";
import {
  anthropicError,
  anthropicResponses,
  createAnthropicMockHandle,
} from "../../test/__mocks__/anthropic.js";

vi.mock("../../lib/anthropic.js", () => createAnthropicMockHandle());

import { anthropicMessages as anthropicMessagesMock } from "../../lib/anthropic.js";
import handler from "./week-plan.js";

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

describe("week-plan handler", () => {
  it("returns a normalized 7-day plan with trimmed meals and shopping list", async () => {
    anthropicMessages.mockResolvedValueOnce(
      anthropicResponses.text(
        JSON.stringify({
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
      ),
    );

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
    expect(plan["shoppingList"]).toHaveLength(50);
    expect(plan["rawText"]).toBeUndefined();
    expect(body["rawText"]).toBeNull();
    expect(plan["days"]).toContainEqual(
      expect.objectContaining({
        label: "ПонеділокПонеділокПонеділокПонеділокПоне",
        note: expect.stringMatching(/^коротко/),
        meals: ["омлет", "обід — рис", "вечеря — риба"],
      }),
    );

    const payload = asRecord(anthropicMessages.mock.calls[0]?.[1]);
    expect(payload["max_tokens"]).toBe(2000);
    expect(JSON.stringify(payload["messages"])).toContain("Ціль: protein");
    expect(JSON.stringify(payload["messages"])).toContain("яйця");
    expect(JSON.stringify(payload["messages"])).toContain("гречка");
  });

  it("falls back to default labels for malformed day entries", async () => {
    anthropicMessages.mockResolvedValueOnce(
      anthropicResponses.text(
        JSON.stringify({
          days: [null, { meals: ["сніданок"] }],
          shoppingList: ["молоко"],
        }),
      ),
    );

    const res = makeRes();
    await handler(makeReq({ pantry: [], locale: "uk-UA" }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      plan: {
        days: [
          { label: "День 1", note: "", meals: [] },
          { label: "День 2", note: "", meals: ["сніданок"] },
        ],
        shoppingList: ["молоко"],
      },
      rawText: null,
    });
  });

  it("returns raw text when Anthropic emits invalid JSON", async () => {
    anthropicMessages.mockResolvedValueOnce(
      anthropicResponses.text("не json відповідь"),
    );

    const res = makeRes();
    await handler(makeReq({ pantry: ["рис"], locale: "uk-UA" }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      plan: { days: [], shoppingList: [] },
      rawText: "не json відповідь",
    });
  });

  it("returns 400 for invalid pantry item without calling Anthropic", async () => {
    const res = makeRes();

    await handler(
      makeReq({ pantry: [{ name: "x", qty: {} }], locale: "uk-UA" }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: "Некоректні дані запиту" });
    expect(anthropicMessages).not.toHaveBeenCalled();
  });

  it("throws ExternalServiceError when Anthropic returns non-ok response", async () => {
    anthropicMessages.mockResolvedValueOnce({
      response: { ok: false, status: 500 },
      data: { error: { message: "model failed" } },
    });

    await expect(
      handler(makeReq({ pantry: ["гречка"], locale: "uk-UA" }), makeRes()),
    ).rejects.toMatchObject({
      name: "ExternalServiceError",
      message: "model failed",
      status: 500,
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
