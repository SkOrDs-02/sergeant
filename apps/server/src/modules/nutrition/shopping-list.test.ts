import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { Request, Response } from "express";
import { anthropicError } from "../../test/__mocks__/anthropic.js";

vi.mock("../../lib/llm/provider.js", () => ({
  getLLMProvider: vi.fn(() => ({ name: "stub" })),
  invokeLLM: vi.fn(),
}));

import { PANTRY_CATEGORY_LABELS } from "@sergeant/shared/data/pantryCategories";

import { invokeLLM as _invokeLLM } from "../../lib/llm/provider.js";
import handler, { SYSTEM, buildShoppingListPrompt } from "./shopping-list.js";

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
});

describe("shopping-list handler", () => {
  it("normalizes categories and de-duplicates items by name", async () => {
    invokeLLM.mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({
        categories: [
          {
            name: "Овочі",
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
          name: "Овочі",
          items: [
            {
              id: expect.stringMatching(
                /^si_1778000000000_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
              ),
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
              id: expect.stringMatching(
                /^si_1778000000000_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
              ),
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

    const categories = (
      res.body as { categories: { items: { id: string }[] }[] }
    ).categories;
    const itemIds = categories.flatMap((category) =>
      category.items.map((item) => item.id),
    );
    expect(new Set(itemIds).size).toBe(itemIds.length);

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
            name: "Крупи та хліб",
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
      categories: [{ name: "Крупи та хліб" }],
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
      status: 503,
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
            name: "Молочні та яйця",
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
          name: "Молочні та яйця",
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
            name: "Молочні та яйця",
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

// Одна таксономія Харчування (рішення власника 2026-10-01, n3): промпт просить
// у моделі категорії комори, а не власні 11 назв. Перелік береться з реєстру
// `@sergeant/shared` (його ж бере каталог комори), копії в промпті немає.
describe("shopping-list prompt - категорії комори", () => {
  const labels = Object.values(PANTRY_CATEGORY_LABELS);

  it("перелік у промпті - рівно мітки реєстру категорій комори, у порядку реєстру", () => {
    const listLine = `${labels.map((label) => `"${label}"`).join(", ")}`;
    expect(SYSTEM).toContain(listLine);
    expect(SYSTEM).toContain('"Спреди та намазки"');
    expect(SYSTEM).toContain('"Інше"');
  });

  it.each([
    "Мʼясо та риба",
    "Хлібобулочні вироби",
    "Приправи та соуси",
    "Овочі та гриби",
    "Олії та жири",
    "Крупи та злаки",
    "Молочні продукти",
  ])("старої назви «%s» у промпті немає", (legacy) => {
    expect(SYSTEM).not.toContain(`"${legacy}"`);
  });

  it("кожне правило класифікації називає лише мітки з переліку", () => {
    const ruled = [...SYSTEM.matchAll(/→ "([^"]+)"/g)].map((m) => m[1]);
    expect(ruled.length).toBeGreaterThan(0);
    for (const label of ruled) expect(labels).toContain(label);
  });

  it("user-частина промпту не несе перелік категорій удруге", () => {
    const { system, user } = buildShoppingListPrompt({
      recipes: [{ title: "Омлет", ingredients: ["яйця"] }],
      locale: "uk-UA",
    } as never);
    expect(system).toBe(SYSTEM);
    expect(user).not.toContain("Спреди та намазки");
  });

  it("форма відповіді не змінилась: назву категорії віддаємо як є", async () => {
    invokeLLM.mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({
        categories: [
          {
            // Стара модель чи старий кеш можуть віддати стару назву: клієнт
            // зводить її до категорії комори за назвою позиції.
            name: "Мʼясо та риба",
            items: [{ name: "Лосось", quantity: "300 г", note: "" }],
          },
          {
            name: "Спреди та намазки",
            items: [{ name: "Арахісова паста", quantity: "1 шт", note: "" }],
          },
        ],
      }),
    });

    const res = makeRes();
    await handler(
      makeReq({
        recipes: [{ title: "Сендвіч", ingredients: ["лосось", "паста"] }],
        locale: "uk-UA",
      }),
      res,
    );

    const body = res.body as { categories: Array<{ name: string }> };
    expect(body.categories.map((c) => c.name)).toEqual([
      "Мʼясо та риба",
      "Спреди та намазки",
    ]);
  });
});
