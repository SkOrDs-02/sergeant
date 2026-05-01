import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import request from "supertest";

/**
 * Route-level contract tests for `/api/coach/*`.
 *
 * Covers:
 *   1. Auth guard: all three endpoints reject unauthenticated requests (401).
 *   2. Key guard: `POST /insight` rejects missing Anthropic key (503).
 *   3. Happy path shapes: authenticated `GET /memory` returns `{ memory }`.
 *   4. `POST /memory` with valid payload returns `{ ok: true }`.
 *   5. `POST /insight` with valid payload + key calls Anthropic and returns
 *      `{ insight }`.
 *
 * These tests complement `modules/chat/coach.test.ts` (unit, handler-level)
 * by asserting the full HTTP wiring: setModule → rateLimit → requireSession →
 * requireAnthropicKey → requireAiQuota → asyncHandler.
 */

const { mockPool, queryMock, getSessionUserMock } = vi.hoisted(() => {
  const queryMock = vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] });
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

vi.mock("./../lib/anthropic.js", () => ({
  // `anthropicMessages` returns `{ response, data }` — see
  // `apps/server/src/lib/anthropic.ts` `AnthropicMessagesResult`. Production
  // code reads `aiRes?.ok` to decide whether to throw `ExternalServiceError`,
  // so we need a minimally-shaped `Response`-like object with `ok: true` and
  // `status: 200`. Earlier this mock returned the bare `{ content: [...] }`
  // payload, which made the handler's `if (!aiRes?.ok)` always fire and
  // surface as a 502 in the test.
  anthropicMessages: vi.fn().mockResolvedValue({
    response: { ok: true, status: 200 } as unknown as Response,
    data: {
      content: [{ type: "text", text: "Ось порада для тебе." }],
    },
  }),
  extractAnthropicText: vi.fn(
    (d: { content?: { type: string; text?: string }[] }) =>
      (d?.content ?? [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim(),
  ),
  recordAnthropicUsage: vi.fn(),
}));

vi.mock("./../push/send.js", () => ({
  sendToUserQuietly: vi.fn().mockResolvedValue(undefined),
}));

import { createApp } from "./../app.js";

const SAVED_KEY = process.env.ANTHROPIC_API_KEY;
const SAVED_DISABLED = process.env.AI_QUOTA_DISABLED;

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [{ "?column?": 1 }] });
  getSessionUserMock.mockReset();
  getSessionUserMock.mockResolvedValue(null);
  delete process.env.ANTHROPIC_API_KEY;
  process.env.AI_QUOTA_DISABLED = "1";
});

afterAll(() => {
  if (SAVED_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = SAVED_KEY;
  if (SAVED_DISABLED === undefined) delete process.env.AI_QUOTA_DISABLED;
  else process.env.AI_QUOTA_DISABLED = SAVED_DISABLED;
});

describe("coach routes — auth guard (unauthenticated → 401)", () => {
  it("GET /api/coach/memory → 401 без сесії", async () => {
    const app = createApp();
    const res = await request(app).get("/api/coach/memory");
    expect(res.status).toBe(401);
  });

  it("POST /api/coach/memory → 401 без сесії", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/coach/memory")
      .send({ weeklyDigest: { weekKey: "2026-W18" } });
    expect(res.status).toBe(401);
  });

  it("POST /api/coach/insight → 401 без сесії", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/coach/insight")
      .send({ snapshot: {} });
    expect(res.status).toBe(401);
  });
});

describe("coach routes — key guard", () => {
  it("POST /api/coach/insight → 503 з сесією але без ANTHROPIC_API_KEY", async () => {
    getSessionUserMock.mockResolvedValue({ id: "u1" });
    const app = createApp();
    const res = await request(app)
      .post("/api/coach/insight")
      .send({ snapshot: {} });
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });
});

describe("coach routes — GET /memory", () => {
  it("повертає { memory: null } коли coach-рядка ще нема", async () => {
    getSessionUserMock.mockResolvedValue({ id: "u1" });
    // Перший query — module_data SELECT для memory; повертає порожній масив.
    queryMock.mockResolvedValueOnce({ rows: [] });

    const app = createApp();
    const res = await request(app).get("/api/coach/memory");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ memory: null });
  });

  it("повертає { memory: <збережені дані> } коли рядок існує", async () => {
    getSessionUserMock.mockResolvedValue({ id: "u1" });
    const memoryData = {
      weeklyDigests: [],
      lastInsightDate: "2026-04-28",
      lastInsightText: "Все добре.",
    };
    queryMock.mockResolvedValueOnce({
      rows: [{ data: JSON.stringify(memoryData) }],
    });

    const app = createApp();
    const res = await request(app).get("/api/coach/memory");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      memory: {
        weeklyDigests: [],
        lastInsightDate: "2026-04-28",
        lastInsightText: "Все добре.",
      },
    });
  });
});

describe("coach routes — POST /memory", () => {
  it("зберігає weeklyDigest і повертає { ok: true }", async () => {
    getSessionUserMock.mockResolvedValue({ id: "u1" });
    // SELECT existing memory → empty
    queryMock.mockResolvedValueOnce({ rows: [] });
    // UPSERT → success
    queryMock.mockResolvedValueOnce({ rows: [] });

    const app = createApp();
    const res = await request(app)
      .post("/api/coach/memory")
      .send({
        weeklyDigest: {
          weekKey: "2026-W18",
          weekRange: "28 квіт – 4 трав 2026",
          generatedAt: new Date().toISOString(),
          finyk: { summary: "Витрати в нормі." },
        },
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
  });

  it("повертає 400 при невалідному body (weeklyDigest без weekKey)", async () => {
    getSessionUserMock.mockResolvedValue({ id: "u1" });

    const app = createApp();
    const res = await request(app)
      .post("/api/coach/memory")
      .send({ weeklyDigest: { summary: "no weekKey" } });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });
});

describe("coach routes — POST /insight", () => {
  it("повертає { insight: string } коли ключ є і snapshot валідний", async () => {
    getSessionUserMock.mockResolvedValue({ id: "u1" });
    process.env.ANTHROPIC_API_KEY = "test-key";
    // SELECT coach memory
    queryMock.mockResolvedValueOnce({ rows: [] });
    // SELECT ai_quota
    queryMock.mockResolvedValueOnce({ rows: [{ request_count: 1 }] });
    // SELECT push subscriptions for quiet push
    queryMock.mockResolvedValueOnce({ rows: [] });

    const app = createApp();
    const res = await request(app)
      .post("/api/coach/insight")
      .set("x-anthropic-key", "test-key")
      .send({
        snapshot: {
          finyk: { summary: "5 000 ₴ витрати." },
          fizruk: null,
          nutrition: null,
          routine: null,
        },
        dateContext: {
          today: "2026-05-01",
          dayOfWeek: "четвер",
          weekNumber: 18,
        },
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ insight: expect.any(String) });
    expect(typeof res.body.insight).toBe("string");
    expect(res.body.insight.length).toBeGreaterThan(0);
  });
});
