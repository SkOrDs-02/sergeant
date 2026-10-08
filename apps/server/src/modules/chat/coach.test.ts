import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request, Response } from "express";
import type { Mock } from "vitest";

vi.mock("../../db.js", () => {
  const pool = { query: vi.fn() };
  // RLS-контекст прозорий: `fn` отримує той самий мок, SQL-виклики не міняються.
  const withUserContext = (_userId: string, fn: (db: unknown) => unknown) =>
    fn(pool);
  return { default: pool, pool, withUserContext };
});

vi.mock("../../lib/anthropic.js", () => ({
  anthropicMessages: vi.fn(),
  // Дзеркалимо реальну реалізацію з `server/lib/anthropic.js`, включно з
  // `.trim()` — без нього LLM-відповіді з trailing newline-ами проходили б у
  // моку, але не у проді, а assert-и на точний `toBe()` давали б false-pass.
  extractAnthropicText: vi.fn(
    (d: { content?: { type: string; text?: string }[] }) =>
      (d?.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim(),
  ),
}));

// Гейт згоди на дані про здоровʼя читає БД; за замовчуванням у цьому файлі
// згода «є» (поведінка до 2026-09-29), сценарій без неї перемикає мок явно.
const { resolveHealthConsentMock } = vi.hoisted(() => ({
  resolveHealthConsentMock: vi.fn(),
}));
vi.mock("../../lib/healthConsent.js", () => ({
  resolveHealthConsent: resolveHealthConsentMock,
}));

vi.mock("../../obs/logger.js", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import _pool from "../../db.js";
import { anthropicMessages as _anthropicMessages } from "../../lib/anthropic.js";
import { env } from "../../env/env.js";
import {
  buildCoachInsightPrompt,
  coachInsight,
  coachMemoryGet,
  coachMemoryPost,
  getCoachCorrelationsBlock,
} from "./coach.js";
import { MAX_BLOB_SIZE } from "./coach.js";
import { ExternalServiceError } from "../../obs/errors.js";
import { logger as _logger } from "../../obs/logger.js";

const pool = _pool as unknown as { query: Mock };
const anthropicMessages = _anthropicMessages as unknown as Mock;
const logger = _logger as unknown as {
  warn: Mock;
  info: Mock;
  error: Mock;
  debug: Mock;
};

interface TestRes {
  statusCode: number;
  body:
    | {
        error?: string;
        details?: unknown;
        ok?: boolean;
        insight?: string;
        memory?: unknown;
      }
    | undefined;
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
      this.body = payload as TestRes["body"];
      return this;
    },
  };
  return res as TestRes & Response;
}

function asReq(v: unknown): Request {
  return v as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveHealthConsentMock.mockReset();
  resolveHealthConsentMock.mockResolvedValue(true);
  // Force the Anthropic path: these tests assert the prompt payload via the
  // `anthropicMessages` mock, so they must route through AnthropicProvider
  // regardless of the prod default (`LLM_COACH_PROVIDER=openrouter`).
  (env as { LLM_COACH_PROVIDER: string }).LLM_COACH_PROVIDER = "anthropic";
  // `coachInsight` викликає `sendToUserQuietly` → `sendToUser` → `pool.query`.
  // Без дефолту `vi.fn()` дає `undefined` і падає деструктуризація `rows` (шум у логах).
  pool.query.mockResolvedValue({ rows: [] });
});

describe("coachMemoryPost blob-size guard", () => {
  it("повертає 413 коли merged-blob перевищує MAX_BLOB_SIZE і не робить INSERT", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ data: JSON.stringify({ weeklyDigests: [] }) }],
    });

    // `weekRange`/`correlations` тепер обмежені схемою (rel-18) і дали б 400
    // раніше за blob-guard; роздути блоб можна лише через `z.unknown()`-поля.
    const huge = "x".repeat(MAX_BLOB_SIZE + 1);
    const req = {
      user: { id: "user_1" },
      body: {
        weeklyDigest: {
          weekKey: "2026-W01",
          finyk: { summary: huge },
        },
      },
    };
    const res = makeRes();

    await coachMemoryPost(asReq(req), res);

    expect(res.statusCode).toBe(413);
    expect(res.body).toEqual({ error: "Coach memory blob too large" });
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it("нормальний розмір: робить INSERT і повертає ok", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const req = {
      user: { id: "user_1" },
      body: {
        weeklyDigest: {
          weekKey: "2026-W01",
          weekRange: "1–7 Jan",
          finyk: { summary: "усе ок" },
        },
      },
    };
    const res = makeRes();

    await coachMemoryPost(asReq(req), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(pool.query).toHaveBeenCalledTimes(2);
    const insertCall = pool.query.mock.calls[1] as [string, unknown[]];
    expect(insertCall[0]).toMatch(/INSERT INTO coach_memory/);
    expect(insertCall[1][0]).toBe("user_1");
  });

  it("прокидає не-size помилки з saveMemory", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error("insert failed"));

    const req = {
      user: { id: "user_1" },
      body: {
        weeklyDigest: {
          weekKey: "2026-W02",
          weekRange: "8-14 Jan",
        },
      },
    };

    await expect(coachMemoryPost(asReq(req), makeRes())).rejects.toThrow(
      "insert failed",
    );
  });

  it("невалідне body (weeklyDigest без weekKey) → ValidationError з cause.details", async () => {
    const req = {
      user: { id: "user_1" },
      body: { weeklyDigest: { weekRange: "no key here" } },
    };
    await expect(coachMemoryPost(asReq(req), makeRes())).rejects.toMatchObject({
      name: "ValidationError",
      message: "Некоректні дані запиту",
      cause: { details: expect.any(Array) },
    });
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe("coachMemoryGet", () => {
  it("повертає збережену памʼять", async () => {
    const memory = {
      weeklyDigests: [{ weekKey: "2026-W01", finyk: { summary: "ok" } }],
    };
    pool.query.mockResolvedValueOnce({
      rows: [{ data: JSON.stringify(memory) }],
    });
    const res = makeRes();
    await coachMemoryGet(asReq({ user: { id: "user_1" } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, memory });
  });

  it("повертає null коли для користувача ще нема coach-рядка", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = makeRes();
    await coachMemoryGet(asReq({ user: { id: "user_1" } }), res);
    expect(res.body).toEqual({ ok: true, memory: null });
  });
});

describe("coachMemoryPost — mergeMemory logic (PR F)", () => {
  // Tests the mergeMemory invariants indirectly via the public handler.
  // These are the high-value paths that affect AI coach prompt quality.

  it("same weekKey замінює наявний запис (LWW upsert per-week)", async () => {
    const existing = {
      weeklyDigests: [
        {
          weekKey: "2026-W10",
          generatedAt: "2026-03-02T00:00:00.000Z",
          finyk: { summary: "старе фінансове" },
        },
      ],
      lastInsightDate: null,
      lastInsightText: null,
    };
    pool.query
      .mockResolvedValueOnce({ rows: [{ data: JSON.stringify(existing) }] })
      .mockResolvedValueOnce({ rows: [] }); // INSERT

    const req = {
      user: { id: "user_1" },
      body: {
        weeklyDigest: {
          weekKey: "2026-W10",
          weekRange: "2–8 Mar",
          finyk: { summary: "нові фінанси" },
        },
      },
    };
    const res = makeRes();
    await coachMemoryPost(asReq(req), res);

    expect(res.statusCode).toBe(200);
    const insertCall = pool.query.mock.calls[1] as [string, unknown[]];
    const saved = JSON.parse(insertCall[1][1] as string) as {
      weeklyDigests: Array<{ weekKey: string; finyk?: { summary: string } }>;
    };
    // Тільки один запис з цим weekKey
    expect(
      saved.weeklyDigests.filter((d) => d.weekKey === "2026-W10"),
    ).toHaveLength(1);
    expect(saved.weeklyDigests[0]!.finyk!.summary).toBe("нові фінанси");
  });

  it("digests відсортовані за weekKey desc (новіше на початку)", async () => {
    const existing = {
      weeklyDigests: [
        {
          weekKey: "2026-W05",
          generatedAt: "2026-01-01T00:00:00.000Z",
          finyk: null,
          fizruk: null,
          nutrition: null,
          routine: null,
        },
        {
          weekKey: "2026-W03",
          generatedAt: "2026-01-01T00:00:00.000Z",
          finyk: null,
          fizruk: null,
          nutrition: null,
          routine: null,
        },
      ],
      lastInsightDate: null,
      lastInsightText: null,
    };
    pool.query
      .mockResolvedValueOnce({ rows: [{ data: JSON.stringify(existing) }] })
      .mockResolvedValueOnce({ rows: [] });

    const req = {
      user: { id: "user_1" },
      body: {
        weeklyDigest: {
          weekKey: "2026-W07",
          generatedAt: "2026-02-16T00:00:00.000Z",
        },
      },
    };
    await coachMemoryPost(asReq(req), makeRes());

    const insertCall = pool.query.mock.calls[1] as [string, unknown[]];
    const saved = JSON.parse(insertCall[1][1] as string) as {
      weeklyDigests: Array<{ weekKey: string }>;
    };
    expect(saved.weeklyDigests[0]!.weekKey).toBe("2026-W07");
    expect(saved.weeklyDigests[1]!.weekKey).toBe("2026-W05");
    expect(saved.weeklyDigests[2]!.weekKey).toBe("2026-W03");
  });

  it("digests обрізаються до 12 записів (retention limit)", async () => {
    // Створюємо 13 наявних записів + один новий = 14 до cap
    const manyDigests = Array.from({ length: 13 }, (_, i) => ({
      weekKey: `2025-W${String(i + 1).padStart(2, "0")}`,
      generatedAt: "2025-01-01T00:00:00.000Z",
      finyk: null,
      fizruk: null,
      nutrition: null,
      routine: null,
    }));
    const existing = {
      weeklyDigests: manyDigests,
      lastInsightDate: null,
      lastInsightText: null,
    };
    pool.query
      .mockResolvedValueOnce({ rows: [{ data: JSON.stringify(existing) }] })
      .mockResolvedValueOnce({ rows: [] });

    const req = {
      user: { id: "user_1" },
      body: {
        weeklyDigest: {
          weekKey: "2026-W01",
          generatedAt: "2026-01-06T00:00:00.000Z",
        },
      },
    };
    await coachMemoryPost(asReq(req), makeRes());

    const insertCall = pool.query.mock.calls[1] as [string, unknown[]];
    const saved = JSON.parse(insertCall[1][1] as string) as {
      weeklyDigests: Array<unknown>;
    };
    expect(saved.weeklyDigests.length).toBe(12);
    // Найновіший (2026-W01) залишається, найстаріші обрізаються
    const keys = (saved.weeklyDigests as Array<{ weekKey: string }>).map(
      (d) => d.weekKey,
    );
    expect(keys[0]).toBe("2026-W01");
  });

  it("зберігає correlations у записі digest (WP3)", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] }) // getMemory → немає
      .mockResolvedValueOnce({ rows: [] }); // INSERT

    const req = {
      user: { id: "user_1" },
      body: {
        weeklyDigest: {
          weekKey: "2026-W20",
          correlations: ["у дні тренувань ти витрачаєш менше (r=-0.52, 14 дн)"],
        },
      },
    };
    await coachMemoryPost(asReq(req), makeRes());

    const insertCall = pool.query.mock.calls[1] as [string, unknown[]];
    const saved = JSON.parse(insertCall[1][1] as string) as {
      weeklyDigests: Array<{ correlations?: string[] }>;
    };
    expect(saved.weeklyDigests[0]!.correlations).toEqual([
      "у дні тренувань ти витрачаєш менше (r=-0.52, 14 дн)",
    ]);
  });
});

describe("coachMemoryGet — parseMemory raw-fallback warn", () => {
  it("логує warn коли DB-рядок містить невалідний JSON рядок", async () => {
    // Симулюємо рядок, що не є валідним JSON — наприклад, corrupted JSONB
    // або рядок з правильним форматом, але без лапок навколо ключів.
    pool.query.mockResolvedValueOnce({
      rows: [{ data: "{ не валідний JSON {{" }],
    });
    const res = makeRes();
    await coachMemoryGet(asReq({ user: { id: "user_warn" } }), res);

    // Handler не впаде — повертає raw-значення як CoachMemory (fail-safe).
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true });

    // Warn-лог спрацював один раз.
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ msg: "coach_memory_parse_fallback" }),
    );
  });

  it("не логує warn коли DB-рядок є валідним JSON рядком", async () => {
    const memory = {
      weeklyDigests: [],
      lastInsightDate: null,
      lastInsightText: null,
    };
    pool.query.mockResolvedValueOnce({
      rows: [{ data: JSON.stringify(memory) }],
    });
    const res = makeRes();
    await coachMemoryGet(asReq({ user: { id: "user_ok" } }), res);

    expect(res.statusCode).toBe(200);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("не логує warn коли data вже є обʼєктом (JSONB автопарс pg-клієнта)", async () => {
    const memory = {
      weeklyDigests: [],
      lastInsightDate: null,
      lastInsightText: null,
    };
    pool.query.mockResolvedValueOnce({
      rows: [{ data: memory }], // pg вже розпарсив JSONB у обʼєкт
    });
    const res = makeRes();
    await coachMemoryGet(asReq({ user: { id: "user_obj" } }), res);

    expect(res.statusCode).toBe(200);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

describe("coachInsight", () => {
  function makeReq(body: unknown): Request {
    return {
      user: { id: "user_1" },
      anthropicKey: "sk-test",
      body,
    } as unknown as Request;
  }

  /**
   * PR-A2 (аудит 2026-09-13-product-full-review.md) — `requireAiQuota()`
   * атачить `aiQuotaRefund` до `req` ДО того, як `coachInsight` починає
   * виконуватись (той самий контракт, що й у `chat.ts`, див.
   * `chat.test.ts::makeReqWithRefundSpy`). Провал upstream мусить
   * викликати цей closure, інакше 5xx OpenRouter/Anthropic зʼїдає денну
   * квоту користувача за пораду, якої він не отримав.
   */
  function makeReqWithRefundSpy(body: unknown): {
    req: Request;
    aiQuotaRefund: Mock;
  } {
    const aiQuotaRefund = vi.fn().mockResolvedValue(undefined);
    const req = {
      user: { id: "user_1" },
      anthropicKey: "sk-test",
      body,
      aiQuotaRefund,
    } as unknown as Request;
    return { req, aiQuotaRefund };
  }

  it("happy: віддає insight-текст на основі snapshot+memory", async () => {
    anthropicMessages.mockResolvedValueOnce({
      response: { ok: true, status: 200 },
      data: {
        content: [
          {
            type: "text",
            text: "Помітив, що ти 3 тижні поспіль тримаєш дефіцит.",
          },
        ],
      },
    });

    const res = makeRes();
    await coachInsight(
      makeReq({
        snapshot: {
          finyk: {
            totalSpent: 5000,
            totalIncome: 12000,
            txCount: 34,
            topCategories: [{ name: "Продукти", amount: 1500 }],
          },
        },
        memory: { weeklyDigests: [] },
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
    expect(res.body!.insight).toContain("дефіцит");

    // System prompt повинен містити блоки SNAPSHOT/MEMORY і звертання до AI.
    const [, payload] = anthropicMessages.mock.calls[0] as [
      unknown,
      {
        model: string;
        messages: { content: string }[];
      },
    ];
    expect(payload.model).toMatch(/^claude-/);
    const user = payload!.messages[0]!.content;
    expect(user).toContain("ФІНАНСИ ЦЬОГО ТИЖНЯ");
    expect(user).toContain("5000");
  });

  it("prompt includes non-empty memory summary and all product snapshot sections", async () => {
    anthropicMessages.mockResolvedValueOnce({
      response: { ok: true, status: 200 },
      data: { content: [{ type: "text", text: "ok" }] },
    });

    const res = makeRes();
    await coachInsight(
      makeReq({
        snapshot: {
          finyk: {
            totalSpent: 4200,
            totalIncome: 9000,
            txCount: 12,
            topCategories: [{ name: "Groceries", amount: 1700 }],
          },
          fizruk: {
            workoutsCount: 3,
            totalVolume: 12_500,
            recoveryLabel: "green",
          },
          nutrition: {
            avgKcal: 2100,
            targetKcal: 2200,
            avgProtein: 130,
            daysLogged: 6,
          },
          routine: {
            overallRate: 82,
            habitCount: 5,
          },
        },
        memory: {
          weeklyDigests: [
            {
              weekKey: "2026-W10",
              weekRange: "2-8 Mar",
              generatedAt: "2026-03-08T00:00:00.000Z",
              finyk: { summary: "finyk summary" },
              fizruk: { summary: "fizruk summary" },
              nutrition: { summary: "nutrition summary" },
              routine: { summary: "routine summary" },
              overallRecommendations: ["drink water", "lift steady"],
            },
          ],
        },
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    const [, payload] = anthropicMessages.mock.calls[0] as [
      unknown,
      { messages: { content: string }[] },
    ];
    const prompt = payload!.messages[0]!.content;
    expect(prompt).toContain("finyk summary");
    expect(prompt).toContain("fizruk summary");
    expect(prompt).toContain("nutrition summary");
    expect(prompt).toContain("routine summary");
    expect(prompt).toContain("drink water");
    expect(prompt).toContain("Groceries 1700");
    expect(prompt).toContain("12500");
    expect(prompt).toContain("2100");
    expect(prompt).toContain("82%");
  });

  it("без згоди на дані про здоровʼя: тренувань, харчування і кореляцій у промпті немає, фінанси й звички є", async () => {
    resolveHealthConsentMock.mockResolvedValue(false);
    anthropicMessages.mockResolvedValueOnce({
      response: { ok: true, status: 200 },
      data: { content: [{ type: "text", text: "ok" }] },
    });

    const res = makeRes();
    await coachInsight(
      makeReq({
        snapshot: {
          finyk: { totalSpent: 4200, totalIncome: 9000, txCount: 12 },
          fizruk: { workoutsCount: 3, totalVolume: 12_500 },
          nutrition: { avgKcal: 2111, avgProtein: 130, daysLogged: 6 },
          routine: { overallRate: 82, habitCount: 5 },
        },
        memory: {
          weeklyDigests: [
            {
              weekKey: "2026-W10",
              weekRange: "2-8 Mar",
              generatedAt: "2026-03-08T00:00:00.000Z",
              finyk: { summary: "finyk summary" },
              fizruk: { summary: "fizruk summary" },
              nutrition: { summary: "nutrition summary" },
              routine: { summary: "routine summary" },
              correlations: ["corr-with-workouts"],
              overallRecommendations: ["drink water"],
            },
          ],
        },
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    const [, payload] = anthropicMessages.mock.calls[0] as [
      unknown,
      { messages: { content: string }[] },
    ];
    const prompt = payload!.messages[0]!.content;
    for (const leak of [
      "fizruk summary",
      "nutrition summary",
      "12500",
      "2111",
      "corr-with-workouts",
      "ТРЕНУВАННЯ ЦЬОГО ТИЖНЯ",
      "ХАРЧУВАННЯ ЦЬОГО ТИЖНЯ",
    ]) {
      expect(prompt).not.toContain(leak);
    }
    expect(prompt).toContain("finyk summary");
    expect(prompt).toContain("routine summary");
    expect(prompt).toContain("4200");
    expect(prompt).toContain("82%");
  });

  it("invalid body (snapshot.finyk з неправильним типом) → ValidationError", async () => {
    await expect(
      coachInsight(
        makeReq({
          snapshot: { finyk: { totalSpent: "не число" } },
        }),
        makeRes(),
      ),
    ).rejects.toMatchObject({
      name: "ValidationError",
      message: "Некоректні дані запиту",
    });
    expect(anthropicMessages).not.toHaveBeenCalled();
  });

  it("AI upstream !ok → кидає ExternalServiceError зі статусом і безпечним UA-message", async () => {
    // Уніфікуємо upstream-помилки під `errorHandler`: upstream 504 мапиться у 502,
    // code: ANTHROPIC_ERROR — сирий provider-message НЕ виходить до клієнта.
    anthropicMessages.mockResolvedValueOnce({
      response: { ok: false, status: 504 },
      data: { error: { message: "Upstream timeout" } },
    });
    const res = makeRes();
    let caught: unknown = null;
    try {
      await coachInsight(makeReq({ snapshot: {}, memory: {} }), res);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ExternalServiceError);
    expect(caught).toMatchObject({
      status: 502,
      code: "ANTHROPIC_ERROR",
      message: "Асистент тимчасово недоступний. Спробуй пізніше.",
    });
  });

  it("AI відповідь без помилкового тіла → fallback на 502 з 'AI error'", async () => {
    // Якщо upstream-status відсутній (network glitch, response без `.status`),
    // 5xx-fallback — 502 (`Bad Gateway`) — стандартне відображення для
    // невдалого зовнішнього сервісу.
    anthropicMessages.mockResolvedValueOnce({
      response: { ok: false, status: 0 },
      data: null,
    });
    const res = makeRes();
    let caught: unknown = null;
    try {
      await coachInsight(makeReq({ snapshot: {}, memory: {} }), res);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ExternalServiceError);
    expect(caught).toMatchObject({
      status: 502,
      code: "ANTHROPIC_ERROR",
      message: "Асистент тимчасово недоступний. Спробуй пізніше.",
    });
  });

  // ── PR-A2: провал провайдера має повернути AI-квоту ─────────────────────

  it("upstream !ok (504) повертає квоту через req.aiQuotaRefund", async () => {
    anthropicMessages.mockResolvedValueOnce({
      response: { ok: false, status: 504 },
      data: { error: { message: "Upstream timeout" } },
    });
    const { req, aiQuotaRefund } = makeReqWithRefundSpy({
      snapshot: {},
      memory: {},
    });

    await expect(coachInsight(req, makeRes())).rejects.toBeInstanceOf(
      ExternalServiceError,
    );

    expect(aiQuotaRefund).toHaveBeenCalledTimes(1);
  });

  it("успішний виклик НЕ повертає квоту (списання лишається чинним)", async () => {
    anthropicMessages.mockResolvedValueOnce({
      response: { ok: true, status: 200 },
      data: { content: [{ type: "text", text: "Усе гаразд" }] },
    });
    const { req, aiQuotaRefund } = makeReqWithRefundSpy({
      snapshot: {},
      memory: {},
    });

    const res = makeRes();
    await coachInsight(req, res);

    expect(res.statusCode).toBe(200);
    expect(aiQuotaRefund).not.toHaveBeenCalled();
  });

  it("порожній snapshot → prompt містить 'Даних за поточний тиждень ще немає.'", async () => {
    anthropicMessages.mockResolvedValueOnce({
      response: { ok: true, status: 200 },
      data: { content: [{ type: "text", text: "ok" }] },
    });
    const res = makeRes();
    await coachInsight(makeReq({}), res);
    expect(res.statusCode).toBe(200);
    const [, payload] = anthropicMessages.mock.calls[0] as [
      unknown,
      { messages: { content: string }[] },
    ];
    expect(payload!.messages[0]!.content).toContain(
      "Даних за поточний тиждень ще немає.",
    );
  });

  it("dateContext → prompt містить 'Сьогодні:' та день тижня з 7", async () => {
    anthropicMessages.mockResolvedValueOnce({
      response: { ok: true, status: 200 },
      data: { content: [{ type: "text", text: "ok" }] },
    });
    const res = makeRes();
    await coachInsight(
      makeReq({
        snapshot: {
          dateContext: {
            todayKey: "2026-04-26",
            weekDayUk: "неділя",
            dayOfWeekIso: 7,
            daysIntoWeek: 7,
            weekRange: "20.04–26.04",
          },
        },
      }),
      res,
    );
    expect(res.statusCode).toBe(200);
    const [, payload] = anthropicMessages.mock.calls[0] as [
      unknown,
      { messages: { content: string }[] },
    ];
    const prompt = payload!.messages[0]!.content;
    expect(prompt).toContain("КОНТЕКСТ ДАТИ");
    expect(prompt).toContain("Сьогодні: 2026-04-26, неділя.");
    expect(prompt).toContain(
      "Поточний тиждень (понеділок–неділя): 20.04–26.04.",
    );
    expect(prompt).toContain("День тижня: 7 з 7");
    expect(prompt).toContain("завершується");
  });

  it("без dateContext → prompt інструктує НЕ використовувати темпоральні маркери", async () => {
    anthropicMessages.mockResolvedValueOnce({
      response: { ok: true, status: 200 },
      data: { content: [{ type: "text", text: "ok" }] },
    });
    const res = makeRes();
    await coachInsight(makeReq({ snapshot: {} }), res);
    expect(res.statusCode).toBe(200);
    const [, payload] = anthropicMessages.mock.calls[0] as [
      unknown,
      { messages: { content: string }[] },
    ];
    expect(payload!.messages[0]!.content).toContain("Поточну дату не передано");
  });
});

describe("buildCoachInsightPrompt — що можна просити в людини", () => {
  // Регресія: коуч бачить лише підсумки й топ-5 {назва, сума}, але радив
  // «запиши, що ховається за тими 7169 грн в «Іншому»» - тобто просив дію,
  // ефекту якої не побачить (нотаток, описів і мерчантів він не отримує).
  // Бачить він перекатегоризацію банківських операцій, тож велике «Інше»
  // має вести саме туди.
  const snapshot = {
    finyk: {
      totalSpent: 9000,
      totalIncome: 0,
      txCount: 40,
      topCategories: [
        { name: "Інше", amount: 7169 },
        { name: "Продукти", amount: 1200 },
      ],
    },
  } as never;

  /** Промпт у перенесеннях рядків читається як суцільний текст. */
  const promptText = (): string =>
    buildCoachInsightPrompt({ snapshot, memory: null }).user.replace(
      /\s+/g,
      " ",
    );

  it("для великого «Інше» називає єдину досяжну дію: перенести операції в категорії", () => {
    expect(promptText()).toContain(
      "«Перенеси операції з «Іншого» у потрібні категорії»",
    );
  });

  it("забороняє просити те, чого коуч не прочитає, і дозволяє дії, що змінюють його дані", () => {
    const text = promptText();
    expect(text).toContain("нотаток, описів операцій і мерчантів не бачиш");
    expect(text).toContain(
      "Не проси «запиши причину», «поясни» чи «додай нотатку»",
    );
    expect(text).toContain(
      "віднести операції до категорій, записати їжу, тренування чи витрату, відмітити звичку",
    );
  });
});

// rel-18 — getCoachCorrelationsBlock дописує кореляції в system кожного
// першого туру чату, повз `context.max(40000)`. Блоби, збережені до появи
// ліміту в схемі (кореляція на 2 МБ), мають бути обрізані на читанні.
describe("getCoachCorrelationsBlock — обрізання роздутих кореляцій (rel-18)", () => {
  function memoryWith(correlations: string[], weekRange = "29 вер – 5 жов") {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          data: JSON.stringify({
            weeklyDigests: [{ weekKey: "2026-W40", weekRange, correlations }],
          }),
        },
      ],
    });
  }

  it("кореляція на 100 000 символів дає короткий блок", async () => {
    memoryWith(["x".repeat(100_000)]);
    const block = await getCoachCorrelationsBlock("user_1");
    expect(block).not.toBe("");
    // Заголовок блоку (~250 символів) + одна кореляція ≤ 500 + маркер.
    expect(block.length).toBeLessThan(1000);
    expect(block).not.toContain("x".repeat(501));
  });

  it("обрізає кожну з трьох кореляцій окремо", async () => {
    memoryWith(["a".repeat(50_000), "b".repeat(50_000), "c".repeat(50_000)]);
    const block = await getCoachCorrelationsBlock("user_1");
    expect(block.length).toBeLessThan(2000);
    expect(block).toContain("a".repeat(100));
    expect(block).toContain("b".repeat(100));
    expect(block).toContain("c".repeat(100));
  });

  it("обрізає роздутий підпис тижня", async () => {
    memoryWith(["коротка кореляція"], "w".repeat(100_000));
    const block = await getCoachCorrelationsBlock("user_1");
    expect(block.length).toBeLessThan(1000);
  });

  it("коротка кореляція проходить без змін", async () => {
    memoryWith(["у дні тренувань ти витрачаєш менше (r=-0.52, 14 дн)"]);
    const block = await getCoachCorrelationsBlock("user_1");
    expect(block).toContain(
      "- у дні тренувань ти витрачаєш менше (r=-0.52, 14 дн)",
    );
    expect(block).not.toContain("…");
  });
});
