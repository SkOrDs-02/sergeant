import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import request from "supertest";

/**
 * Smoke-тести на 8 ендпоінтів через `createApp()` factory.
 *
 * Мета — НЕ перевіряти бізнес-логіку (є per-module тести), а зловити regress-и
 * у маршрутизації / middleware-чейні / env-based guard-ах: "роут існує",
 * "guard повертає очікуваний статус без кредів", "невідомий шлях → 404",
 * "helmet CSP не ламає прості GET-и".
 *
 * DB-шар мокається на рівні модуля (`./db.js`), щоб тести не залежали від
 * реального Postgres. Better-auth також мокається — його ініціалізація читає
 * pool і може тягнути зовнішні конекшн-и при імпорті.
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

vi.mock("./db.js", () => ({
  default: mockPool,
  pool: mockPool,
  query: queryMock,
  ensureSchema: vi.fn().mockResolvedValue(undefined),
}));

// Better-auth намагається ініціалізуватися при імпорті. У smoke-тестах нам
// достатньо, щоб рutteра mount-нувся — реальних /api/auth/* викликів ми тут
// не робимо, тож повертаємо мінімально-сумісний shape.
vi.mock("./auth.js", () => ({
  auth: { handler: async () => new Response(null, { status: 404 }) },
  getSessionUser: vi.fn().mockResolvedValue(null),
  getSessionUserSoft: vi.fn().mockResolvedValue(null),
}));

import { createApp } from "./app.js";

// Залишаємо env чистим між тестами: guard-и читають process.env, тож стан
// має бути детермінований.
const ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "API_SECRET",
  "METRICS_TOKEN",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "AI_QUOTA_DISABLED",
  "DATABASE_URL",
  "RATE_LIMIT_DISABLED",
];
const savedEnv: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) savedEnv[k] = process.env[k];

beforeEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [{ "?column?": 1 }] });
});

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe("smoke: createApp wiring", () => {
  it("GET /livez → 200 'ok'", async () => {
    const app = createApp();
    const res = await request(app).get("/livez");
    expect(res.status).toBe(200);
    expect(res.text).toBe("ok");
    // liveness не має торкатися БД.
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("GET /health → 200 when DB ping resolves", async () => {
    const app = createApp();
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.text).toBe("ok");
    expect(queryMock).toHaveBeenCalledWith("SELECT 1");
  });

  it("GET /health → 503 when DB ping rejects", async () => {
    queryMock.mockRejectedValueOnce(new Error("pg down"));
    const app = createApp();
    const res = await request(app).get("/health");
    expect(res.status).toBe(503);
    expect(res.text).toBe("unhealthy");
  });

  it("GET /metrics → 200 Prometheus text exposition", async () => {
    const app = createApp();
    const res = await request(app).get("/metrics");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/plain/);
    // Базова default-метрика node.js runtime завжди присутня.
    expect(res.text).toContain("process_cpu_user_seconds_total");
  });

  it("GET /api/push/vapid-public → 503 without VAPID env", async () => {
    const app = createApp();
    const res = await request(app).get("/api/push/vapid-public");
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });

  it("POST /api/push/send → 503 without API_SECRET env", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/push/send")
      .send({ user_id: "x", title: "t" });
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ code: "NOT_CONFIGURED" });
  });

  it("POST /api/chat → 503 without ANTHROPIC_API_KEY env", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/chat")
      .set("content-type", "application/json")
      .send({ messages: [] });
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });

  it("unknown route → 404 from default handler", async () => {
    const app = createApp();
    const res = await request(app).get("/api/this-does-not-exist");
    expect(res.status).toBe(404);
  });
});
