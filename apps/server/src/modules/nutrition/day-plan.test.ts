import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import type { Request, Response } from "express";
import { PANTRY_ONLY_EMPTY_MESSAGE } from "@sergeant/shared";

vi.mock("../../lib/llm/provider.js", () => ({
  getLLMProvider: vi.fn(() => ({ name: "stub" })),
  invokeLLM: vi.fn(),
}));

import { invokeLLM as _invokeLLM } from "../../lib/llm/provider.js";
import handler from "./day-plan.js";

const invokeLLM = _invokeLLM as unknown as Mock;

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
  invokeLLM.mockReset();
});

describe("nutrition day-plan handler", () => {
  it("returns a normalized day plan from provider JSON", async () => {
    invokeLLM.mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({
        meals: [
          {
            type: "breakfast",
            label: "Сніданок",
            name: "Вівсянка",
            description: "З ягодами",
            ingredients: ["вівсянка 60 г", "йогурт 150 г"],
            kcal: "420",
            protein_g: 24,
            fat_g: 12,
            carbs_g: 58,
          },
        ],
        totalKcal: "420",
        totalProtein_g: 24,
        totalFat_g: 12,
        totalCarbs_g: 58,
        note: "Додай ще овочі в обід.",
      }),
    });

    const res = makeRes();
    await handler(
      makeReq({
        pantry: [{ name: "вівсянка", qty: 500, unit: "г" }],
        targets: {
          kcal: 1900,
          protein_g: 110,
          fat_g: 60,
          carbs_g: 210,
        },
        locale: "uk-UA",
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      plan: {
        meals: [
          {
            type: "breakfast",
            label: "Сніданок",
            name: "Вівсянка",
            description: "З ягодами",
            ingredients: ["вівсянка 60 г", "йогурт 150 г"],
            kcal: 420,
            protein_g: 24,
            fat_g: 12,
            carbs_g: 58,
          },
        ],
        totalKcal: 420,
        totalProtein_g: 24,
        totalFat_g: 12,
        totalCarbs_g: 58,
        note: "Додай ще овочі в обід.",
      },
      rawText: null,
    });
    expect(invokeLLM).toHaveBeenCalledTimes(1);
    const opts = asRecord(invokeLLM.mock.calls[0]?.[1]);
    expect(opts["model"]).toBe("claude-sonnet-4-6");
    expect(opts["temperature"]).toBe(0.3);
    expect(opts["system"]).toEqual(expect.stringContaining("Ти нутріціолог"));
    expect(opts["messages"]).toEqual([
      {
        role: "user",
        content: expect.stringContaining("вівсянка — 500 г"),
      },
    ]);
    expect(opts).toMatchObject({ timeoutMs: 30000, endpoint: "day-plan" });
  });

  it("normalizes malformed meal fields and exposes raw text when no meals survive", async () => {
    invokeLLM.mockResolvedValueOnce({
      ok: true,
      text: '{"meals":[{"type":"brunch","ingredients":"x"}]}',
    });

    const res = makeRes();
    await handler(makeReq({ pantry: [], locale: "uk-UA" }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      plan: {
        meals: [
          {
            type: "snack",
            label: "Перекус",
            name: "",
            description: "",
            ingredients: [],
            kcal: null,
          },
        ],
      },
      rawText: null,
    });

    invokeLLM.mockResolvedValueOnce({ ok: true, text: "{}" });
    const emptyRes = makeRes();
    await handler(makeReq({ pantry: [], locale: "uk-UA" }), emptyRes);

    expect(asRecord(emptyRes.body)["rawText"]).toBe("{}");
  });

  it("limits normalized meals to six entries", async () => {
    invokeLLM.mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({
        meals: Array.from({ length: 8 }, (_, index) => ({
          type: "snack",
          name: `Перекус ${index + 1}`,
        })),
      }),
    });

    const res = makeRes();
    await handler(makeReq({ pantry: [], locale: "uk-UA" }), res);

    const plan = asRecord(asRecord(res.body)["plan"]);
    expect(plan["meals"]).toHaveLength(6);
  });

  it("throws ValidationError and skips the provider for invalid args", async () => {
    await expect(
      handler(
        makeReq({ regenerateMealType: "brunch", locale: "uk-UA" }),
        makeRes(),
      ),
    ).rejects.toMatchObject({
      name: "ValidationError",
      message: "Некоректні дані запиту",
    });
    expect(invokeLLM).not.toHaveBeenCalled();
  });

  it("passes regenerateMealType into the prompt", async () => {
    invokeLLM.mockResolvedValueOnce({ ok: true, text: '{"meals":[]}' });

    await handler(
      makeReq({
        regenerateMealType: "dinner",
        locale: "uk-UA",
      }),
      makeRes(),
    );

    const opts = asRecord(invokeLLM.mock.calls[0]?.[1]);
    const messages = opts["messages"] as Array<{ content: string }>;
    expect(messages[0]?.content).toContain('ТІЛЬКИ прийом їжі типу: "dinner"');
  });

  it("throws ExternalServiceError when the provider returns an error result", async () => {
    invokeLLM.mockResolvedValueOnce({
      ok: false,
      error: "quota exceeded",
      status: 429,
    });

    await expect(
      handler(makeReq({ pantry: [], locale: "uk-UA" }), makeRes()),
    ).rejects.toMatchObject({
      name: "ExternalServiceError",
      message: "Асистент тимчасово недоступний. Спробуй пізніше.",
      status: 503,
      code: "ANTHROPIC_ERROR",
    });
  });

  it("uses default targets prompt when kcal target is absent", async () => {
    invokeLLM.mockResolvedValueOnce({ ok: true, text: '{"meals":[]}' });

    await handler(
      makeReq({
        targets: { protein_g: 100 },
        pantry: [],
        locale: "uk-UA",
      }),
      makeRes(),
    );

    const opts = asRecord(invokeLLM.mock.calls[0]?.[1]);
    const messages = opts["messages"] as Array<{ content: string }>;
    expect(messages[0]?.content).toContain("Цілі не задані");
  });

  it("filters null meal entries from normalization", async () => {
    invokeLLM.mockResolvedValueOnce({
      ok: true,
      text: '{"meals":[null,{"type":"lunch","name":"Суп","label":"Обід"}]}',
    });

    const res = makeRes();
    await handler(makeReq({ pantry: [], locale: "uk-UA" }), res);

    const plan = asRecord(asRecord(res.body)["plan"]);
    expect(plan["meals"]).toEqual([
      expect.objectContaining({ type: "lunch", name: "Суп" }),
    ]);
  });

  it("pantryMode=ignore прибирає комору і з user-, і з system-промпту", async () => {
    // Репорт founder-а: у пікері обрано «не враховувати комору», а план усе
    // одно спирався на комору. Причина була двошарова — параметр не доїжджав
    // до сервера ВЗАГАЛІ, а system-промпт беззастережно просив
    // «використовувати продукти з наявного списку».
    invokeLLM.mockResolvedValueOnce({ ok: true, text: '{"meals":[]}' });

    await handler(
      makeReq({
        pantry: [{ name: "вівсянка", qty: 500, unit: "г" }],
        pantryMode: "ignore",
        locale: "uk-UA",
      }),
      makeRes(),
    );

    const opts = asRecord(invokeLLM.mock.calls[0]?.[1]);
    const messages = opts["messages"] as Array<{ content: string }>;
    expect(messages[0]?.content).not.toContain("вівсянка");
    expect(messages[0]?.content).toContain("Комору НЕ враховуй");
    expect(String(opts["system"])).not.toContain(
      "Намагайся використовувати продукти з наявного списку",
    );
    expect(String(opts["system"])).toContain("Комору НЕ враховуй");
  });

  it("pantryMode=only просить рівно наявне", async () => {
    invokeLLM.mockResolvedValueOnce({ ok: true, text: '{"meals":[]}' });

    await handler(
      makeReq({
        pantry: [{ name: "вівсянка", qty: 500, unit: "г" }],
        pantryMode: "only",
        locale: "uk-UA",
      }),
      makeRes(),
    );

    const opts = asRecord(invokeLLM.mock.calls[0]?.[1]);
    const messages = opts["messages"] as Array<{ content: string }>;
    expect(messages[0]?.content).toContain("вівсянка — 500 г");
    expect(String(opts["system"])).toContain("Використовуй ТІЛЬКИ продукти");
    expect(String(opts["system"])).toContain("відсутніх продуктів не додавай");
  });

  it.each([
    ["порожній масив", [] as unknown[]],
    ["поле відсутнє", undefined],
    ["позиції без назви", [{}, { name: "" }, ""] as unknown[]],
  ])(
    "pantryMode=only з порожньою коморою (%s) не запускає LLM",
    async (_label, pantry) => {
      await expect(
        handler(
          makeReq({ pantry, pantryMode: "only", locale: "uk-UA" }),
          makeRes(),
        ),
      ).rejects.toMatchObject({
        status: 400,
        code: "VALIDATION",
        message: PANTRY_ONLY_EMPTY_MESSAGE,
      });
      expect(invokeLLM).not.toHaveBeenCalled();
    },
  );

  it("без pantryMode поведінка лишається історичною (prefer)", async () => {
    invokeLLM.mockResolvedValueOnce({ ok: true, text: '{"meals":[]}' });

    await handler(
      makeReq({
        pantry: [{ name: "вівсянка", qty: 500, unit: "г" }],
        locale: "uk-UA",
      }),
      makeRes(),
    );

    const opts = asRecord(invokeLLM.mock.calls[0]?.[1]);
    const messages = opts["messages"] as Array<{ content: string }>;
    expect(messages[0]?.content).toContain("вівсянка — 500 г");
    expect(String(opts["system"])).toContain(
      "Намагайся використовувати продукти з наявного списку",
    );
  });

  // Прогін живого генератора 2026-09-01 повернув прийоми на 166 г
  // вуглеводів при заявлених моделлю 171. Тотали більше не беруться на
  // віру: рахуємо їх із прийомів, що реально лишились у плані.
  describe("тотали рахуються з прийомів, а не беруться від моделі", () => {
    function mealOf(kcal: number, p: number, f: number, c: number) {
      return {
        type: "snack",
        label: "Перекус",
        name: `Страва ${String(kcal)}`,
        description: "",
        ingredients: [],
        kcal,
        protein_g: p,
        fat_g: f,
        carbs_g: c,
      };
    }

    it("арифметична помилка моделі не доїжджає до користувача", async () => {
      invokeLLM.mockResolvedValueOnce({
        ok: true,
        text: JSON.stringify({
          meals: [mealOf(350, 30, 20, 10), mealOf(650, 55, 10, 80)],
          totalKcal: 1900,
          totalProtein_g: 162,
          totalFat_g: 60,
          totalCarbs_g: 171,
          note: "",
        }),
      });

      const res = makeRes();
      await handler(makeReq({ pantry: [], locale: "uk-UA" }), res);

      const plan = asRecord(asRecord(res.body)["plan"]);
      expect(plan["totalKcal"]).toBe(1000);
      expect(plan["totalProtein_g"]).toBe(85);
      expect(plan["totalFat_g"]).toBe(30);
      expect(plan["totalCarbs_g"]).toBe(90);
    });

    it("прийоми понад ліміт відрізаються разом зі своїм внеском у підсумок", async () => {
      invokeLLM.mockResolvedValueOnce({
        ok: true,
        text: JSON.stringify({
          meals: Array.from({ length: 8 }, () => mealOf(100, 10, 5, 20)),
          totalKcal: 800,
          totalProtein_g: 80,
          totalFat_g: 40,
          totalCarbs_g: 160,
          note: "",
        }),
      });

      const res = makeRes();
      await handler(makeReq({ pantry: [], locale: "uk-UA" }), res);

      const plan = asRecord(asRecord(res.body)["plan"]);
      expect((plan["meals"] as unknown[]).length).toBe(6);
      expect(plan["totalKcal"]).toBe(600);
      expect(plan["totalCarbs_g"]).toBe(120);
    });

    it("дірка в макросі лишає число моделі — занижена сума гірша", async () => {
      invokeLLM.mockResolvedValueOnce({
        ok: true,
        text: JSON.stringify({
          meals: [
            mealOf(350, 30, 20, 10),
            { ...mealOf(650, 55, 10, 80), protein_g: null },
          ],
          totalKcal: 1000,
          totalProtein_g: 85,
          totalFat_g: 30,
          totalCarbs_g: 90,
          note: "",
        }),
      });

      const res = makeRes();
      await handler(makeReq({ pantry: [], locale: "uk-UA" }), res);

      const plan = asRecord(asRecord(res.body)["plan"]);
      expect(plan["totalProtein_g"]).toBe(85);
      expect(plan["totalKcal"]).toBe(1000);
    });
  });

  it("passes userId to the provider when session user is present", async () => {
    invokeLLM.mockResolvedValueOnce({ ok: true, text: '{"meals":[]}' });

    await handler(
      {
        anthropicKey: "sk-test",
        body: { pantry: [], locale: "uk-UA" },
        user: { id: "u_day_plan" },
      } as unknown as Request,
      makeRes(),
    );

    const opts = asRecord(invokeLLM.mock.calls[0]?.[1]);
    expect(opts["userId"]).toBe("u_day_plan");
  });
});
