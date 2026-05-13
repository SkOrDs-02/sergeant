import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import type { Request, Response } from "express";
import {
  anthropicResponses,
  createAnthropicMockHandle,
} from "../../test/__mocks__/anthropic.js";

vi.mock("../../lib/anthropic.js", () => createAnthropicMockHandle());

import { anthropicMessages as _anthropicMessages } from "../../lib/anthropic.js";
import handler from "./day-hint.js";

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

describe("nutrition day-hint handler", () => {
  it("returns a normalized hint from Anthropic JSON", async () => {
    anthropicMessages.mockResolvedValueOnce(
      anthropicResponses.text('{"hint":"Додай білок до вечері."}'),
    );

    const res = makeRes();
    await handler(
      makeReq({
        macros: { kcal: 1600, protein_g: 90, fat_g: 50, carbs_g: 180 },
        targets: {
          dailyTargetKcal: 2000,
          dailyTargetProtein_g: 120,
          dailyTargetFat_g: 70,
          dailyTargetCarbs_g: 220,
        },
        hasMeals: true,
        hasAnyMacros: true,
        macroSources: { manual: 2, ai: 1 },
        locale: "uk-UA",
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ hint: "Додай білок до вечері." });
    expect(anthropicMessages).toHaveBeenCalledTimes(1);
    expect(anthropicMessages.mock.calls[0]?.[0]).toBe("sk-test");
    const payload = asRecord(anthropicMessages.mock.calls[0]?.[1]);
    expect(payload["model"]).toBe("claude-sonnet-4-6");
    expect(payload["temperature"]).toBe(0.3);
    expect(payload["messages"]).toEqual([
      {
        role: "user",
        content: expect.stringContaining("Мова: uk-UA"),
      },
    ]);
    const options = asRecord(anthropicMessages.mock.calls[0]?.[2]);
    expect(options).toMatchObject({ timeoutMs: 20000, endpoint: "day-hint" });
  });

  it("truncates long hints returned in JSON", async () => {
    const longHint = "а".repeat(1300);
    anthropicMessages.mockResolvedValueOnce(
      anthropicResponses.text(JSON.stringify({ hint: longHint })),
    );

    const res = makeRes();
    await handler(makeReq({ macros: {}, locale: "uk-UA" }), res);

    expect(res.statusCode).toBe(200);
    expect(asRecord(res.body)["hint"]).toBe(longHint.slice(0, 1200));
  });

  it("returns the default hint when Anthropic text has no JSON payload", async () => {
    anthropicMessages.mockResolvedValueOnce(
      anthropicResponses.text("Порада без JSON"),
    );

    const res = makeRes();
    await handler(makeReq({ macros: {}, locale: "uk-UA" }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ hint: "Не вдалося сформувати підказку." });
  });

  it("returns a validation response and skips Anthropic for invalid args", async () => {
    const res = makeRes();

    await handler(makeReq({ locale: "u" }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: "Некоректні дані запиту" });
    expect(anthropicMessages).not.toHaveBeenCalled();
  });

  it("throws ExternalServiceError when Anthropic returns an error response", async () => {
    anthropicMessages.mockResolvedValueOnce({
      response: { ok: false, status: 503 },
      data: { error: { message: "overloaded" } },
    });

    await expect(
      handler(makeReq({ macros: {}, locale: "uk-UA" }), makeRes()),
    ).rejects.toMatchObject({
      name: "ExternalServiceError",
      message: "overloaded",
      status: 503,
      code: "ANTHROPIC_ERROR",
    });
  });

  it("adds no-macro and macro-source context to the prompt", async () => {
    anthropicMessages.mockResolvedValueOnce(
      anthropicResponses.text('{"hint":"Заповни КБЖВ для страв."}'),
    );

    await handler(
      makeReq({
        macros: {},
        hasMeals: true,
        hasAnyMacros: false,
        macroSources: { ai: 3 },
        locale: "uk-UA",
      }),
      makeRes(),
    );

    const payload = asRecord(anthropicMessages.mock.calls[0]?.[1]);
    const messages = payload["messages"] as Array<{ content: string }>;
    expect(messages[0]?.content).toContain("без КБЖВ");
    expect(messages[0]?.content).toContain('"ai":3');
  });
});
