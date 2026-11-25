import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";

/**
 * sec-40 / priv-30 — `/healthz` і `/health/workers` за `METRICS_TOKEN`.
 *
 * Обидва роути без rate-limit, на кожен виклик ходять у БД і віддають
 * операційний стан (пул, circuit breaker, глибини черг,
 * `accountDeletion.pending`). Рішення власника 2026-11-21: гейт той самий,
 * що на `/metrics` (Bearer `METRICS_TOKEN`). Короткі проби (`/livez`,
 * `/readyz`, `/health` для healthcheck Coolify, nested `/health/*`)
 * лишаються анонімними — тест тримає обидва боки межі.
 */
const { mockPool, queryMock } = vi.hoisted(() => {
  const queryMock = vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] });
  const mockPool = {
    query: queryMock,
    connect: vi.fn(),
    on: vi.fn(),
    totalCount: 0,
    idleCount: 0,
    waitingCount: 0,
  };
  return { mockPool, queryMock };
});

vi.mock("../db.js", () => ({
  default: mockPool,
  pool: mockPool,
  query: queryMock,
  ensureSchema: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../auth.js", () => ({
  auth: { handler: async () => new Response(null, { status: 404 }) },
  getSessionUser: vi.fn().mockResolvedValue(null),
  getSessionUserSoft: vi.fn().mockResolvedValue(null),
}));

import { createApp } from "../app.js";
import { env } from "../env/env.js";

const TOKEN = "metrics_token_for_tests_0123456789";

// `env` парситься один раз на старті, тож `vi.stubEnv` до гейта не
// дістає — мутуємо розпарсений об'єкт, як `obs/metrics.test.ts`.
const savedToken = env.METRICS_TOKEN;
function setToken(value: string | undefined): void {
  const e = env as { METRICS_TOKEN?: string | undefined };
  if (value === undefined) delete e.METRICS_TOKEN;
  else e.METRICS_TOKEN = value;
}

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [{ "?column?": 1 }] });
  setToken(TOKEN);
});

afterEach(() => {
  setToken(savedToken);
});

const GATED = ["/healthz", "/health/workers"] as const;

describe("sec-40: діагностичні health-роути за METRICS_TOKEN", () => {
  it.each(GATED)(
    "GET %s без токена → 401 і жодного запиту в БД",
    async (path) => {
      const res = await request(createApp()).get(path);
      expect(res.status).toBe(401);
      expect(res.headers["content-type"]).toMatch(/text\/plain/);
      expect(res.text).toBe("unauthorized");
      expect(queryMock).not.toHaveBeenCalled();
    },
  );

  it.each(GATED)("GET %s з хибним токеном → 401", async (path) => {
    const res = await request(createApp())
      .get(path)
      .set("Authorization", "Bearer wrong_token_value_0123456789xx");
    expect(res.status).toBe(401);
  });

  it.each(GATED)("GET %s з правильним токеном → JSON-знімок", async (path) => {
    const res = await request(createApp())
      .get(path)
      .set("Authorization", `Bearer ${TOKEN}`);
    expect(res.status).not.toBe(401);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body).toMatchObject({
      status: expect.any(String),
      timestamp: expect.any(String),
    });
  });

  it("GET /metrics без токена → 401 (той самий гейт)", async () => {
    const res = await request(createApp()).get("/metrics");
    expect(res.status).toBe(401);
  });
});

describe("sec-40: проби платформи лишаються анонімними", () => {
  it.each([
    "/livez",
    "/readyz",
    "/health",
    "/health/liveness",
    "/health/readiness",
  ])("GET %s без токена → 200 'ok'", async (path) => {
    const res = await request(createApp()).get(path);
    expect(res.status).toBe(200);
    expect(res.text).toBe("ok");
  });
});
