import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import type { Request, Response } from "express";

vi.mock("../../lib/anthropic.js", () => ({
  anthropicMessages: vi.fn(),
  extractAnthropicText: vi.fn(
    (d: { content?: { type: string; text?: string }[] }) =>
      (d?.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("\n")
        .trim(),
  ),
}));

vi.mock("../ai-memory/ingestQueue.js", () => ({
  enqueueMemoryIngest: vi.fn(async () => undefined),
}));

import { anthropicMessages as _anthropicMessages } from "../../lib/anthropic.js";
import { enqueueMemoryIngest as _enqueueMemoryIngest } from "../ai-memory/ingestQueue.js";
import handler from "./weekly-digest.js";
import { ExternalServiceError, ValidationError } from "../../obs/errors.js";

const anthropicMessages = _anthropicMessages as unknown as Mock;
const enqueueMemoryIngest = _enqueueMemoryIngest as unknown as Mock;

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
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as TestRes & Response;
}

interface ReqShape {
  body: Record<string, unknown>;
  anthropicKey?: string;
  user?: { id: string };
}

function asReq(v: ReqShape): Request {
  return v as unknown as Request;
}

const validReport = {
  finyk: {
    summary: "Витрати тижня в межах бюджету.",
    comment: "Топ-категорія — продукти, але без різких аномалій.",
    recommendations: ["Збережи темп витрат", "Перевір категорію 'кава'"],
  },
  fizruk: null,
  nutrition: null,
  routine: null,
  overallRecommendations: ["Підвищ дисципліну сну"],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("weekly-digest handler · validation", () => {
  it("400 коли body не валідне (заборонене поле або неправильний тип)", async () => {
    const req = asReq({
      anthropicKey: "k",
      body: { weekRange: 1 as unknown as string }, // weekRange має бути string
    });
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(anthropicMessages).not.toHaveBeenCalled();
    expect((res.body as { error: string }).error).toBe(
      "Некоректні дані запиту",
    );
  });

  it("ValidationError якщо немає жодної секції (порожній звіт)", async () => {
    const req = asReq({ anthropicKey: "k", body: { weekRange: "2026-W01" } });
    const res = makeRes();

    await expect(handler(req, res)).rejects.toBeInstanceOf(ValidationError);
    expect(anthropicMessages).not.toHaveBeenCalled();
  });
});

describe("weekly-digest handler · prompt assembly", () => {
  function setupAnthropicSuccess(report: unknown = validReport) {
    anthropicMessages.mockResolvedValue({
      response: { ok: true, status: 200 } as unknown as Response,
      data: {
        content: [{ type: "text", text: JSON.stringify(report) }],
      },
    });
  }

  it("finyk-секція додає всі поля у системний промпт", async () => {
    setupAnthropicSuccess();
    const req = asReq({
      anthropicKey: "k",
      body: {
        weekRange: "2026-W01",
        finyk: {
          totalSpent: 1200,
          totalIncome: 4000,
          monthlyBudget: 8000,
          txCount: 42,
          topCategories: [
            { name: "Продукти", amount: 600 },
            { name: "Транспорт", amount: 200 },
          ],
        },
      },
    });
    const res = makeRes();

    await handler(req, res);

    expect(anthropicMessages).toHaveBeenCalledTimes(1);
    const [, payload] = anthropicMessages.mock.calls[0]!;
    expect(payload.model).toBe("claude-sonnet-4-6");
    expect(payload.max_tokens).toBe(2500);
    expect(payload.system).toContain("ФІНАНСИ (2026-W01)");
    expect(payload.system).toContain("Витрати: 1200 грн");
    expect(payload.system).toContain("Місячний бюджет: 8000 грн");
    expect(payload.system).toContain("Продукти: 600 грн");
    expect(payload.system).toContain("Транзакцій: 42");
    expect(res.statusCode).toBe(200);
  });

  it("finyk без monthlyBudget — рядок 'не встановлено'; пусті topCategories — 'Немає даних'", async () => {
    setupAnthropicSuccess();
    const req = asReq({
      anthropicKey: "k",
      body: { finyk: { totalSpent: 0, totalIncome: 0, txCount: 0 } },
    });
    const res = makeRes();
    await handler(req, res);
    const [, payload] = anthropicMessages.mock.calls[0]!;
    expect(payload.system).toContain("Місячний бюджет: не встановлено");
    expect(payload.system).toContain("Топ категорії витрат:\n  Немає даних");
    expect(payload.system).toContain("ФІНАНСИ (тиждень)"); // weekRange fallback
  });

  it("fizruk-секція з топ-вправами рендериться повністю", async () => {
    setupAnthropicSuccess();
    const req = asReq({
      anthropicKey: "k",
      body: {
        weekRange: "2026-W02",
        fizruk: {
          workoutsCount: 4,
          totalVolume: 5400,
          recoveryLabel: "Помірне",
          topExercises: [
            { name: "Squat", totalVolume: 2200 },
            { name: "Bench", totalVolume: 1800 },
          ],
        },
      },
    });
    const res = makeRes();
    await handler(req, res);
    const [, payload] = anthropicMessages.mock.calls[0]!;
    expect(payload.system).toContain("Тренувань завершено: 4");
    expect(payload.system).toContain("Загальний об'єм: 5400 кг");
    expect(payload.system).toContain("Squat: 2200 кг");
    expect(payload.system).toContain("Стан відновлення: Помірне");
  });

  it("nutrition: дефіцит / профіцит / баланс — три гілки", async () => {
    setupAnthropicSuccess();

    // Дефіцит (target=2000, avg=1500 → 500 ккал deficit)
    let req = asReq({
      anthropicKey: "k",
      body: { nutrition: { avgKcal: 1500, targetKcal: 2000 } },
    });
    let res = makeRes();
    await handler(req, res);
    expect(anthropicMessages.mock.calls.at(-1)![1].system).toContain(
      "дефіцит 500 ккал",
    );

    // Профіцит (target=2000, avg=2600 → -600 ккал, i.e. surplus)
    req = asReq({
      anthropicKey: "k",
      body: { nutrition: { avgKcal: 2600, targetKcal: 2000 } },
    });
    res = makeRes();
    await handler(req, res);
    expect(anthropicMessages.mock.calls.at(-1)![1].system).toContain(
      "профіцит 600 ккал",
    );

    // Баланс (target=2000, avg=2010 → -10, |10| <= 50)
    req = asReq({
      anthropicKey: "k",
      body: { nutrition: { avgKcal: 2010, targetKcal: 2000 } },
    });
    res = makeRes();
    await handler(req, res);
    expect(anthropicMessages.mock.calls.at(-1)![1].system).toContain("баланс");
  });

  it("routine: пусті habits → 'Немає активних звичок'; з habits — рядок з %", async () => {
    setupAnthropicSuccess();

    let req = asReq({
      anthropicKey: "k",
      body: { routine: { overallRate: 0, habitCount: 0 } },
    });
    let res = makeRes();
    await handler(req, res);
    expect(anthropicMessages.mock.calls.at(-1)![1].system).toContain(
      "Немає активних звичок",
    );

    req = asReq({
      anthropicKey: "k",
      body: {
        routine: {
          overallRate: 71,
          habitCount: 2,
          habits: [
            { name: "Біг", completionRate: 80, done: 4, total: 5 },
            { name: "Йога", completionRate: 60, done: 3, total: 5 },
          ],
        },
      },
    });
    res = makeRes();
    await handler(req, res);
    const sys = anthropicMessages.mock.calls.at(-1)![1].system;
    expect(sys).toContain("Загальний відсоток: 71%");
    expect(sys).toContain("Біг: 80% (4/5 днів)");
    expect(sys).toContain("Йога: 60% (3/5 днів)");
  });
});

describe("weekly-digest handler · response & errors", () => {
  it("успіх: 200 з { report, generatedAt }", async () => {
    anthropicMessages.mockResolvedValue({
      response: { ok: true, status: 200 } as unknown as Response,
      data: { content: [{ type: "text", text: JSON.stringify(validReport) }] },
    });
    const req = asReq({
      anthropicKey: "k",
      body: {
        weekRange: "2026-W01",
        finyk: { totalSpent: 1, totalIncome: 1, txCount: 0 },
      },
    });
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const body = res.body as { report: unknown; generatedAt: string };
    expect(body.report).toEqual(validReport);
    expect(body.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("ExternalServiceError 502 ANTHROPIC_ERROR коли Anthropic !ok", async () => {
    anthropicMessages.mockResolvedValue({
      response: { ok: false, status: 503 } as unknown as Response,
      data: { error: { message: "overloaded" } },
    });
    const req = asReq({
      anthropicKey: "k",
      body: { finyk: { totalSpent: 0, totalIncome: 0, txCount: 0 } },
    });
    const res = makeRes();

    await expect(handler(req, res)).rejects.toMatchObject({
      name: "ExternalServiceError",
      status: 503,
      code: "ANTHROPIC_ERROR",
      message: "overloaded",
    });
  });

  it("ExternalServiceError fallback 'AI error' з status=502 коли response взагалі немає", async () => {
    anthropicMessages.mockResolvedValue({
      response: null,
      data: null,
    });
    const req = asReq({
      anthropicKey: "k",
      body: { finyk: { totalSpent: 0, totalIncome: 0, txCount: 0 } },
    });
    const res = makeRes();

    await expect(handler(req, res)).rejects.toMatchObject({
      name: "ExternalServiceError",
      status: 502,
      code: "ANTHROPIC_ERROR",
      message: "AI error",
    });
  });

  it("ANTHROPIC_PARSE_ERROR коли LLM повертає не-JSON", async () => {
    anthropicMessages.mockResolvedValue({
      response: { ok: true, status: 200 } as unknown as Response,
      data: { content: [{ type: "text", text: "просто текст без JSON" }] },
    });
    const req = asReq({
      anthropicKey: "k",
      body: { finyk: { totalSpent: 0, totalIncome: 0, txCount: 0 } },
    });
    const res = makeRes();

    await expect(handler(req, res)).rejects.toMatchObject({
      name: "ExternalServiceError",
      status: 502,
      code: "ANTHROPIC_PARSE_ERROR",
    });
  });

  it("ANTHROPIC_PARSE_ERROR на незбалансованій { (fallback гілка теж кидає null)", async () => {
    // Lone '{' ніколи не закриється, цикл завершиться з depth=1, далі
    // fallback `JSON.parse(text.slice(start))` теж кидає → return null.
    anthropicMessages.mockResolvedValue({
      response: { ok: true, status: 200 } as unknown as Response,
      data: {
        content: [{ type: "text", text: 'before { "x": 1 ' }],
      },
    });
    const req = asReq({
      anthropicKey: "k",
      body: { finyk: { totalSpent: 0, totalIncome: 0, txCount: 0 } },
    });
    const res = makeRes();

    await expect(handler(req, res)).rejects.toMatchObject({
      code: "ANTHROPIC_PARSE_ERROR",
      status: 502,
    });
  });

  it("extractAnthropicText повертає не-string (e.g. null) → ANTHROPIC_PARSE_ERROR", async () => {
    // Імітуємо ситуацію, коли LLM віддає одну порожню/non-text-блочну
    // відповідь — extractAnthropicText дає '' → extractJsonObject отримує
    // string, не знаходить '{', повертає null.
    anthropicMessages.mockResolvedValue({
      response: { ok: true, status: 200 } as unknown as Response,
      data: { content: [] },
    });
    const req = asReq({
      anthropicKey: "k",
      body: { finyk: { totalSpent: 0, totalIncome: 0, txCount: 0 } },
    });
    const res = makeRes();
    await expect(handler(req, res)).rejects.toMatchObject({
      code: "ANTHROPIC_PARSE_ERROR",
    });
  });

  it("ANTHROPIC_SHAPE_MISMATCH коли JSON валідний, але не пройшов schema", async () => {
    anthropicMessages.mockResolvedValue({
      response: { ok: true, status: 200 } as unknown as Response,
      data: {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              finyk: null,
              fizruk: null,
              nutrition: null,
              routine: null,
              // overallRecommendations missing → schema fails
            }),
          },
        ],
      },
    });
    const req = asReq({
      anthropicKey: "k",
      body: { finyk: { totalSpent: 0, totalIncome: 0, txCount: 0 } },
    });
    const res = makeRes();

    await expect(handler(req, res)).rejects.toMatchObject({
      name: "ExternalServiceError",
      status: 502,
      code: "ANTHROPIC_SHAPE_MISMATCH",
    });
  });

  it("```json fence обгортка — успішно витягується", async () => {
    anthropicMessages.mockResolvedValue({
      response: { ok: true, status: 200 } as unknown as Response,
      data: {
        content: [
          {
            type: "text",
            text:
              "Ось звіт:\n```json\n" + JSON.stringify(validReport) + "\n```",
          },
        ],
      },
    });
    const req = asReq({
      anthropicKey: "k",
      body: { finyk: { totalSpent: 0, totalIncome: 0, txCount: 0 } },
    });
    const res = makeRes();

    await handler(req, res);
    expect(res.statusCode).toBe(200);
  });

  it("вкладені {} та екранування у рядках — теж парсяться", async () => {
    const reportWithBraces = {
      ...validReport,
      finyk: {
        summary: "Зовсім без { }",
        comment: 'A "quoted" \\\\backslash text {with} brackets',
        recommendations: ["{nested object} hint", 'with "quotes"'],
      },
    };
    anthropicMessages.mockResolvedValue({
      response: { ok: true, status: 200 } as unknown as Response,
      data: {
        content: [
          {
            type: "text",
            text:
              "Префіксна болтанка перед JSON: " +
              JSON.stringify(reportWithBraces) +
              " — і трейл після",
          },
        ],
      },
    });
    const req = asReq({
      anthropicKey: "k",
      body: { finyk: { totalSpent: 0, totalIncome: 0, txCount: 0 } },
    });
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
  });
});

describe("weekly-digest handler · memory ingest hook", () => {
  function setupOK() {
    anthropicMessages.mockResolvedValue({
      response: { ok: true, status: 200 } as unknown as Response,
      data: { content: [{ type: "text", text: JSON.stringify(validReport) }] },
    });
  }

  it("anonymous (без user) — НЕ enqueue-ить memory", async () => {
    setupOK();
    const req = asReq({
      anthropicKey: "k",
      body: {
        weekRange: "2026-W01",
        finyk: { totalSpent: 1, totalIncome: 1, txCount: 0 },
      },
    });
    const res = makeRes();
    await handler(req, res);
    expect(enqueueMemoryIngest).not.toHaveBeenCalled();
  });

  it("без weekRange (e.g. ad-hoc digest) — НЕ enqueue-ить memory", async () => {
    setupOK();
    const req = asReq({
      anthropicKey: "k",
      user: { id: "user_42" },
      body: { finyk: { totalSpent: 1, totalIncome: 1, txCount: 0 } },
    });
    const res = makeRes();
    await handler(req, res);
    expect(enqueueMemoryIngest).not.toHaveBeenCalled();
  });

  it("user + weekRange — enqueue-ить content який злитий з усіх секцій", async () => {
    setupOK();
    const req = asReq({
      anthropicKey: "k",
      user: { id: "user_42" },
      body: {
        weekRange: "2026-W01",
        finyk: { totalSpent: 1, totalIncome: 1, txCount: 0 },
        nutrition: { avgKcal: 2000, targetKcal: 2000 },
      },
    });
    const res = makeRes();
    await handler(req, res);

    expect(enqueueMemoryIngest).toHaveBeenCalledTimes(1);
    const payload = enqueueMemoryIngest.mock.calls[0]![0];
    expect(payload.userId).toBe("user_42");
    expect(payload.source).toBe("digest");
    expect(payload.sourceRef).toBe("2026-W01");
    expect(payload.content).toContain("Тижневий звіт 2026-W01");
    expect(payload.content).toContain("finyk:");
    expect(payload.content).toContain("overall:");
    expect(payload.metadata.weekRange).toBe("2026-W01");
    expect(payload.metadata.sections.finyk).toBe(true);
    expect(payload.metadata.sections.fizruk).toBe(false);
    expect(payload.metadata.sections.nutrition).toBe(true);
    expect(payload.metadata.sections.routine).toBe(false);
  });

  it("memory-content усікається до AI_MEMORY_INGEST_MAX_CONTENT_LEN", async () => {
    // Підставимо AI report з дуже довгими рядками — вийде >> 4000 символів.
    const longText = "X".repeat(490);
    const fattyReport = {
      finyk: {
        summary: longText,
        comment: longText,
        recommendations: [longText, longText],
      },
      fizruk: {
        summary: longText,
        comment: longText,
        recommendations: [longText],
      },
      nutrition: {
        summary: longText,
        comment: longText,
        recommendations: [longText],
      },
      routine: {
        summary: longText,
        comment: longText,
        recommendations: [longText],
      },
      overallRecommendations: [longText, longText, longText],
    };
    anthropicMessages.mockResolvedValue({
      response: { ok: true, status: 200 } as unknown as Response,
      data: {
        content: [{ type: "text", text: JSON.stringify(fattyReport) }],
      },
    });
    const req = asReq({
      anthropicKey: "k",
      user: { id: "u" },
      body: {
        weekRange: "2026-W01",
        finyk: { totalSpent: 0, totalIncome: 0, txCount: 0 },
      },
    });
    const res = makeRes();
    await handler(req, res);

    const payload = enqueueMemoryIngest.mock.calls[0]![0];
    // env.AI_MEMORY_INGEST_MAX_CONTENT_LEN default = 4000.
    expect(payload.content.length).toBeLessThanOrEqual(4_000);
    expect(payload.content.length).toBeGreaterThan(3_000);
  });

  it("викидання у buildDigestMemoryContent (через зіпсований report) — не валить response", async () => {
    setupOK();
    enqueueMemoryIngest.mockImplementationOnce(() => {
      throw new Error("synchronous boom");
    });

    const req = asReq({
      anthropicKey: "k",
      user: { id: "u" },
      body: {
        weekRange: "2026-W01",
        finyk: { totalSpent: 0, totalIncome: 0, txCount: 0 },
      },
    });
    const res = makeRes();

    // Має дописати 200 і не кинути назовні.
    await expect(handler(req, res)).resolves.toBeUndefined();
    expect(res.statusCode).toBe(200);
  });

  it("ExternalServiceError тип — це справжній клас (не дубль)", () => {
    // Sanity, щоб refactor-и не змінили expression тестів вище:
    const e = new ExternalServiceError("x", { status: 502, code: "Y" });
    expect(e).toBeInstanceOf(ExternalServiceError);
    expect(e.status).toBe(502);
    expect(e.code).toBe("Y");
  });
});
