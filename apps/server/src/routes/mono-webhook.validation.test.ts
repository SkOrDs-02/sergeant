import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

/**
 * Аудит rel-24: Monobank валідує `webHookUrl` GET-запитом і чекає строго
 * HTTP 200 (документація `POST /personal/webhook`). Раніше GET давав
 * Express-404, бо в `routes/mono-webhook.ts` стояли лише POST-и.
 *
 * Тест іде крізь ПОВНИЙ `createApp()` (helmet, CSRF-гард, access-лог,
 * rate-limit), а не крізь голий роутер: саме там 404/403 і ховались би.
 * Pool і Better Auth замокані, як у `apiV1.test.ts`, — нас цікавить wiring,
 * не БД; `queryMock` до того ж доводить «без побічних ефектів».
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

vi.mock("./../db.js", () => ({
  default: mockPool,
  pool: mockPool,
  query: queryMock,
  ensureSchema: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./../auth.js", () => ({
  auth: { handler: async () => new Response(null, { status: 404 }) },
  getSessionUser: vi.fn().mockResolvedValue(null),
  getFreshSessionUser: vi.fn().mockResolvedValue(null),
  getSessionUserSoft: vi.fn().mockResolvedValue(null),
}));

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

import { createApp } from "./../app.js";
import { logger } from "./../obs/logger.js";

const SECRET = "deadbeef".repeat(8);

beforeEach(() => {
  queryMock.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Monobank webhook URL validation (GET/HEAD) — rel-24", () => {
  it("GET /api/mono/webhook/:secret → 200 без сесії, без звернення до БД", async () => {
    const res = await request(createApp()).get(`/api/mono/webhook/${SECRET}`);
    expect(res.status).toBe(200);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("GET /api/mono/webhook (без секрету) → 200", async () => {
    const res = await request(createApp()).get("/api/mono/webhook");
    expect(res.status).toBe(200);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("секрет не перевіряється: довільне значення теж 200 (нічого не розкриваємо)", async () => {
    const app = createApp();
    for (const secret of ["x", "not-a-real-secret", "a".repeat(200)]) {
      const res = await request(app).get(`/api/mono/webhook/${secret}`);
      expect(res.status, secret).toBe(200);
    }
  });

  it("HEAD → 200 на обох шляхах", async () => {
    const app = createApp();
    expect((await request(app).head("/api/mono/webhook")).status).toBe(200);
    expect(
      (await request(app).head(`/api/mono/webhook/${SECRET}`)).status,
    ).toBe(200);
  });

  it("працює і через /api/v1/* (apiVersionRewrite)", async () => {
    const res = await request(createApp()).get(
      `/api/v1/mono/webhook/${SECRET}`,
    );
    expect(res.status).toBe(200);
  });

  it("секрет зі шляху не потрапляє в жоден лог (Hard Rule #21)", async () => {
    const spies = (["info", "warn", "error", "debug"] as const).map((lvl) =>
      vi.spyOn(logger, lvl),
    );
    const res = await request(createApp()).get(`/api/mono/webhook/${SECRET}`);
    expect(res.status).toBe(200);
    // access-лог пише на `finish` відповіді; supertest уже дочекався кінця.
    const logged = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    expect(logged).not.toContain(SECRET);
  });

  it("POST без секрету лишається 404 (поведінка POST не змінилась)", async () => {
    const res = await request(createApp())
      .post("/api/mono/webhook")
      .set("Content-Type", "application/json")
      .send({});
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Not found" });
  });

  it("POST із path-секретом НЕ потрапляє в GET-обробник (йде у webhookHandler)", async () => {
    const res = await request(createApp())
      .post(`/api/mono/webhook/${SECRET}`)
      .set("Content-Type", "application/json")
      .send({});
    // Порожнє тіло не проходить Zod-схему webhookHandler → 400. Головне:
    // це не відповідь GET-обробника (200 «ok»).
    expect(res.status).toBe(400);
    expect(res.text).not.toBe("ok");
  });
});
