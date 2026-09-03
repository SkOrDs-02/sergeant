import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

/**
 * Route-level тест підключення `requireFreshSession()` до чутливих поверхонь
 * — аудит `docs/90-work/audits/2026-08-05-orphaned-code-audit.md` § 7а,
 * § 12 п. 3.
 *
 * Сценарій «stale»: 5-хвилинний `session.cookieCache` ще вважає сесію
 * живою (`getSessionUser` → user), а в БД її вже відкликано
 * (`getFreshSessionUser` → null). До цієї зміни всі три поверхні йшли через
 * кешований `requireSession()` і пропускали такий запит увесь кеш-вікно.
 * Тепер: експорт даних, видалення акаунта й підʼєднання/відʼєднання банку
 * → `401 UNAUTHORIZED`; звичайні роути (`GET /api/me`) лишаються на
 * кешованому варіанті і stale-сесію пропускають — це контроль, що ми не
 * перевели на DB-lookup усе підряд.
 *
 * 403 тут навмисно НЕ перевіряється: єдиний 403-гейт цих поверхонь
 * (`requireVerifiedEmail()` на `/api/mono/connect`) знято бета-винятком
 * (легасі-маркер у `mono-webhook.ts` зі строком до 2026-11-07); коли він повернеться,
 * порядок має бути `requireFreshSession() → requireVerifiedEmail()`, тобто
 * stale-сесія і тоді дасть 401, а не 403.
 */

const { mockPool, queryMock, getSessionUserMock, getFreshSessionUserMock } =
  vi.hoisted(() => {
    const queryMock = vi.fn().mockResolvedValue({ rows: [] });
    const mockPool = {
      query: queryMock,
      connect: vi.fn(),
      on: vi.fn(),
      totalCount: 0,
      idleCount: 0,
      waitingCount: 0,
    };
    return {
      mockPool,
      queryMock,
      getSessionUserMock: vi.fn(),
      getFreshSessionUserMock: vi.fn(),
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
  getFreshSessionUser: getFreshSessionUserMock,
  getSessionUserSoft: vi.fn().mockResolvedValue(null),
}));

// Лімітер робить власний `pool.query` — тут тестуємо порядок auth-middleware,
// не бакети (їх покриває `http/rateLimit.test.ts`).
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

const CACHED_USER = {
  id: "user_stale",
  email: "stale@example.com",
  name: "Stale",
  image: null,
  emailVerified: true,
};

const MONO_ENV = ["MONO_WEBHOOK_ENABLED", "MONO_TOKEN_ENC_KEY"];
const savedEnv: Record<string, string | undefined> = {};
for (const k of MONO_ENV) savedEnv[k] = process.env[k];

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [] });
  mockPool.connect.mockReset();
  getSessionUserMock.mockReset();
  getFreshSessionUserMock.mockReset();
  // Кеш каже «сесія жива», БД — «сесії нема».
  getSessionUserMock.mockResolvedValue(CACHED_USER);
  getFreshSessionUserMock.mockResolvedValue(null);
  process.env["MONO_WEBHOOK_ENABLED"] = "true";
  process.env["MONO_TOKEN_ENC_KEY"] = "0".repeat(64);
});

afterAll(() => {
  for (const k of MONO_ENV) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

const SENSITIVE_ROUTES = [
  ["get", "/api/me/export"],
  ["delete", "/api/me"],
  ["post", "/api/mono/connect"],
  ["post", "/api/mono/disconnect"],
  ["post", "/api/privat/connect"],
  ["post", "/api/privat/disconnect"],
] as const;

describe("stale session (кеш живий, у БД відкликано) → 401 на чутливих поверхнях", () => {
  it.each(SENSITIVE_ROUTES)(
    "%s %s → 401 UNAUTHORIZED, хендлер не виконується",
    async (method, path) => {
      const app = createApp();
      const res = await request(app)
        [method](path)
        .set("X-Requested-With", "XMLHttpRequest")
        .set("Authorization", "Bearer x")
        .send({});

      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ code: "UNAUTHORIZED" });
      // H8: CORP=same-origin і на 401 (fresh-варіант успадковує гарантію).
      expect(res.headers["cross-origin-resource-policy"]).toBe("same-origin");
      expect(getFreshSessionUserMock).toHaveBeenCalledTimes(1);
      // Кешований резолвер не є fallback-ом — інакше вікно відкрилось би знов.
      expect(getSessionUserMock).not.toHaveBeenCalled();
      // Жодного DB-запиту від хендлера (експорт / видалення / банк не почались).
      expect(queryMock).not.toHaveBeenCalled();
      expect(mockPool.connect).not.toHaveBeenCalled();
    },
  );

  it("контроль: GET /api/me лишається на кешованій сесії → 200", async () => {
    const app = createApp();
    const res = await request(app)
      .get("/api/me")
      .set("Authorization", "Bearer x");

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: CACHED_USER.id });
    expect(getFreshSessionUserMock).not.toHaveBeenCalled();
  });
});

describe("свіжа сесія підтверджена БД → чутливі поверхні працюють як раніше", () => {
  it("GET /api/me/export → 200 з експортом", async () => {
    getFreshSessionUserMock.mockResolvedValue(CACHED_USER);
    const app = createApp();
    const res = await request(app)
      .get("/api/me/export")
      .set("Authorization", "Bearer x");

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: CACHED_USER.id,
      email: CACHED_USER.email,
    });
    expect(res.body.data).toMatchObject({
      billing: { subscriptions: [] },
    });
  });

  it("DELETE /api/me → 200 і deletion transaction (той самий deleteUserData, що й у beforeDelete)", async () => {
    getFreshSessionUserMock.mockResolvedValue(CACHED_USER);
    const client = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
      release: vi.fn(),
    };
    mockPool.connect.mockResolvedValueOnce(client);
    const app = createApp();
    const res = await request(app)
      .delete("/api/me")
      .set("X-Requested-With", "XMLHttpRequest")
      .set("Authorization", "Bearer x");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const sql = client.query.mock.calls.map((c) => String(c[0]));
    expect(sql[0]).toBe("BEGIN");
    expect(sql[sql.length - 1]).toBe("COMMIT");
  });
});
