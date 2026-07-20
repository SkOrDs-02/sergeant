import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import type { Request, Response } from "express";

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
      status: 429,
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
