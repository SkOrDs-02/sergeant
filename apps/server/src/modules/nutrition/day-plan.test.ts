import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import type { Request, Response } from "express";
import {
  anthropicResponses,
  createAnthropicMockHandle,
} from "../../test/__mocks__/anthropic.js";

vi.mock("../../lib/anthropic.js", () => createAnthropicMockHandle());

import { anthropicMessages as _anthropicMessages } from "../../lib/anthropic.js";
import handler from "./day-plan.js";

const anthropicMessages = _anthropicMessages as unknown as Mock;

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
  anthropicMessages.mockReset();
});

describe("nutrition day-plan handler", () => {
  it("returns a normalized day plan from Anthropic JSON", async () => {
    anthropicMessages.mockResolvedValueOnce(
      anthropicResponses.text(
        JSON.stringify({
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
      ),
    );

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
    expect(anthropicMessages).toHaveBeenCalledTimes(1);
    const payload = asRecord(anthropicMessages.mock.calls[0]?.[1]);
    expect(payload["model"]).toBe("claude-sonnet-4-6");
    expect(payload["temperature"]).toBe(0.3);
    expect(payload["system"]).toEqual(
      expect.stringContaining("Ти нутріціолог"),
    );
    expect(payload["messages"]).toEqual([
      {
        role: "user",
        content: expect.stringContaining("вівсянка — 500 г"),
      },
    ]);
    const options = asRecord(anthropicMessages.mock.calls[0]?.[2]);
    expect(options).toMatchObject({ timeoutMs: 30000, endpoint: "day-plan" });
  });

  it("normalizes malformed meal fields and exposes raw text when no meals survive", async () => {
    anthropicMessages.mockResolvedValueOnce(
      anthropicResponses.text(
        '{"meals":[{"type":"brunch","ingredients":"x"}]}',
      ),
    );

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

    anthropicMessages.mockResolvedValueOnce(anthropicResponses.text("{}"));
    const emptyRes = makeRes();
    await handler(makeReq({ pantry: [], locale: "uk-UA" }), emptyRes);

    expect(asRecord(emptyRes.body)["rawText"]).toBe("{}");
  });

  it("limits normalized meals to six entries", async () => {
    anthropicMessages.mockResolvedValueOnce(
      anthropicResponses.text(
        JSON.stringify({
          meals: Array.from({ length: 8 }, (_, index) => ({
            type: "snack",
            name: `Перекус ${index + 1}`,
          })),
        }),
      ),
    );

    const res = makeRes();
    await handler(makeReq({ pantry: [], locale: "uk-UA" }), res);

    const plan = asRecord(asRecord(res.body)["plan"]);
    expect(plan["meals"]).toHaveLength(6);
  });

  it("returns a validation response and skips Anthropic for invalid args", async () => {
    const res = makeRes();

    await handler(
      makeReq({ regenerateMealType: "brunch", locale: "uk-UA" }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: "Некоректні дані запиту" });
    expect(anthropicMessages).not.toHaveBeenCalled();
  });

  it("passes regenerateMealType into the prompt", async () => {
    anthropicMessages.mockResolvedValueOnce(
      anthropicResponses.text('{"meals":[]}'),
    );

    await handler(
      makeReq({
        regenerateMealType: "dinner",
        locale: "uk-UA",
      }),
      makeRes(),
    );

    const payload = asRecord(anthropicMessages.mock.calls[0]?.[1]);
    const messages = payload["messages"] as Array<{ content: string }>;
    expect(messages[0]?.content).toContain('ТІЛЬКИ прийом їжі типу: "dinner"');
  });

  it("throws ExternalServiceError when Anthropic returns an error response", async () => {
    anthropicMessages.mockResolvedValueOnce({
      response: { ok: false, status: 429 },
      data: { error: { message: "quota exceeded" } },
    });

    await expect(
      handler(makeReq({ pantry: [], locale: "uk-UA" }), makeRes()),
    ).rejects.toMatchObject({
      name: "ExternalServiceError",
      message: "quota exceeded",
      status: 429,
      code: "ANTHROPIC_ERROR",
    });
  });
});
