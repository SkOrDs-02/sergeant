import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { Request, Response } from "express";
import { anthropicError } from "../../test/__mocks__/anthropic.js";

vi.mock("../../lib/llm/provider.js", () => ({
  getLLMProvider: vi.fn(() => ({ name: "stub" })),
  invokeLLM: vi.fn(),
}));

import { invokeLLM as _invokeLLM } from "../../lib/llm/provider.js";
import handler from "./shopping-list.js";

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
  vi.spyOn(Date, "now").mockReturnValue(1_778_000_000_000);
  vi.spyOn(Math, "random").mockReturnValue(0.123456);
});

describe("shopping-list handler", () => {
  it("normalizes categories and de-duplicates items by name", async () => {
    invokeLLM.mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({
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
    });

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

    const opts = asRecord(invokeLLM.mock.calls[0]?.[1]);
    expect(JSON.stringify(opts["messages"])).toContain(
      "• Грибний омлет: печериці, яйця, кефір",
    );
    expect(JSON.stringify(opts["messages"])).toContain("яйця");
  });

  it("builds ingredient prompt from weekPlan when recipes are absent", async () => {
    invokeLLM.mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({
        categories: [
          {
            name: "Крупи та злаки",
            items: [{ name: "Рис", quantity: "500 г", note: "" }],
          },
        ],
      }),
    });

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
    const opts = asRecord(invokeLLM.mock.calls[0]?.[1]);
    expect(JSON.stringify(opts["messages"])).toContain(
      "• Пн: сніданок — омлет; обід — рис",
    );
    expect(JSON.stringify(opts["messages"])).toContain("нічого");
  });

  it("throws ValidationError when neither recipes nor weekPlan are useful", async () => {
    await expect(
      handler(makeReq({ pantryItems: [], locale: "uk-UA" }), makeRes()),
    ).rejects.toMatchObject({
      name: "ValidationError",
      message: "Потрібно передати рецепти або тижневий план.",
    });
    expect(invokeLLM).not.toHaveBeenCalled();
  });

  it("returns raw text when no shopping items survive normalization", async () => {
    invokeLLM.mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({ categories: [{ items: [] }] }),
    });

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

  it("throws ValidationError for invalid oversized recipe payload", async () => {
    await expect(
      handler(
        makeReq({
          recipes: [
            { title: "x", ingredients: Array.from({ length: 51 }, () => "x") },
          ],
          locale: "uk-UA",
        }),
        makeRes(),
      ),
    ).rejects.toMatchObject({
      name: "ValidationError",
      message: "Некоректні дані запиту",
    });
    expect(invokeLLM).not.toHaveBeenCalled();
  });

  it("throws ExternalServiceError for a non-ok provider response", async () => {
    invokeLLM.mockResolvedValueOnce({
      ok: false,
      error: "quota exceeded",
      status: 429,
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
      message: "Асистент тимчасово недоступний. Спробуй пізніше.",
      status: 429,
      code: "ANTHROPIC_ERROR",
    });
  });

  it("propagates rejected provider transport errors", async () => {
    invokeLLM.mockRejectedValueOnce(
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

  it("skips non-object categories and items during normalization", async () => {
    invokeLLM.mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({
        categories: [
          null,
          {
            name: "Яйця",
            items: [null, { name: "Яйця", quantity: "10 шт", note: "свіжі" }],
          },
          { name: "Порожня", items: [] },
        ],
      }),
    });

    const res = makeRes();
    await handler(
      makeReq({
        recipes: [{ title: "Омлет", ingredients: ["яйця"] }],
        locale: "uk-UA",
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      categories: [
        {
          name: "Яйця",
          items: [
            expect.objectContaining({
              name: "Яйця",
              quantity: "10 шт",
              note: "свіжі",
            }),
          ],
        },
      ],
      rawText: null,
    });
  });

  it("passes userId to the provider when session user is present", async () => {
    invokeLLM.mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({
        categories: [
          {
            name: "Яйця",
            items: [{ name: "Яйця", quantity: "6 шт", note: "" }],
          },
        ],
      }),
    });

    await handler(
      {
        anthropicKey: "test-anthropic-key",
        body: {
          recipes: [{ title: "Омлет", ingredients: ["яйця"] }],
          locale: "uk-UA",
        },
        user: { id: "u_shopping" },
      } as unknown as Request,
      makeRes(),
    );

    const opts = asRecord(invokeLLM.mock.calls[0]?.[1]);
    expect(opts["userId"]).toBe("u_shopping");
  });
});
