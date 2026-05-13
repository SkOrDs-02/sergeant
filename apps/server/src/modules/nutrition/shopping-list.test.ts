import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { Request, Response } from "express";
import {
  anthropicError,
  anthropicResponses,
  createAnthropicMockHandle,
} from "../../test/__mocks__/anthropic.js";

vi.mock("../../lib/anthropic.js", () => createAnthropicMockHandle());

import { anthropicMessages as anthropicMessagesMock } from "../../lib/anthropic.js";
import handler from "./shopping-list.js";

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
  vi.spyOn(Date, "now").mockReturnValue(1_778_000_000_000);
  vi.spyOn(Math, "random").mockReturnValue(0.123456);
});

describe("shopping-list handler", () => {
  it("normalizes categories and de-duplicates items by name", async () => {
    anthropicMessages.mockResolvedValueOnce(
      anthropicResponses.text(
        JSON.stringify({
          categories: [
            {
              name: "Овочі та гриби",
              items: [
                { name: "Печериці", quantity: "400 г", note: "свіжі" },
                { name: " печериці ", quantity: "200 г", note: "дублікат" },
                { name: "", quantity: "1 шт", note: "skip" },
              ],
            },
            {
              name: "",
              items: [{ name: "Кефір", quantity: "1 л", note: "" }],
            },
          ],
        }),
      ),
    );

    const res = makeRes();
    await handler(
      makeReq({
        recipes: [
          {
            title: "Грибний омлет",
            ingredients: ["печериці", "яйця", "кефір"],
          },
        ],
        pantryItems: [{ name: "яйця", qty: 6, unit: "шт" }],
        locale: "uk-UA",
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      categories: [
        {
          name: "Овочі та гриби",
          items: [
            {
              id: "si_1778000000000_4fzyo8",
              name: "Печериці",
              quantity: "400 г",
              note: "свіжі",
              checked: false,
            },
          ],
        },
        {
          name: "Інше",
          items: [
            {
              id: "si_1778000000000_4fzyo8",
              name: "Кефір",
              quantity: "1 л",
              note: "",
              checked: false,
            },
          ],
        },
      ],
      rawText: null,
    });

    const payload = asRecord(anthropicMessages.mock.calls[0]?.[1]);
    expect(JSON.stringify(payload["messages"])).toContain(
      "• Грибний омлет: печериці, яйця, кефір",
    );
    expect(JSON.stringify(payload["messages"])).toContain("яйця");
  });

  it("builds ingredient prompt from weekPlan when recipes are absent", async () => {
    anthropicMessages.mockResolvedValueOnce(
      anthropicResponses.text(
        JSON.stringify({
          categories: [
            {
              name: "Крупи та злаки",
              items: [{ name: "Рис", quantity: "500 г", note: "" }],
            },
          ],
        }),
      ),
    );

    const res = makeRes();
    await handler(
      makeReq({
        weekPlan: {
          days: [{ label: "Пн", meals: ["сніданок — омлет", "обід — рис"] }],
        },
        locale: "uk-UA",
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      categories: [{ name: "Крупи та злаки" }],
    });
    const payload = asRecord(anthropicMessages.mock.calls[0]?.[1]);
    expect(JSON.stringify(payload["messages"])).toContain(
      "• Пн: сніданок — омлет; обід — рис",
    );
    expect(JSON.stringify(payload["messages"])).toContain("нічого");
  });

  it("throws ValidationError when neither recipes nor weekPlan are useful", async () => {
    await expect(
      handler(makeReq({ pantryItems: [], locale: "uk-UA" }), makeRes()),
    ).rejects.toMatchObject({
      name: "ValidationError",
      message: "Потрібно передати рецепти або тижневий план.",
    });
    expect(anthropicMessages).not.toHaveBeenCalled();
  });

  it("returns raw text when no shopping items survive normalization", async () => {
    anthropicMessages.mockResolvedValueOnce(
      anthropicResponses.text(JSON.stringify({ categories: [{ items: [] }] })),
    );

    const res = makeRes();
    await handler(
      makeReq({
        recipes: [{ title: "Омлет", ingredients: ["яйця"] }],
        locale: "uk-UA",
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      categories: [],
      rawText: '{"categories":[{"items":[]}]}',
    });
  });

  it("returns 400 for invalid oversized recipe payload", async () => {
    const res = makeRes();

    await handler(
      makeReq({
        recipes: [
          { title: "x", ingredients: Array.from({ length: 51 }, () => "x") },
        ],
        locale: "uk-UA",
      }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: "Некоректні дані запиту" });
    expect(anthropicMessages).not.toHaveBeenCalled();
  });

  it("throws ExternalServiceError for non-ok Anthropic response", async () => {
    anthropicMessages.mockResolvedValueOnce({
      response: { ok: false, status: 429 },
      data: { error: { message: "quota exceeded" } },
    });

    await expect(
      handler(
        makeReq({
          recipes: [{ title: "Омлет", ingredients: ["яйця"] }],
          locale: "uk-UA",
        }),
        makeRes(),
      ),
    ).rejects.toMatchObject({
      name: "ExternalServiceError",
      message: "quota exceeded",
      status: 429,
      code: "ANTHROPIC_ERROR",
    });
  });

  it("propagates rejected Anthropic transport errors", async () => {
    anthropicMessages.mockRejectedValueOnce(
      anthropicError("network down", { status: 502 }),
    );

    await expect(
      handler(
        makeReq({
          recipes: [{ title: "Омлет", ingredients: ["яйця"] }],
          locale: "uk-UA",
        }),
        makeRes(),
      ),
    ).rejects.toMatchObject({ name: "ExternalServiceError" });
  });
});
