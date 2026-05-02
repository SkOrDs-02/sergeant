import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import request from "supertest";

/**
 * Route-level contract tests для `/api/ai-memory/*`.
 *
 * Покриваємо:
 *   1. Auth guard: 401 без сесії.
 *   2. AI_MEMORY_ENABLED guard: 503 коли вмикач вимкнено.
 *   3. Schema validation: 400 при порожньому content / source поза allow-list /
 *      content > AI_MEMORY_INGEST_MAX_CONTENT_LEN.
 *   4. `finyk` / `digest` source-и заборонено через POST (server-side hooks
 *      обробляють — клієнт не повинен ребрендити).
 *   5. Happy path: 202 + enqueueMemoryIngest викликаний з payload.
 *   6. Metadata oversize → 413.
 */

// Встановлюємо env ПЕРЕД імпортом створьки/env.ts. Hoisted-блок виконується
// до import-statements, тож `env.AI_MEMORY_ENABLED` буде true коли module
// завантажиться. Інакше парсер `parseBoolEnv` зчитає false і всі тести
// отримають 503 від guard-у.
const {
  mockPool,
  queryMock,
  getSessionUserMock,
  enqueueMemoryIngestMock,
  recallMock,
} = vi.hoisted(() => {
  process.env.AI_MEMORY_ENABLED = "true";
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
  const enqueueMemoryIngestMock = vi.fn().mockResolvedValue(undefined);
  const recallMock = vi.fn().mockResolvedValue([]);
  return {
    mockPool,
    queryMock,
    getSessionUserMock,
    enqueueMemoryIngestMock,
    recallMock,
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

vi.mock("./../modules/ai-memory/ingestQueue.js", () => ({
  enqueueMemoryIngest: enqueueMemoryIngestMock,
  startMemoryIngestWorker: vi.fn(() => null),
  __resetMemoryIngestQueueForTesting: vi.fn(),
}));

vi.mock("./../modules/ai-memory/bootstrap.js", () => ({
  getAiMemory: () => ({
    remember: vi.fn().mockResolvedValue(undefined),
    recall: recallMock,
    forgetUser: vi.fn().mockResolvedValue(0),
    forgetSource: vi.fn().mockResolvedValue(undefined),
    health: vi.fn().mockResolvedValue({ ok: true, provider: "pgvector" }),
  }),
  __resetAiMemoryForTesting: vi.fn(),
}));

import { createApp } from "./../app.js";

const SAVED_ENABLED = process.env.AI_MEMORY_ENABLED;

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [{ "?column?": 1 }] });
  getSessionUserMock.mockReset();
  getSessionUserMock.mockResolvedValue(null);
  enqueueMemoryIngestMock.mockReset();
  enqueueMemoryIngestMock.mockResolvedValue(undefined);
  recallMock.mockReset();
  recallMock.mockResolvedValue([]);
  process.env.AI_MEMORY_ENABLED = "true";
});

afterAll(() => {
  if (SAVED_ENABLED === undefined) delete process.env.AI_MEMORY_ENABLED;
  else process.env.AI_MEMORY_ENABLED = SAVED_ENABLED;
});

describe("POST /api/ai-memory/ingest — auth guard", () => {
  it("→ 401 без сесії", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/ai-memory/ingest")
      .send({ source: "nutrition", content: "Сніданок: omelette + кава" });
    expect(res.status).toBe(401);
    expect(enqueueMemoryIngestMock).not.toHaveBeenCalled();
  });
});

// Note: AI_MEMORY_ENABLED guard покрито у `ingestQueue.test.ts`
// (enqueueMemoryIngest skip-ить + інкрементує mode=disabled). У route-тесті
// re-evaluate-нути `env.AI_MEMORY_ENABLED` неможливо без vi.resetModules-loop-у,
// бо `parseBoolEnv` фрізиться під час module-load-у (env.ts:194). Hard-вимикач
// додатково перевіряється manual-smoke-test-ом (підняти server з
// AI_MEMORY_ENABLED=false → POST → очікувати 503).

describe("POST /api/ai-memory/ingest — schema validation", () => {
  beforeEach(() => {
    getSessionUserMock.mockResolvedValue({ id: "u1" });
  });

  it("→ 400 коли content порожній", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/ai-memory/ingest")
      .send({ source: "nutrition", content: "" });
    expect(res.status).toBe(400);
    expect(enqueueMemoryIngestMock).not.toHaveBeenCalled();
  });

  it("→ 400 коли source поза allow-list", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/ai-memory/ingest")
      .send({ source: "evil", content: "abc" });
    expect(res.status).toBe(400);
    expect(enqueueMemoryIngestMock).not.toHaveBeenCalled();
  });

  it("→ 400 коли source=finyk (заборонено через клієнт)", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/ai-memory/ingest")
      .send({ source: "finyk", content: "abc" });
    expect(res.status).toBe(400);
    expect(enqueueMemoryIngestMock).not.toHaveBeenCalled();
  });

  it("→ 400 коли source=digest (заборонено через клієнт)", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/ai-memory/ingest")
      .send({ source: "digest", content: "abc" });
    expect(res.status).toBe(400);
    expect(enqueueMemoryIngestMock).not.toHaveBeenCalled();
  });

  it("→ 400 коли content > AI_MEMORY_INGEST_MAX_CONTENT_LEN", async () => {
    const app = createApp();
    const oversized = "x".repeat(5000);
    const res = await request(app)
      .post("/api/ai-memory/ingest")
      .send({ source: "nutrition", content: oversized });
    expect(res.status).toBe(400);
    expect(enqueueMemoryIngestMock).not.toHaveBeenCalled();
  });

  it("→ 400 при unknown ключі (strict schema)", async () => {
    const app = createApp();
    const res = await request(app).post("/api/ai-memory/ingest").send({
      source: "nutrition",
      content: "abc",
      // навмисно невалідне поле
      evil: "xss",
    });
    expect(res.status).toBe(400);
    expect(enqueueMemoryIngestMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/ai-memory/ingest — happy path", () => {
  beforeEach(() => {
    getSessionUserMock.mockResolvedValue({ id: "u1" });
  });

  it("→ 202 + enqueueMemoryIngest викликаний з нормалізованим payload", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/ai-memory/ingest")
      .send({
        source: "nutrition",
        sourceRef: "meal-2026-05-01-08:30",
        content: "Сніданок: omelette + кава",
        metadata: { kcal: 420, protein: 28 },
      });
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({
      ok: true,
      source: "nutrition",
      sourceRef: "meal-2026-05-01-08:30",
    });
    expect(enqueueMemoryIngestMock).toHaveBeenCalledTimes(1);
    expect(enqueueMemoryIngestMock).toHaveBeenCalledWith({
      userId: "u1",
      source: "nutrition",
      sourceRef: "meal-2026-05-01-08:30",
      content: "Сніданок: omelette + кава",
      metadata: { kcal: 420, protein: 28 },
    });
  });

  it("→ 202 з sourceRef=null коли клієнт його не передав (chat without stable id)", async () => {
    const app = createApp();
    const res = await request(app).post("/api/ai-memory/ingest").send({
      source: "chat",
      content: "Я хочу запам'ятати: книга — 'Atomic habits'",
    });
    expect(res.status).toBe(202);
    expect(enqueueMemoryIngestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        source: "chat",
        sourceRef: null,
      }),
    );
  });
});

describe("POST /api/ai-memory/ingest — metadata size guard", () => {
  beforeEach(() => {
    getSessionUserMock.mockResolvedValue({ id: "u1" });
  });

  it("→ 413 коли metadata blob > 8KB", async () => {
    const app = createApp();
    const huge = { blob: "x".repeat(10_000) };
    const res = await request(app).post("/api/ai-memory/ingest").send({
      source: "fizruk",
      content: "Тренування",
      metadata: huge,
    });
    expect(res.status).toBe(413);
    expect(res.body).toMatchObject({ code: "METADATA_TOO_LARGE" });
    expect(enqueueMemoryIngestMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/ai-memory/recall — auth guard", () => {
  it("→ 401 без сесії", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/ai-memory/recall")
      .send({ query: "test" });
    expect(res.status).toBe(401);
    expect(recallMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/ai-memory/recall — schema validation", () => {
  beforeEach(() => {
    getSessionUserMock.mockResolvedValue({ id: "u1" });
  });

  it("→ 400 коли query порожній", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/ai-memory/recall")
      .send({ query: "" });
    expect(res.status).toBe(400);
    expect(recallMock).not.toHaveBeenCalled();
  });

  it("→ 400 коли query > 1000 символів", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/ai-memory/recall")
      .send({ query: "x".repeat(1500) });
    expect(res.status).toBe(400);
    expect(recallMock).not.toHaveBeenCalled();
  });

  it("→ 400 коли topK > 50", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/ai-memory/recall")
      .send({ query: "test", topK: 100 });
    expect(res.status).toBe(400);
    expect(recallMock).not.toHaveBeenCalled();
  });

  it("→ 400 коли source поза allow-list", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/ai-memory/recall")
      .send({ query: "test", sources: ["evil"] });
    expect(res.status).toBe(400);
    expect(recallMock).not.toHaveBeenCalled();
  });

  it("→ 400 при unknown ключі (strict schema)", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/ai-memory/recall")
      .send({ query: "test", evil: "xss" });
    expect(res.status).toBe(400);
    expect(recallMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/ai-memory/recall — happy path", () => {
  beforeEach(() => {
    getSessionUserMock.mockResolvedValue({ id: "u1" });
  });

  it("→ 200 + memories[] коли service повертає результати", async () => {
    const fixedDate = new Date("2026-04-30T12:00:00Z");
    recallMock.mockResolvedValue([
      {
        id: 42,
        source: "nutrition",
        sourceRef: "meal-1",
        content: "omelette + кава",
        embeddingMeta: {
          provider: "voyage",
          model: "voyage-3.5-lite",
          version: "1",
          dim: 1024,
        },
        metadata: { kcal: 420 },
        score: 0.87,
        createdAt: fixedDate,
      },
    ]);
    const app = createApp();
    const res = await request(app)
      .post("/api/ai-memory/recall")
      .send({ query: "що я їв на сніданок", topK: 5 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      memories: [
        {
          id: 42,
          source: "nutrition",
          sourceRef: "meal-1",
          content: "omelette + кава",
          score: 0.87,
          createdAt: fixedDate.toISOString(),
          metadata: { kcal: 420 },
        },
      ],
    });
    expect(recallMock).toHaveBeenCalledWith({
      userId: "u1",
      query: "що я їв на сніданок",
      topK: 5,
      sources: undefined,
    });
  });

  it("→ 200 + порожній memories[] коли нічого не знайдено", async () => {
    recallMock.mockResolvedValue([]);
    const app = createApp();
    const res = await request(app)
      .post("/api/ai-memory/recall")
      .send({ query: "no matches" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ memories: [] });
  });

  it("прокидає sources фільтр у service.recall()", async () => {
    recallMock.mockResolvedValue([]);
    const app = createApp();
    const res = await request(app)
      .post("/api/ai-memory/recall")
      .send({ query: "test", sources: ["chat", "fizruk"] });
    expect(res.status).toBe(200);
    expect(recallMock).toHaveBeenCalledWith({
      userId: "u1",
      query: "test",
      topK: undefined,
      sources: ["chat", "fizruk"],
    });
  });
});

describe("POST /api/ai-memory/recall — provider failure", () => {
  beforeEach(() => {
    getSessionUserMock.mockResolvedValue({ id: "u1" });
  });

  it("→ 503 коли service кидає MissingVoyageApiKeyError", async () => {
    const { MissingVoyageApiKeyError } =
      await import("./../modules/ai-memory/embeddings.js");
    recallMock.mockRejectedValue(new MissingVoyageApiKeyError());
    const app = createApp();
    const res = await request(app)
      .post("/api/ai-memory/recall")
      .send({ query: "test" });
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ code: "EMBEDDING_PROVIDER_UNAVAILABLE" });
  });

  it("→ 503 коли service кидає VoyageHttpError (5xx)", async () => {
    const { VoyageHttpError } =
      await import("./../modules/ai-memory/embeddings.js");
    recallMock.mockRejectedValue(
      new VoyageHttpError(503, "Service down", true),
    );
    const app = createApp();
    const res = await request(app)
      .post("/api/ai-memory/recall")
      .send({ query: "test" });
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ code: "EMBEDDING_PROVIDER_UNAVAILABLE" });
  });

  it("→ 500 коли service кидає несподівану помилку (наприклад, pgvector down)", async () => {
    recallMock.mockRejectedValue(new Error("connection refused"));
    const app = createApp();
    const res = await request(app)
      .post("/api/ai-memory/recall")
      .send({ query: "test" });
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ code: "RECALL_FAILED" });
  });
});
