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
  forgetUserMock,
} = vi.hoisted(() => {
  process.env["AI_MEMORY_ENABLED"] = "true";
  const queryMock = vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] });
  const mockPool = {
    query: queryMock,
    // L-8 Фаза 2 (2026-08-09): `buildMemoryDeleteHandler` тепер відкриває
    // транзакцію (`pool.connect()` + BEGIN/COMMIT/ROLLBACK) для узгодженого
    // видалення з `user_profile`. Клієнт делегує в той самий `queryMock`,
    // тож `stubAiMemorySql`-диспетчер нижче ловить і транзакційні виклики.
    connect: vi.fn().mockResolvedValue({ query: queryMock, release: vi.fn() }),
    on: vi.fn(),
    totalCount: 0,
    idleCount: 0,
    waitingCount: 0,
  };
  const getSessionUserMock = vi.fn().mockResolvedValue(null);
  const enqueueMemoryIngestMock = vi.fn().mockResolvedValue(undefined);
  const recallMock = vi.fn().mockResolvedValue([]);
  const forgetUserMock = vi.fn().mockResolvedValue(3);
  return {
    mockPool,
    queryMock,
    getSessionUserMock,
    enqueueMemoryIngestMock,
    recallMock,
    forgetUserMock,
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
    forgetUser: forgetUserMock,
    forgetSource: vi.fn().mockResolvedValue(undefined),
    health: vi.fn().mockResolvedValue({ ok: true, provider: "pgvector" }),
  }),
  __resetAiMemoryForTesting: vi.fn(),
}));

import { createApp } from "./../app.js";

const SAVED_ENABLED = process.env["AI_MEMORY_ENABLED"];

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [{ "?column?": 1 }] });
  getSessionUserMock.mockReset();
  getSessionUserMock.mockResolvedValue(null);
  enqueueMemoryIngestMock.mockReset();
  enqueueMemoryIngestMock.mockResolvedValue(undefined);
  recallMock.mockReset();
  recallMock.mockResolvedValue([]);
  forgetUserMock.mockReset();
  forgetUserMock.mockResolvedValue(3);
  process.env["AI_MEMORY_ENABLED"] = "true";
});

afterAll(() => {
  if (SAVED_ENABLED === undefined) delete process.env["AI_MEMORY_ENABLED"];
  else process.env["AI_MEMORY_ENABLED"] = SAVED_ENABLED;
});

describe("POST /api/ai-memory/ingest — auth guard", () => {
  it("→ 401 без сесії", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/ai-memory/ingest")
      .set("X-Requested-With", "XMLHttpRequest")
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
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ source: "nutrition", content: "" });
    expect(res.status).toBe(400);
    expect(enqueueMemoryIngestMock).not.toHaveBeenCalled();
  });

  it("→ 400 коли source поза allow-list", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/ai-memory/ingest")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ source: "evil", content: "abc" });
    expect(res.status).toBe(400);
    expect(enqueueMemoryIngestMock).not.toHaveBeenCalled();
  });

  it("→ 400 коли source=finyk (заборонено через клієнт)", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/ai-memory/ingest")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ source: "finyk", content: "abc" });
    expect(res.status).toBe(400);
    expect(enqueueMemoryIngestMock).not.toHaveBeenCalled();
  });

  it("→ 400 коли source=digest (заборонено через клієнт)", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/ai-memory/ingest")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ source: "digest", content: "abc" });
    expect(res.status).toBe(400);
    expect(enqueueMemoryIngestMock).not.toHaveBeenCalled();
  });

  it("→ 400 коли content > AI_MEMORY_INGEST_MAX_CONTENT_LEN", async () => {
    const app = createApp();
    const oversized = "x".repeat(5000);
    const res = await request(app)
      .post("/api/ai-memory/ingest")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ source: "nutrition", content: oversized });
    expect(res.status).toBe(400);
    expect(enqueueMemoryIngestMock).not.toHaveBeenCalled();
  });

  it("→ 400 при unknown ключі (strict schema)", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/ai-memory/ingest")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({
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
      .set("X-Requested-With", "XMLHttpRequest")
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
    const res = await request(app)
      .post("/api/ai-memory/ingest")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({
        source: "chat",
        content: "Я хочу запамʼятати: книга — 'Atomic habits'",
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
    const res = await request(app)
      .post("/api/ai-memory/ingest")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({
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
      .set("X-Requested-With", "XMLHttpRequest")
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
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ query: "" });
    expect(res.status).toBe(400);
    expect(recallMock).not.toHaveBeenCalled();
  });

  it("→ 400 коли query > 1000 символів", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/ai-memory/recall")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ query: "x".repeat(1500) });
    expect(res.status).toBe(400);
    expect(recallMock).not.toHaveBeenCalled();
  });

  it("→ 400 коли topK > 50", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/ai-memory/recall")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ query: "test", topK: 100 });
    expect(res.status).toBe(400);
    expect(recallMock).not.toHaveBeenCalled();
  });

  it("→ 400 коли source поза allow-list", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/ai-memory/recall")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ query: "test", sources: ["evil"] });
    expect(res.status).toBe(400);
    expect(recallMock).not.toHaveBeenCalled();
  });

  it("→ 400 при unknown ключі (strict schema)", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/ai-memory/recall")
      .set("X-Requested-With", "XMLHttpRequest")
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
      .set("X-Requested-With", "XMLHttpRequest")
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
      caller: "explicit-recall",
    });
  });

  it("→ 200 + порожній memories[] коли нічого не знайдено", async () => {
    recallMock.mockResolvedValue([]);
    const app = createApp();
    const res = await request(app)
      .post("/api/ai-memory/recall")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ query: "no matches" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ memories: [] });
  });

  it("прокидає sources фільтр у service.recall()", async () => {
    recallMock.mockResolvedValue([]);
    const app = createApp();
    const res = await request(app)
      .post("/api/ai-memory/recall")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ query: "test", sources: ["chat", "fizruk"] });
    expect(res.status).toBe(200);
    expect(recallMock).toHaveBeenCalledWith({
      userId: "u1",
      query: "test",
      topK: undefined,
      sources: ["chat", "fizruk"],
      caller: "explicit-recall",
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
      .set("X-Requested-With", "XMLHttpRequest")
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
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ query: "test" });
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ code: "EMBEDDING_PROVIDER_UNAVAILABLE" });
  });

  it("→ 500 коли service кидає несподівану помилку (наприклад, pgvector down)", async () => {
    recallMock.mockRejectedValue(new Error("connection refused"));
    const app = createApp();
    const res = await request(app)
      .post("/api/ai-memory/recall")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ query: "test" });
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ code: "RECALL_FAILED" });
  });
});

describe("DELETE /api/ai-memory", () => {
  it("hard-deletes memory only for the authenticated user", async () => {
    getSessionUserMock.mockResolvedValue({ id: "u-clear" });
    const app = createApp();

    const res = await request(app)
      .delete("/api/ai-memory")
      .set("X-Requested-With", "XMLHttpRequest");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, deleted: 3 });
    expect(forgetUserMock).toHaveBeenCalledWith("u-clear");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// GET /api/ai-memory/list  +  DELETE /api/ai-memory/:id
//
// AI-CONTEXT: тут два різні класи ризику, і асерти нижче цілять саме в них.
//   * Ізоляція між юзерами. `DELETE ... WHERE id = $1` без `user_id`
//     виглядає робочим у будь-якому happy-path тесті і при цьому дозволяє
//     будь-кому з сесією стирати чужі факти перебором id. Тому перевіряємо
//     не «повернувся 200», а САМ SQL і його параметри.
//   * Hard Rule #1. `pg` віддає `BIGSERIAL` стрінгою; клієнт кладе цей id
//     у RQ-ключ і в URL DELETE-а. `"12"` замість `12` роздвоїло б кеш і
//     мовчки зламало інвалідацію — жоден типчек цього не ловить, бо на
//     дроті все одно JSON.
// ─────────────────────────────────────────────────────────────────────────

/** Прапорець id-у як його віддає pg-драйвер: СТРІНГА, не число. */
function pgRow(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    source: "chat",
    content: `факт ${id}`,
    topic: null,
    created_at: new Date("2026-07-20T10:00:00Z"),
    ...over,
  };
}

/**
 * Диспатчер по тексту SQL: pool у цих тестах спільний із rate-limiter-ом і
 * `requirePlan`, тож відповідати одним фікстурним рядком на всі запити не
 * можна. `capture` збирає лише звернення до `ai_memories`.
 */
function stubAiMemorySql(
  rows: Array<Record<string, unknown>>,
  deleteRowCount = 1,
) {
  const capture: Array<{ sql: string; params: unknown[] }> = [];
  queryMock.mockImplementation((sql: unknown, params: unknown) => {
    const text = String(sql);
    if (text.includes("ai_memories")) {
      capture.push({ sql: text, params: (params as unknown[]) ?? [] });
      if (/^\s*DELETE/i.test(text)) {
        return Promise.resolve({ rows: [], rowCount: deleteRowCount });
      }
      return Promise.resolve({ rows, rowCount: rows.length });
    }
    return Promise.resolve({ rows: [{ "?column?": 1 }], rowCount: 1 });
  });
  return capture;
}

describe("GET /api/ai-memory/list", () => {
  it("→ 401 без сесії", async () => {
    const app = createApp();
    const res = await request(app)
      .get("/api/ai-memory/list")
      .set("X-Requested-With", "XMLHttpRequest");
    expect(res.status).toBe(401);
  });

  it("коерцить bigint id у number (Hard Rule #1)", async () => {
    // Робить неможливим `"12"` у відповіді: клієнт кладе id у RQ-ключ і в
    // URL DELETE-а, і стрінга там роздвоїла б кеш без жодної помилки.
    getSessionUserMock.mockResolvedValue({ id: "u1" });
    stubAiMemorySql([pgRow("12")]);
    const app = createApp();
    const res = await request(app)
      .get("/api/ai-memory/list")
      .set("X-Requested-With", "XMLHttpRequest");
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].id).toBe(12);
    expect(typeof res.body.items[0].id).toBe("number");
  });

  it("фільтрує soft-deleted рядки і скоупить запит на юзера", async () => {
    // `deleted_at IS NULL` — без нього в списку спливли б факти, які
    // founder уже стер через `/forget`, і кнопка «видалити» на них
    // вдавала б роботу. `user_id = $1` — щоб список не був чужим.
    getSessionUserMock.mockResolvedValue({ id: "u1" });
    const capture = stubAiMemorySql([]);
    const app = createApp();
    await request(app)
      .get("/api/ai-memory/list")
      .set("X-Requested-With", "XMLHttpRequest");
    expect(capture).toHaveLength(1);
    expect(capture[0]!.sql).toContain("deleted_at IS NULL");
    expect(capture[0]!.sql).toContain("user_id = $1");
    expect(capture[0]!.params[0]).toBe("u1");
  });

  it("не віддає probe-рядок і ставить nextCursor на останній елемент сторінки", async () => {
    // Запитуємо limit+1, щоб дізнатись про наступну сторінку. Якщо забути
    // зрізати зайвий рядок, юзер побачить на елемент більше, ніж просив, а
    // курсор перескочить його — тобто наступна сторінка почнеться з
    // пропуском. Тихо і майже непомітно.
    getSessionUserMock.mockResolvedValue({ id: "u1" });
    const capture = stubAiMemorySql([pgRow("30"), pgRow("20"), pgRow("10")]);
    const app = createApp();
    const res = await request(app)
      .get("/api/ai-memory/list?limit=2")
      .set("X-Requested-With", "XMLHttpRequest");
    expect(res.status).toBe(200);
    expect(capture[0]!.params[1]).toBe(3); // limit + 1
    expect(res.body.items.map((i: { id: number }) => i.id)).toEqual([30, 20]);
    expect(res.body.nextCursor).toBe(20);
  });

  it("остання сторінка → nextCursor: null", async () => {
    getSessionUserMock.mockResolvedValue({ id: "u1" });
    stubAiMemorySql([pgRow("30")]);
    const app = createApp();
    const res = await request(app)
      .get("/api/ai-memory/list?limit=2")
      .set("X-Requested-With", "XMLHttpRequest");
    expect(res.body.nextCursor).toBeNull();
  });

  it("cursor звужує вибірку по id", async () => {
    getSessionUserMock.mockResolvedValue({ id: "u1" });
    const capture = stubAiMemorySql([]);
    const app = createApp();
    await request(app)
      .get("/api/ai-memory/list?cursor=50")
      .set("X-Requested-With", "XMLHttpRequest");
    expect(capture[0]!.sql).toContain("id < $3");
    expect(capture[0]!.params[2]).toBe(50);
  });

  it("→ 400 на сміттєвий limit, без звернення до БД", async () => {
    getSessionUserMock.mockResolvedValue({ id: "u1" });
    const capture = stubAiMemorySql([]);
    const app = createApp();
    const res = await request(app)
      .get("/api/ai-memory/list?limit=999999")
      .set("X-Requested-With", "XMLHttpRequest");
    expect(res.status).toBe(400);
    expect(capture).toHaveLength(0);
  });
});

describe("DELETE /api/ai-memory/:id", () => {
  it("→ 401 без сесії", async () => {
    const app = createApp();
    const res = await request(app)
      .delete("/api/ai-memory/7")
      .set("X-Requested-With", "XMLHttpRequest");
    expect(res.status).toBe(401);
  });

  it("скоупить DELETE на user_id — інакше це стирання чужих фактів по id", async () => {
    // Найдорожчий баг цього PR-у. `WHERE id = $1` теж дає зелений
    // happy-path тест, тому перевіряємо САМ SQL і його параметри, а не
    // код відповіді.
    getSessionUserMock.mockResolvedValue({ id: "u1" });
    const capture = stubAiMemorySql([], 1);
    const app = createApp();
    const res = await request(app)
      .delete("/api/ai-memory/7")
      .set("X-Requested-With", "XMLHttpRequest");
    expect(res.status).toBe(200);
    expect(capture).toHaveLength(1);
    expect(capture[0]!.sql).toContain("user_id = $1");
    expect(capture[0]!.params).toEqual(["u1", 7]);
    expect(res.body).toEqual({ ok: true, deleted: true });
  });

  it("hard-delete, а не soft — рішення founder-а «зникає назавжди»", async () => {
    // Якщо хтось «уніфікує» цей шлях із `forget.ts`, запит стане
    // `UPDATE ... SET deleted_at = NOW()`, а UI продовжить обіцяти
    // «назавжди». Асерт ловить саме таку правку.
    getSessionUserMock.mockResolvedValue({ id: "u1" });
    const capture = stubAiMemorySql([], 1);
    const app = createApp();
    await request(app)
      .delete("/api/ai-memory/7")
      .set("X-Requested-With", "XMLHttpRequest");
    expect(capture[0]!.sql).toMatch(/^\s*DELETE FROM ai_memories/);
    expect(capture[0]!.sql).not.toContain("deleted_at");
  });

  it("ідемпотентний: неіснуючий id → 200 + deleted:false", async () => {
    // 404 тут ламав би реальний сценарій (подвійний тап, друга вкладка):
    // UI показував би помилку на дії, яка вже досягла бажаного стану.
    getSessionUserMock.mockResolvedValue({ id: "u1" });
    stubAiMemorySql([], 0);
    const app = createApp();
    const res = await request(app)
      .delete("/api/ai-memory/999")
      .set("X-Requested-With", "XMLHttpRequest");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, deleted: false });
  });

  it("→ 400 на нечисловий id, БЕЗ звернення до БД", async () => {
    // Захист від запиту з `NaN` у параметрі: Postgres відкинув би його
    // помилкою типу, але тоді 500 замість 400 і шум у Sentry.
    getSessionUserMock.mockResolvedValue({ id: "u1" });
    const capture = stubAiMemorySql([], 1);
    const app = createApp();
    const res = await request(app)
      .delete("/api/ai-memory/abc")
      .set("X-Requested-With", "XMLHttpRequest");
    expect(res.status).toBe(400);
    expect(capture).toHaveLength(0);
  });
});
