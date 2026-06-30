import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";

// Cold dynamic imports of the full Express app are slow on Windows when this
// route-wiring file runs inside a large parallel batch; keep assertions strict.
vi.setConfig({ testTimeout: 60_000 });

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
 *
 * AI-CONTEXT: env single-source migration.  `requireAnthropicKey` reads
 * `env.ANTHROPIC_API_KEY` (validated Zod env, captured at first load of
 * `apps/server/src/env/env.ts`), not `process.env` directly.  That means
 * mutating `process.env.ANTHROPIC_API_KEY` after the env module has been
 * imported is a no-op for the guard.  Tests must therefore use the
 * canonical vitest pattern from `apps/server/src/auth.test.ts`:
 *
 *   vi.resetModules();
 *   vi.stubEnv("ANTHROPIC_API_KEY", "…");
 *   const { createApp } = await import("./../app.js");
 *
 * `vi.unstubAllEnvs()` + `vi.resetModules()` in `afterEach` keep tests
 * isolated.  `AI_QUOTA_DISABLED` *is* still read via `process.env` at
 * runtime (see `modules/chat/aiQuota.ts` JSDoc) and so can use plain
 * `vi.stubEnv` without re-importing modules.
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

// `coach` router stacks `rateLimitExpress({ key: "api:coach", … })` before the
// handler (див. `apps/server/src/routes/coach.ts`). Це консьюмить перший
// `queryMock.mockResolvedValueOnce` (rate-limit Postgres-фолбек), і в результаті
// handler читає `{ rows: [{ "?column?": 1 }] }` за дефолтом, повертаючи
// `memory: null` замість підставленого об'єкта. Цей файл тестує route-wiring
// + handler-shape; rate-limiter має власний `http/rateLimit.test.ts`. Mock-аємо
// як passthrough.
vi.mock("./../http/rateLimit.js", async () => {
  const actual = await vi.importActual<typeof import("./../http/rateLimit.js")>(
    "./../http/rateLimit.js",
  );
  return {
    ...actual,
    rateLimitExpress: () => (_req: unknown, _res: unknown, next: () => void) =>
      next(),
  };
});

/**
 * Re-import `./../app.js` after `vi.stubEnv` so the validated env module
 * (`apps/server/src/env/env.ts`) re-parses with the test's stubbed values.
 * The `vi.mock` calls above are hoisted and persist across `vi.resetModules`,
 * so we do not need to re-register them per test.
 */
async function loadCreateApp(): Promise<
  (typeof import("./../app.js"))["createApp"]
> {
  vi.resetModules();
  const mod = await import("./../app.js");
  return mod.createApp;
}

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [{ "?column?": 1 }] });
  getSessionUserMock.mockReset();
  getSessionUserMock.mockResolvedValue(null);
  // Default key-state for every test: no Anthropic key (covers auth-guard
  // tests and the explicit `key guard` describe-block).  Individual tests
  // that need a key call `vi.stubEnv("ANTHROPIC_API_KEY", "…")` again.
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("AI_QUOTA_DISABLED", "1");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("coach routes — auth guard (unauthenticated → 401)", () => {
  it("GET /api/coach/memory → 401 без сесії", async () => {
    const createApp = await loadCreateApp();
    const app = createApp();
    const res = await request(app).get("/api/coach/memory");
    expect(res.status).toBe(401);
  });

  it("POST /api/coach/memory → 401 без сесії", async () => {
    const createApp = await loadCreateApp();
    const app = createApp();
    const res = await request(app)
      .post("/api/coach/memory")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ weeklyDigest: { weekKey: "2026-W18" } });
    expect(res.status).toBe(401);
  });

  it("POST /api/coach/insight → 401 без сесії", async () => {
    const createApp = await loadCreateApp();
    const app = createApp();
    const res = await request(app)
      .post("/api/coach/insight")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ snapshot: {} });
    expect(res.status).toBe(401);
  });
});

describe("coach routes — key guard", () => {
  it("POST /api/coach/insight → 503 з сесією але без ANTHROPIC_API_KEY", async () => {
    getSessionUserMock.mockResolvedValue({ id: "u1" });
    // `beforeEach` already stubs `ANTHROPIC_API_KEY=""`; re-load app so the
    // empty value lands in the freshly-parsed `env` module.
    const createApp = await loadCreateApp();
    const app = createApp();
    const res = await request(app)
      .post("/api/coach/insight")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ snapshot: {} });
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });
});

describe("coach routes — GET /memory", () => {
  it("повертає { memory: null } коли coach-рядка ще нема", async () => {
    getSessionUserMock.mockResolvedValue({ id: "u1" });
    // Перший query — coach_memory SELECT для memory; повертає порожній масив.
    queryMock.mockResolvedValueOnce({ rows: [] });

    const createApp = await loadCreateApp();
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

    const createApp = await loadCreateApp();
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

    const createApp = await loadCreateApp();
    const app = createApp();
    const res = await request(app)
      .post("/api/coach/memory")
      .set("X-Requested-With", "XMLHttpRequest")
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

    const createApp = await loadCreateApp();
    const app = createApp();
    const res = await request(app)
      .post("/api/coach/memory")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ weeklyDigest: { summary: "no weekKey" } });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });
});

describe("coach routes — POST /insight", () => {
  it("повертає { insight: string } коли ключ є і snapshot валідний", async () => {
    getSessionUserMock.mockResolvedValue({ id: "u1" });
    // Stub the key BEFORE `loadCreateApp()` so the env module sees it on
    // re-parse.  `vi.unstubAllEnvs()` in `afterEach` rolls this back.
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    // SELECT coach memory
    queryMock.mockResolvedValueOnce({ rows: [] });
    // SELECT ai_quota
    queryMock.mockResolvedValueOnce({ rows: [{ request_count: 1 }] });
    // SELECT push subscriptions for quiet push
    queryMock.mockResolvedValueOnce({ rows: [] });

    const createApp = await loadCreateApp();
    const app = createApp();
    const res = await request(app)
      .post("/api/coach/insight")
      .set("X-Requested-With", "XMLHttpRequest")
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
