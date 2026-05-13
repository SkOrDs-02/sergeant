import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import type { Request, Response } from "express";

vi.mock("../ai-memory/ingestQueue.js", () => ({
  enqueueMemoryIngest: vi.fn(async () => undefined),
}));

import { enqueueMemoryIngest as _enqueueMemoryIngest } from "../ai-memory/ingestQueue.js";
import defaultHandler, {
  buildTemplateReport,
  createWeeklyDigestHandler,
} from "./weekly-digest.js";
import type { WeeklyDigestHandlerOptions } from "./weekly-digest.js";
import { ExternalServiceError, ValidationError } from "../../obs/errors.js";
import type {
  LLMGenerateOpts,
  LLMGenerateResult,
  LLMProvider,
  LLMProviderName,
} from "../../lib/llm/provider.js";

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

/**
 * Тестова реалізація `LLMProvider`. Зберігає `calls[]` для асертів і
 * викликає `next()` для кожного `generate()` — дозволяє тестам контролювати
 * sequential outcomes (ok → !ok → ok тощо).
 */
function makeFakeProvider(
  name: LLMProviderName,
  next: () => LLMGenerateResult | Promise<LLMGenerateResult>,
): LLMProvider & { calls: LLMGenerateOpts[] } {
  const calls: LLMGenerateOpts[] = [];
  return {
    name,
    calls,
    async generate(opts: LLMGenerateOpts): Promise<LLMGenerateResult> {
      calls.push(opts);
      return Promise.resolve(next());
    },
  };
}

function okResult(text: string): LLMGenerateResult {
  return { ok: true, text, usage: { inputTokens: 0, outputTokens: 0 } };
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

/**
 * Стандартизований конструктор тест-handler-а: ok-result із `validReport`
 * як JSON. `fallbackOnError` — за замовч `false`, щоб не сплутати з
 * семантикою тестів які чекають strict-error.
 */
function buildHandler(
  result: LLMGenerateResult = okResult(JSON.stringify(validReport)),
  extraOptions: Partial<WeeklyDigestHandlerOptions> = {},
) {
  const provider = makeFakeProvider("anthropic", () => result);
  const handler = createWeeklyDigestHandler({
    provider,
    fallbackOnError: false,
    ...extraOptions,
  });
  return { handler, provider };
}

describe("weekly-digest handler · validation", () => {
  it("400 коли body не валідне (заборонене поле або неправильний тип)", async () => {
    const { handler, provider } = buildHandler();
    const req = asReq({
      anthropicKey: "k",
      body: { weekRange: 1 as unknown as string },
    });
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(provider.calls).toHaveLength(0);
    expect((res.body as { error: string }).error).toBe(
      "Некоректні дані запиту",
    );
  });

  it("ValidationError якщо немає жодної секції (порожній звіт)", async () => {
    const { handler, provider } = buildHandler();
    const req = asReq({ anthropicKey: "k", body: { weekRange: "2026-W01" } });
    const res = makeRes();

    await expect(handler(req, res)).rejects.toBeInstanceOf(ValidationError);
    expect(provider.calls).toHaveLength(0);
  });
});

describe("weekly-digest handler · prompt assembly", () => {
  it("finyk-секція додає всі поля у системний промпт", async () => {
    const { handler, provider } = buildHandler();
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

    expect(provider.calls).toHaveLength(1);
    const opts = provider.calls[0]!;
    expect(opts.model).toBe("claude-sonnet-4-6");
    expect(opts.maxTokens).toBe(2500);
    expect(opts.endpoint).toBe("internal/weekly-digest");
    expect(opts.timeoutMs).toBe(45_000);
    expect(opts.system).toContain("ФІНАНСИ (2026-W01)");
    expect(opts.system).toContain("Витрати: 1200 грн");
    expect(opts.system).toContain("Місячний бюджет: 8000 грн");
    expect(opts.system).toContain("Продукти: 600 грн");
    expect(opts.system).toContain("Транзакцій: 42");
    expect(res.statusCode).toBe(200);
  });

  it("finyk без monthlyBudget — рядок 'не встановлено'; пусті topCategories — 'Немає даних'", async () => {
    const { handler, provider } = buildHandler();
    const req = asReq({
      anthropicKey: "k",
      body: { finyk: { totalSpent: 0, totalIncome: 0, txCount: 0 } },
    });
    const res = makeRes();
    await handler(req, res);
    const opts = provider.calls[0]!;
    expect(opts.system).toContain("Місячний бюджет: не встановлено");
    expect(opts.system).toContain("Топ категорії витрат:\n  Немає даних");
    expect(opts.system).toContain("ФІНАНСИ (тиждень)");
  });

  it("fizruk-секція з топ-вправами рендериться повністю", async () => {
    const { handler, provider } = buildHandler();
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
    const sys = provider.calls[0]!.system!;
    expect(sys).toContain("Тренувань завершено: 4");
    expect(sys).toContain("Загальний об'єм: 5400 кг");
    expect(sys).toContain("Squat: 2200 кг");
    expect(sys).toContain("Стан відновлення: Помірне");
  });

  it("nutrition: дефіцит / профіцит / баланс — три гілки", async () => {
    {
      const { handler, provider } = buildHandler();
      await handler(
        asReq({
          anthropicKey: "k",
          body: { nutrition: { avgKcal: 1500, targetKcal: 2000 } },
        }),
        makeRes(),
      );
      expect(provider.calls[0]!.system).toContain("дефіцит 500 ккал");
    }
    {
      const { handler, provider } = buildHandler();
      await handler(
        asReq({
          anthropicKey: "k",
          body: { nutrition: { avgKcal: 2600, targetKcal: 2000 } },
        }),
        makeRes(),
      );
      expect(provider.calls[0]!.system).toContain("профіцит 600 ккал");
    }
    {
      const { handler, provider } = buildHandler();
      await handler(
        asReq({
          anthropicKey: "k",
          body: { nutrition: { avgKcal: 2010, targetKcal: 2000 } },
        }),
        makeRes(),
      );
      expect(provider.calls[0]!.system).toContain("баланс");
    }
  });

  it("routine: пусті habits → 'Немає активних звичок'; з habits — рядок з %", async () => {
    {
      const { handler, provider } = buildHandler();
      await handler(
        asReq({
          anthropicKey: "k",
          body: { routine: { overallRate: 0, habitCount: 0 } },
        }),
        makeRes(),
      );
      expect(provider.calls[0]!.system).toContain("Немає активних звичок");
    }
    {
      const { handler, provider } = buildHandler();
      await handler(
        asReq({
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
        }),
        makeRes(),
      );
      const sys = provider.calls[0]!.system!;
      expect(sys).toContain("Загальний відсоток: 71%");
      expect(sys).toContain("Біг: 80% (4/5 днів)");
      expect(sys).toContain("Йога: 60% (3/5 днів)");
    }
  });
});

describe("weekly-digest handler · response & errors (strict mode)", () => {
  it("успіх: 200 з { report, generatedAt }", async () => {
    const { handler } = buildHandler();
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

  it("ExternalServiceError 502 ANTHROPIC_ERROR коли provider !ok (fallbackOnError=false)", async () => {
    const { handler } = buildHandler({
      ok: false,
      error: "overloaded",
      code: "anthropic_error",
      status: 503,
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

  it("ExternalServiceError fallback status=502 коли provider !ok без status", async () => {
    const { handler } = buildHandler({
      ok: false,
      error: "AI error",
      code: "anthropic_error",
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

  it("ANTHROPIC_PARSE_ERROR коли LLM повертає не-JSON (strict mode)", async () => {
    const { handler } = buildHandler(okResult("просто текст без JSON"));
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
    const { handler } = buildHandler(okResult('before { "x": 1 '));
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

  it("ANTHROPIC_PARSE_ERROR коли provider повернув порожній text", async () => {
    const { handler } = buildHandler(okResult(""));
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
    const { handler } = buildHandler(
      okResult(
        JSON.stringify({
          finyk: null,
          fizruk: null,
          nutrition: null,
          routine: null,
        }),
      ),
    );
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
    const { handler } = buildHandler(
      okResult("Ось звіт:\n```json\n" + JSON.stringify(validReport) + "\n```"),
    );
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
    const { handler } = buildHandler(
      okResult(
        "Префіксна болтанка перед JSON: " +
          JSON.stringify(reportWithBraces) +
          " — і трейл після",
      ),
    );
    const req = asReq({
      anthropicKey: "k",
      body: { finyk: { totalSpent: 0, totalIncome: 0, txCount: 0 } },
    });
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
  });
});

describe("weekly-digest handler · PR-25 stub mode + fallback-on-error", () => {
  it("stub-provider повертає template-report (без LLM)", async () => {
    const stubReport = buildTemplateReport({
      finyk: { totalSpent: 1234, totalIncome: 5000, txCount: 7 },
      nutrition: { avgKcal: 1800, targetKcal: 2000, daysLogged: 5 },
    });
    const stubProvider = makeFakeProvider("stub", () =>
      okResult(JSON.stringify(stubReport)),
    );
    const stubHandler = createWeeklyDigestHandler({
      provider: stubProvider,
      fallbackOnError: false,
    });

    const req = asReq({
      anthropicKey: "",
      body: {
        weekRange: "2026-W01",
        finyk: { totalSpent: 1234, totalIncome: 5000, txCount: 7 },
        nutrition: { avgKcal: 1800, targetKcal: 2000, daysLogged: 5 },
      },
    });
    const res = makeRes();
    await stubHandler(req, res);
    expect(res.statusCode).toBe(200);
    const body = res.body as { report: typeof stubReport };
    expect(body.report.finyk?.summary).toContain("Витрати 1234 грн");
    expect(body.report.nutrition?.summary).toContain("1800 ккал");
    expect(body.report.finyk?.recommendations).toEqual([]);
    expect(body.report.overallRecommendations).toEqual([]);
    expect(stubProvider.calls).toHaveLength(1);
    expect(stubProvider.calls[0]!.endpoint).toBe("internal/weekly-digest");
  });

  it("fallback-on-error: provider !ok з fallbackOnError=true → 200 template-report", async () => {
    const { handler } = buildHandler(
      {
        ok: false,
        error: "overloaded",
        code: "rate_limited",
        status: 429,
      },
      { fallbackOnError: true },
    );
    const req = asReq({
      anthropicKey: "k",
      body: {
        weekRange: "2026-W03",
        finyk: { totalSpent: 100, totalIncome: 200, txCount: 3 },
      },
    });
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const body = res.body as { report: { finyk: { summary: string } | null } };
    // Це template-report: специфічна фраза присутня саме у stub-summary.
    expect(body.report.finyk?.summary).toContain("Витрати 100 грн");
    expect(body.report.finyk?.summary).toContain("3 транзакцій");
  });

  it("fallback-on-error: parse-error з fallbackOnError=true → 200 template-report", async () => {
    const { handler } = buildHandler(okResult("not json"), {
      fallbackOnError: true,
    });
    const req = asReq({
      anthropicKey: "k",
      body: {
        weekRange: "2026-W04",
        fizruk: { workoutsCount: 5, totalVolume: 4200 },
      },
    });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      report: { fizruk: { summary: string } | null };
    };
    expect(body.report.fizruk?.summary).toContain("5 тренувань");
    expect(body.report.fizruk?.summary).toContain("4200 кг");
  });

  it("fallback-on-error: shape-mismatch з fallbackOnError=true → 200 template-report", async () => {
    const { handler } = buildHandler(
      okResult(JSON.stringify({ wrong: "shape" })),
      { fallbackOnError: true },
    );
    const req = asReq({
      anthropicKey: "k",
      body: {
        weekRange: "2026-W05",
        routine: { overallRate: 80, habitCount: 4 },
      },
    });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      report: { routine: { summary: string } | null };
    };
    expect(body.report.routine?.summary).toContain("4 звичок");
    expect(body.report.routine?.summary).toContain("80%");
  });

  it("Sentry breadcrumb category=llm.provider + outcome=ok на success", async () => {
    const breadcrumbs: Array<{
      category: string;
      level: string;
      data: Record<string, unknown>;
    }> = [];
    const provider = makeFakeProvider("anthropic", () =>
      okResult(JSON.stringify(validReport)),
    );
    const handler = createWeeklyDigestHandler({
      provider,
      addBreadcrumb: (b) => breadcrumbs.push(b),
    });

    await handler(
      asReq({
        anthropicKey: "k",
        body: { finyk: { totalSpent: 1, totalIncome: 1, txCount: 0 } },
      }),
      makeRes(),
    );

    expect(breadcrumbs).toHaveLength(1);
    expect(breadcrumbs[0]).toMatchObject({
      category: "llm.provider",
      level: "info",
      data: {
        provider: "anthropic",
        endpoint: "internal/weekly-digest",
        outcome: "ok",
        model: "claude-sonnet-4-6",
      },
    });
  });

  it("Sentry breadcrumb level=warning + code/error на provider error", async () => {
    const breadcrumbs: Array<{
      level: string;
      data: Record<string, unknown>;
    }> = [];
    const provider = makeFakeProvider("anthropic", () => ({
      ok: false,
      error: "timeout",
      code: "timeout",
    }));
    const handler = createWeeklyDigestHandler({
      provider,
      addBreadcrumb: (b) => breadcrumbs.push(b),
      fallbackOnError: true,
    });

    await handler(
      asReq({
        anthropicKey: "k",
        body: { finyk: { totalSpent: 1, totalIncome: 1, txCount: 0 } },
      }),
      makeRes(),
    );

    expect(breadcrumbs[0]).toMatchObject({
      level: "warning",
      data: { outcome: "timeout", code: "timeout", error: "timeout" },
    });
  });
});

describe("weekly-digest handler · memory ingest hook", () => {
  it("anonymous (без user) — НЕ enqueue-ить memory", async () => {
    const { handler } = buildHandler();
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
    const { handler } = buildHandler();
    const req = asReq({
      anthropicKey: "k",
      user: { id: "user_42" },
      body: { finyk: { totalSpent: 1, totalIncome: 1, txCount: 0 } },
    });
    const res = makeRes();
    await handler(req, res);
    expect(enqueueMemoryIngest).not.toHaveBeenCalled();
  });

  it("user + weekRange — enqueue-ить content з усіх секцій + usedFallback=false", async () => {
    const { handler } = buildHandler();
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
    expect(payload.metadata.usedFallback).toBe(false);
  });

  it("PR-25: на fallback-template memory теж enqueue-иться з usedFallback=true", async () => {
    const { handler } = buildHandler(
      { ok: false, error: "boom", code: "rate_limited", status: 429 },
      { fallbackOnError: true },
    );
    const req = asReq({
      anthropicKey: "k",
      user: { id: "user_42" },
      body: {
        weekRange: "2026-W01",
        finyk: { totalSpent: 10, totalIncome: 5, txCount: 1 },
      },
    });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(enqueueMemoryIngest).toHaveBeenCalledTimes(1);
    const payload = enqueueMemoryIngest.mock.calls[0]![0];
    expect(payload.metadata.usedFallback).toBe(true);
  });

  it("memory-content усікається до AI_MEMORY_INGEST_MAX_CONTENT_LEN", async () => {
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
    const { handler } = buildHandler(okResult(JSON.stringify(fattyReport)));
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
    expect(payload.content.length).toBeLessThanOrEqual(4_000);
    expect(payload.content.length).toBeGreaterThan(3_000);
  });

  it("викидання у enqueueMemoryIngest — не валить response", async () => {
    const { handler } = buildHandler();
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

    await expect(handler(req, res)).resolves.toBeUndefined();
    expect(res.statusCode).toBe(200);
  });

  it("ExternalServiceError тип — це справжній клас (не дубль)", () => {
    const e = new ExternalServiceError("x", { status: 502, code: "Y" });
    expect(e).toBeInstanceOf(ExternalServiceError);
    expect(e.status).toBe(502);
    expect(e.code).toBe("Y");
  });
});

describe("buildTemplateReport (PR-25)", () => {
  it("повертає null для відсутніх секцій", () => {
    const r = buildTemplateReport({});
    expect(r.finyk).toBeNull();
    expect(r.fizruk).toBeNull();
    expect(r.nutrition).toBeNull();
    expect(r.routine).toBeNull();
    expect(r.overallRecommendations).toEqual([]);
  });

  it("finyk-секція з усіма числами", () => {
    const r = buildTemplateReport({
      finyk: { totalSpent: 1500, totalIncome: 3000, txCount: 12 },
    });
    expect(r.finyk).not.toBeNull();
    expect(r.finyk!.summary).toBe(
      "Витрати 1500 грн, надходження 3000 грн, 12 транзакцій.",
    );
    expect(r.finyk!.recommendations).toEqual([]);
  });

  it("fizruk-секція з recoveryLabel", () => {
    const r = buildTemplateReport({
      fizruk: { workoutsCount: 3, totalVolume: 1800, recoveryLabel: "Добре" },
    });
    expect(r.fizruk!.summary).toContain("стан: Добре");
  });

  it("fizruk без recoveryLabel", () => {
    const r = buildTemplateReport({
      fizruk: { workoutsCount: 0, totalVolume: 0 },
    });
    expect(r.fizruk!.summary).toBe("0 тренувань, обсяг 0 кг.");
  });

  it("nutrition-секція з daysLogged", () => {
    const r = buildTemplateReport({
      nutrition: { avgKcal: 2100, daysLogged: 6 },
    });
    expect(r.nutrition!.summary).toBe(
      "Середньодобово 2100 ккал з 6/7 днів записів.",
    );
  });

  it("routine-секція з overallRate", () => {
    const r = buildTemplateReport({
      routine: { habitCount: 5, overallRate: 92 },
    });
    expect(r.routine!.summary).toBe("5 звичок, загальний відсоток 92%.");
  });

  it("дотримується WeeklyDigestReportSchema (валідний shape)", async () => {
    const { WeeklyDigestReportSchema } = await import("../../http/schemas.js");
    const r = buildTemplateReport({
      finyk: { totalSpent: 1, totalIncome: 1, txCount: 1 },
      fizruk: { workoutsCount: 1, totalVolume: 1 },
      nutrition: { avgKcal: 1, daysLogged: 1 },
      routine: { habitCount: 1, overallRate: 1 },
    });
    const parsed = WeeklyDigestReportSchema.safeParse(r);
    expect(parsed.success).toBe(true);
  });
});

describe("weekly-digest default export", () => {
  it("default-handler — це фабрика без options, не падає при імпорті", () => {
    expect(typeof defaultHandler).toBe("function");
  });
});
