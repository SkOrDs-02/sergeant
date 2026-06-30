import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import request from "supertest";

/**
 * Route-level contract tests для Pro-gate на nutrition Vision-endpoint-ах.
 *
 * `analyze-photo` / `refine-photo` йдуть через Sonnet 4.6 Vision (cost=3) —
 * найдорожчий AI-шлях, тому вони Pro-only (`requirePlan(pool, "pro")`).
 * Решта nutrition-AI лишається метрованою (free отримує денну квоту), тож
 * gate на них свідомо НЕ навішуємо — це покрито відсутністю 402 нижче.
 *
 * Покриваємо:
 *   1. Free-юзер → 402 PLAN_REQUIRED на обох Vision-endpoint-ах (Anthropic
 *      не викликається — gate стоїть перед requireAnthropicKey/quota).
 *   2. Pro-юзер → НЕ 402 (запит проходить gate; 402 у цьому стеку продукує
 *      лише requirePlan, тож `not.toBe(402)` — точний сигнал що gate пустив).
 *   3. Метровані text-endpoint-и (day-plan) → НЕ 402 навіть для free.
 *
 * Bypass при `STRIPE_ENABLED=false` — unit-покриття у `requirePlan.test.ts`;
 * тут env жорстко `true` на весь файл (env.ts парситься раз при імпорті).
 */
const { mockPool, queryMock, getSessionUserMock } = vi.hoisted(() => {
  process.env["STRIPE_ENABLED"] = "true";
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
  return { mockPool, queryMock, getSessionUserMock };
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

import { createApp } from "./../app.js";

const SAVED_STRIPE = process.env["STRIPE_ENABLED"];

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
  process.env["STRIPE_ENABLED"] = "true";
});

afterAll(() => {
  if (SAVED_STRIPE === undefined) delete process.env["STRIPE_ENABLED"];
  else process.env["STRIPE_ENABLED"] = SAVED_STRIPE;
});

const VISION_ENDPOINTS = [
  "/api/nutrition/analyze-photo",
  "/api/nutrition/refine-photo",
] as const;

describe("nutrition Vision endpoints — Pro gate (free → 402)", () => {
  beforeEach(() => freePlanRows());

  for (const path of VISION_ENDPOINTS) {
    it(`→ 402 PLAN_REQUIRED для free-юзера: POST ${path}`, async () => {
      const app = createApp();
      const res = await request(app)
        .post(path)
        .set("X-Requested-With", "XMLHttpRequest")
        .send({});
      expect(res.status).toBe(402);
      expect(res.body).toMatchObject({
        code: "PLAN_REQUIRED",
        requiredPlan: "pro",
      });
    });
  }
});

describe("nutrition Vision endpoints — Pro gate (pro passes)", () => {
  beforeEach(() => proPlanRows());

  for (const path of VISION_ENDPOINTS) {
    it(`→ НЕ 402 для активного Pro-юзера: POST ${path}`, async () => {
      const app = createApp();
      const res = await request(app)
        .post(path)
        .set("X-Requested-With", "XMLHttpRequest")
        .send({});
      // 402 у цьому стеку продукує лише requirePlan — отже gate пустив запит
      // далі (наступні guard-и/валідація можуть дати інший статус).
      expect(res.status).not.toBe(402);
    });
  }
});

describe("nutrition metered text endpoints — без Pro-gate", () => {
  beforeEach(() => freePlanRows());

  it("→ НЕ 402 для free-юзера: POST /api/nutrition/day-plan", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/nutrition/day-plan")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({});
    expect(res.status).not.toBe(402);
  });
});
