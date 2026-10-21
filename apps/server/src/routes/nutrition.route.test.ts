import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import request from "supertest";

/**
 * Route-level contract tests для Premium-гейта nutrition (спека
 * `docs/work/specs/access-tiers.md`).
 *
 * Покриваємо:
 *   1. `week-plan` тільки Premium: Free → 402 PLAN_REQUIRED, Pro → НЕ 402.
 *   2. Фото (`analyze-photo` / `refine-photo`) більше не гейтяться планом:
 *      Free має власне тижневе відро фото, тож НЕ 402.
 *   3. Денний план → НЕ 402 навіть для Free (1 дія з тижневих).
 *
 * Bypass при `STRIPE_ENABLED=false` — unit-покриття у `requirePlan.test.ts`;
 * тут env жорстко `true` на весь файл (env.ts парситься раз при імпорті).
 */
const {
  mockPool,
  queryMock,
  getSessionUserMock,
  savedStripe,
  savedNutritionProvider,
  savedQuotaDisabled,
  savedAnthropicKey,
  savedVisionGateway,
  anthropicMessagesMock,
} = vi.hoisted(() => {
  const savedStripe = process.env["STRIPE_ENABLED"];
  const savedNutritionProvider = process.env["LLM_NUTRITION_PROVIDER"];
  const savedQuotaDisabled = process.env["AI_QUOTA_DISABLED"];
  const savedAnthropicKey = process.env["ANTHROPIC_API_KEY"];
  const savedVisionGateway = process.env["VISION_VIA_OPENROUTER"];
  process.env["STRIPE_ENABLED"] = "true";
  process.env["LLM_NUTRITION_PROVIDER"] = "stub";
  process.env["AI_QUOTA_DISABLED"] = "1";
  process.env["ANTHROPIC_API_KEY"] = "test-key";
  process.env["VISION_VIA_OPENROUTER"] = "false";
  const queryMock = vi.fn().mockResolvedValue({ rows: [] });
  const mockPool = {
    query: queryMock,
    connect: vi.fn(),
    on: vi.fn(),
    totalCount: 0,
    idleCount: 0,
    waitingCount: 0,
  };
  const getSessionUserMock = vi.fn().mockResolvedValue(null);
  const anthropicMessagesMock = vi.fn();
  return {
    mockPool,
    queryMock,
    getSessionUserMock,
    savedStripe,
    savedNutritionProvider,
    savedQuotaDisabled,
    savedAnthropicKey,
    savedVisionGateway,
    anthropicMessagesMock,
  };
});

vi.mock("./../db.js", () => ({
  default: mockPool,
  pool: mockPool,
  query: queryMock,
  ensureSchema: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./../auth.js", () => ({
  auth: { handler: async () => new Response(null, { status: 404 }) },
  getSessionUser: getSessionUserMock,
  getSessionUserSoft: vi.fn().mockResolvedValue(null),
}));

vi.mock("./../lib/anthropic.js", () => ({
  anthropicMessages: anthropicMessagesMock,
  anthropicMessagesStream: vi.fn(),
  extractAnthropicText: (data: {
    content?: Array<{ type: string; text?: string }>;
  }) =>
    (data.content ?? [])
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("\n")
      .trim(),
  recordAnthropicUsage: vi.fn(),
}));

import { createApp } from "./../app.js";

/** Synthetic free-plan: no active subscription row → getUserPlan → "free". */
function freePlanRows() {
  queryMock.mockResolvedValue({ rows: [] });
}

/** Active Pro subscription row → getUserPlan → "pro". */
function proPlanRows() {
  queryMock.mockResolvedValue({
    rows: [
      {
        plan: "pro",
        status: "active",
        current_period_end: null,
        cancel_at_period_end: false,
        provider: "stripe",
      },
    ],
  });
}

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [] });
  getSessionUserMock.mockReset();
  getSessionUserMock.mockResolvedValue({ id: "u1" });
  anthropicMessagesMock.mockReset();
  process.env["STRIPE_ENABLED"] = "true";
});

afterAll(() => {
  if (savedStripe === undefined) delete process.env["STRIPE_ENABLED"];
  else process.env["STRIPE_ENABLED"] = savedStripe;
  if (savedNutritionProvider === undefined)
    delete process.env["LLM_NUTRITION_PROVIDER"];
  else process.env["LLM_NUTRITION_PROVIDER"] = savedNutritionProvider;
  if (savedQuotaDisabled === undefined) delete process.env["AI_QUOTA_DISABLED"];
  else process.env["AI_QUOTA_DISABLED"] = savedQuotaDisabled;
  if (savedAnthropicKey === undefined) delete process.env["ANTHROPIC_API_KEY"];
  else process.env["ANTHROPIC_API_KEY"] = savedAnthropicKey;
  if (savedVisionGateway === undefined)
    delete process.env["VISION_VIA_OPENROUTER"];
  else process.env["VISION_VIA_OPENROUTER"] = savedVisionGateway;
});

function post(path: string) {
  return request(createApp())
    .post(path)
    .set("X-Requested-With", "XMLHttpRequest")
    .send({});
}

describe("nutrition week-plan: Premium gate", () => {
  it("→ 402 PLAN_REQUIRED для free-юзера", async () => {
    freePlanRows();
    const res = await post("/api/nutrition/week-plan");
    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({
      code: "PLAN_REQUIRED",
      requiredPlan: "pro",
    });
  });

  it("→ НЕ 402 для активного Pro-юзера", async () => {
    proPlanRows();
    const res = await post("/api/nutrition/week-plan");
    // 402 у цьому стеку продукує лише requirePlan, отже gate пустив запит.
    expect(res.status).not.toBe(402);
  });
});

describe("nutrition endpoints без Premium-гейта (Free)", () => {
  beforeEach(() => freePlanRows());

  for (const path of [
    "/api/nutrition/analyze-photo",
    "/api/nutrition/refine-photo",
    "/api/nutrition/day-plan",
  ]) {
    it(`→ НЕ 402 для free-юзера: POST ${path}`, async () => {
      const res = await post(path);
      expect(res.status).not.toBe(402);
    });
  }
});

describe("nutrition shopping-list HTTP contract", () => {
  it("rejects a request without a session before invoking the handler", async () => {
    getSessionUserMock.mockResolvedValue(null);
    const res = await request(createApp())
      .post("/api/nutrition/shopping-list")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ recipes: [{ title: "Омлет", ingredients: ["яйця"] }] });

    expect(res.status).toBe(401);
  });

  it("returns the handler response for a valid recipe request", async () => {
    const res = await request(createApp())
      .post("/api/nutrition/shopping-list")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({
        recipes: [{ title: "Омлет", ingredients: ["яйця"] }],
        locale: "uk-UA",
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      categories: [],
      rawText: '{"ok":true,"stub":true}',
    });
  });

  it("returns validation details for an invalid recipe body", async () => {
    const res = await request(createApp())
      .post("/api/nutrition/shopping-list")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ recipes: "not-an-array", locale: "uk-UA" });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "VALIDATION" });
    expect(res.body.details).toEqual(expect.any(Array));
  });
});

describe("nutrition parse-pantry HTTP contract", () => {
  it("returns the handler response for valid pantry text", async () => {
    const res = await request(createApp())
      .post("/api/nutrition/parse-pantry")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ text: "яблука", locale: "uk-UA" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      items: [],
      rawText: '{"ok":true,"stub":true}',
    });
  });

  it("returns validation details for empty pantry text", async () => {
    const res = await request(createApp())
      .post("/api/nutrition/parse-pantry")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ text: "", locale: "uk-UA" });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "VALIDATION" });
    expect(res.body.details).toEqual(expect.any(Array));
  });
});

describe("remaining nutrition text AI HTTP contracts", () => {
  const cases = [
    {
      path: "/api/nutrition/recommend-recipes",
      valid: {
        pantry: ["яблука"],
        preferences: { pantryMode: "only" },
        locale: "uk-UA",
      },
      invalid: { pantry: "яблука", locale: "uk-UA" },
      expected: { recipes: [], rawText: '{"ok":true,"stub":true}' },
    },
    {
      path: "/api/nutrition/day-plan",
      valid: { pantry: [], targets: { kcal: 1800 }, locale: "uk-UA" },
      invalid: { targets: { kcal: -1 }, locale: "uk-UA" },
      expected: { plan: { meals: [] }, rawText: '{"ok":true,"stub":true}' },
    },
    {
      path: "/api/nutrition/week-plan",
      valid: { pantry: [], preferences: { goal: "balanced" }, locale: "uk-UA" },
      invalid: { pantryMode: "unknown", locale: "uk-UA" },
      expected: {
        plan: { days: [], shoppingList: [] },
        rawText: '{"ok":true,"stub":true}',
      },
      pro: true,
    },
  ] as const;

  for (const { path, valid, invalid, expected, pro } of cases.map((entry) => ({
    ...entry,
    pro: "pro" in entry && entry.pro,
  }))) {
    it(`${path} returns the handler response for valid input`, async () => {
      if (pro) proPlanRows();
      if (path.endsWith("/day-plan")) {
        queryMock.mockImplementation(async (sql: string) =>
          sql.includes("health_data_consent")
            ? { rows: [{ health_data_consent: true }] }
            : { rows: [] },
        );
      }
      const res = await request(createApp())
        .post(path)
        .set("X-Requested-With", "XMLHttpRequest")
        .send(valid);

      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body).toMatchObject(expected);
    });

    it(`${path} returns validation details for invalid input`, async () => {
      if (pro) proPlanRows();
      if (path.endsWith("/day-plan")) {
        queryMock.mockImplementation(async (sql: string) =>
          sql.includes("health_data_consent")
            ? { rows: [{ health_data_consent: true }] }
            : { rows: [] },
        );
      }
      const res = await request(createApp())
        .post(path)
        .set("X-Requested-With", "XMLHttpRequest")
        .send(invalid);

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: "VALIDATION" });
      expect(res.body.details).toEqual(expect.any(Array));
    });
  }
});

describe("nutrition photo AI HTTP contracts", () => {
  // Magic-byte validation requires at least 200 decoded bytes. The model is
  // mocked, so this synthetic image never leaves the process.
  const pngHeader = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  ]);
  const image = Buffer.concat([
    pngHeader,
    Buffer.alloc(200 - pngHeader.length),
  ]).toString("base64");
  const photo = {
    image_base64: image,
    mime_type: "image/png",
    locale: "uk-UA",
  };
  const modelText = JSON.stringify({
    isFood: true,
    dishName: "Борщ",
    confidence: 0.8,
    macros: { kcal: 180, protein_g: 6, fat_g: 7, carbs_g: 22 },
    ingredients: [],
    questions: [],
  });

  beforeEach(() => {
    queryMock.mockImplementation(async (sql: string) =>
      sql.includes("health_data_consent")
        ? { rows: [{ health_data_consent: true }] }
        : { rows: [] },
    );
  });

  for (const { path, valid } of [
    { path: "/api/nutrition/analyze-photo", valid: photo },
    {
      path: "/api/nutrition/refine-photo",
      valid: { ...photo, prior_result: { dishName: "Борщ" } },
    },
  ]) {
    it(`${path} returns normalized photo output`, async () => {
      anthropicMessagesMock.mockResolvedValueOnce({
        response: { ok: true, status: 200 },
        data: { content: [{ type: "text", text: modelText }] },
      });
      const res = await request(createApp())
        .post(path)
        .set("X-Requested-With", "XMLHttpRequest")
        .send(valid);

      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body).toMatchObject({
        result: { isFood: true, dishName: "Борщ" },
        rawText: modelText,
      });
      expect(anthropicMessagesMock).toHaveBeenCalledTimes(1);
    });

    it(`${path} rejects an invalid image body before calling Anthropic`, async () => {
      const res = await request(createApp())
        .post(path)
        .set("X-Requested-With", "XMLHttpRequest")
        .send({ ...valid, image_base64: "" });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: "VALIDATION" });
      expect(res.body.details).toEqual(expect.any(Array));
      expect(anthropicMessagesMock).not.toHaveBeenCalled();
    });
  }
});
