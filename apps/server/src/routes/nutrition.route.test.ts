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
