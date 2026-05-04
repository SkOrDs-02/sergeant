import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import request from "supertest";

/**
 * Supertest-покриття нового `/api/v1/*` префікса і bearer-auth шляху.
 *
 * Ми покриваємо ключові гарантії з `docs/architecture/api-v1.md`:
 *   1. роут працює і на `/api/*`, і на `/api/v1/*` (дзеркало 1:1);
 *   2. `/api/v1/me` резолвить юзера і через cookie, і через
 *      `Authorization: Bearer`;
 *   3. `POST /api/v1/push/register` валідує платформу і пише у правильну
 *      таблицю (push_subscriptions для web, push_devices для ios/android);
 *   4. bearer без валідної сесії — 401, не crash.
 *
 * DB-pool і Better Auth мокаються, бо нам цікавий саме wiring —
 * `apiVersionRewrite`, router-mounting, і поведінка `requireSession` під
 * різними headers. Реальний Better Auth bearer-плагін протестований
 * upstream; тут ми підміняємо `getSessionUser` щоб контролювати сесію.
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

import { createApp } from "./../app.js";

const ENV_KEYS = ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_EMAIL"];
const savedEnv: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) savedEnv[k] = process.env[k];

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [{ "?column?": 1 }] });
  getSessionUserMock.mockReset();
  getSessionUserMock.mockResolvedValue(null);
  for (const k of ENV_KEYS) delete process.env[k];
});

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe("api versioning — /api/v1/* дзеркалить /api/*", () => {
  it("GET /api/v1/push/vapid-public → такий самий статус як /api/push/vapid-public", async () => {
    const app = createApp();
    const legacy = await request(app).get("/api/push/vapid-public");
    const v1 = await request(app).get("/api/v1/push/vapid-public");
    expect(v1.status).toBe(legacy.status);
    // Обидва — 503 (VAPID не сконфігурений у тестах) і тіло ідентичне.
    expect(v1.status).toBe(503);
    expect(v1.body).toEqual(legacy.body);
  });

  it("невідомий /api/v1/* → 404, як і /api/*", async () => {
    const app = createApp();
    const res = await request(app).get("/api/v1/this-does-not-exist");
    expect(res.status).toBe(404);
  });

  it("не переписує /api/* без v1 (не ламає існуючий веб)", async () => {
    const app = createApp();
    const res = await request(app).get("/api/push/vapid-public");
    // Якщо apiVersionRewrite помилково зачепив би цей шлях, він би став
    // `/push/vapid-public` і полетів би у 404.
    expect(res.status).toBe(503);
  });

  it("не чіпає /api/auth/* префікс — Better Auth basePath незмінний", async () => {
    const app = createApp();
    // `/api/v1/auth/...` має бути переписаний на `/api/auth/...` і вже
    // там зловлений better-auth handler-ом (який мокнутий у 404).
    const res = await request(app).get("/api/v1/auth/session");
    expect(res.status).toBe(404);
    // Важливо: НЕ fall-through на загальний 404 express-а — роут
    // існує, тому handler повернув 404 сам.
  });
});

describe("/api/v1/me — cookie і bearer резолвляться однаково", () => {
  const user = {
    id: "user_123",
    email: "u@example.com",
    name: "Test User",
    image: null,
    emailVerified: true,
  };

  it("без auth → 401", async () => {
    const app = createApp();
    const res = await request(app).get("/api/v1/me");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("cookie-сесія → 200 з user", async () => {
    getSessionUserMock.mockResolvedValueOnce(user);
    const app = createApp();
    const res = await request(app)
      .get("/api/v1/me")
      .set("Cookie", "better-auth.session_token=cookie-stub");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      user: { id: user.id, email: user.email, emailVerified: true },
    });
  });

  it("Authorization: Bearer → 200 з тим самим shape", async () => {
    getSessionUserMock.mockResolvedValueOnce(user);
    const app = createApp();
    const res = await request(app)
      .get("/api/v1/me")
      .set("Authorization", "Bearer mobile-token-stub");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      user: { id: user.id, email: user.email, emailVerified: true },
    });
    // getSessionUser отримав req — саме він всередині better-auth читає
    // headers (cookie або Authorization). Один виклик = один канал.
    expect(getSessionUserMock).toHaveBeenCalledTimes(1);
  });

  it("bearer з невалідним токеном (getSessionUser → null) → 401", async () => {
    getSessionUserMock.mockResolvedValueOnce(null);
    const app = createApp();
    const res = await request(app)
      .get("/api/v1/me")
      .set("Authorization", "Bearer garbage");
    expect(res.status).toBe(401);
  });

  it("/api/me — той самий endpoint, що й /api/v1/me", async () => {
    getSessionUserMock.mockResolvedValue(user);
    const app = createApp();
    const legacy = await request(app)
      .get("/api/me")
      .set("Authorization", "Bearer x");
    const v1 = await request(app)
      .get("/api/v1/me")
      .set("Authorization", "Bearer x");
    expect(legacy.status).toBe(200);
    expect(v1.status).toBe(200);
    expect(v1.body).toEqual(legacy.body);
  });
});

describe("POST /api/v1/push/register", () => {
  const user = { id: "user_abc" };

  it("без сесії → 401", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/v1/push/register")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ platform: "ios", token: "t".repeat(64) });
    expect(res.status).toBe(401);
  });

  it("ios токен → INSERT у push_devices з ON CONFLICT", async () => {
    getSessionUserMock.mockResolvedValue(user);
    queryMock.mockResolvedValue({ rowCount: 1, rows: [] });
    const app = createApp();
    const res = await request(app)
      .post("/api/v1/push/register")
      .set("X-Requested-With", "XMLHttpRequest")
      .set("Authorization", "Bearer x")
      .send({ platform: "ios", token: "t".repeat(64) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, platform: "ios" });
    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0];
    expect(String(sql)).toMatch(/INSERT INTO push_devices/);
    expect(String(sql)).toMatch(/ON CONFLICT \(platform, token\)/);
    expect(params).toEqual([user.id, "ios", "t".repeat(64)]);
  });

  it("android токен → той самий шлях, platform=android", async () => {
    getSessionUserMock.mockResolvedValue(user);
    queryMock.mockResolvedValue({ rowCount: 1, rows: [] });
    const app = createApp();
    const res = await request(app)
      .post("/api/v1/push/register")
      .set("X-Requested-With", "XMLHttpRequest")
      .set("Authorization", "Bearer x")
      .send({ platform: "android", token: "fcm-registration-token" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, platform: "android" });
    expect(queryMock.mock.calls[0][1]).toEqual([
      user.id,
      "android",
      "fcm-registration-token",
    ]);
  });

  it("web з keys — валідно парситься і доходить до vapid-guard-а", async () => {
    // `vapidReady` у `server/modules/push/push.ts` обчислюється на module-load, тож
    // 200-case для web тут не відтворюваний без підготовки env ДО першого
    // `import` (це вже покриває `server/smoke.test.ts` на рівні subscribe).
    // Тут важливо: discriminated union валідатор приймає `web` payload —
    // без цього ми б впали на 400 raніше, ніж досягли vapid-guard-а.
    getSessionUserMock.mockResolvedValue(user);
    const app = createApp();
    const res = await request(app)
      .post("/api/v1/push/register")
      .set("X-Requested-With", "XMLHttpRequest")
      .set("Authorization", "Bearer x")
      .send({
        platform: "web",
        token: "https://fcm.googleapis.com/wp/xxx",
        keys: { p256dh: "a".repeat(64), auth: "b".repeat(22) },
      });
    // 503 від vapid-guard-а, а не 400 від zod — payload валідний.
    expect(res.status).toBe(503);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("web без VAPID env → 503", async () => {
    getSessionUserMock.mockResolvedValue(user);
    const app = createApp();
    const res = await request(app)
      .post("/api/v1/push/register")
      .set("X-Requested-With", "XMLHttpRequest")
      .set("Authorization", "Bearer x")
      .send({
        platform: "web",
        token: "https://fcm.googleapis.com/wp/xxx",
        keys: { p256dh: "a".repeat(64), auth: "b".repeat(22) },
      });
    expect(res.status).toBe(503);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("невалідна platform → 400 (zod)", async () => {
    getSessionUserMock.mockResolvedValue(user);
    const app = createApp();
    const res = await request(app)
      .post("/api/v1/push/register")
      .set("X-Requested-With", "XMLHttpRequest")
      .set("Authorization", "Bearer x")
      .send({ platform: "windows-phone", token: "x" });
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/push/unregister", () => {
  const user = { id: "user_abc" };

  it("без сесії → 401", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/v1/push/unregister")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ platform: "ios", token: "t".repeat(64) });
    expect(res.status).toBe(401);
  });

  it("web-гілка soft-delete-ить у push_subscriptions за endpoint", async () => {
    getSessionUserMock.mockResolvedValue(user);
    queryMock.mockResolvedValue({ rowCount: 1, rows: [] });
    const app = createApp();
    const res = await request(app)
      .post("/api/v1/push/unregister")
      .set("X-Requested-With", "XMLHttpRequest")
      .set("Authorization", "Bearer x")
      .send({
        platform: "web",
        endpoint: "https://fcm.googleapis.com/wp/xxx",
      });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, platform: "web" });
    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0];
    expect(String(sql)).toMatch(/UPDATE push_subscriptions/);
    expect(String(sql)).toMatch(/deleted_at = NOW/);
    expect(String(sql)).toMatch(/deleted_at IS NULL/);
    expect(params).toEqual([user.id, "https://fcm.googleapis.com/wp/xxx"]);
  });

  it("native-гілка soft-delete-ить у push_devices за (platform, token)", async () => {
    getSessionUserMock.mockResolvedValue(user);
    queryMock.mockResolvedValue({ rowCount: 1, rows: [] });
    const app = createApp();
    const res = await request(app)
      .post("/api/v1/push/unregister")
      .set("X-Requested-With", "XMLHttpRequest")
      .set("Authorization", "Bearer x")
      .send({ platform: "android", token: "fcm-reg-tok" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, platform: "android" });
    const [sql, params] = queryMock.mock.calls[0];
    expect(String(sql)).toMatch(/UPDATE push_devices/);
    expect(params).toEqual([user.id, "android", "fcm-reg-tok"]);
  });

  it("доступний і на legacy-префіксі /api/push/unregister", async () => {
    getSessionUserMock.mockResolvedValue(user);
    queryMock.mockResolvedValue({ rowCount: 1, rows: [] });
    const app = createApp();
    const res = await request(app)
      .post("/api/push/unregister")
      .set("X-Requested-With", "XMLHttpRequest")
      .set("Authorization", "Bearer x")
      .send({
        platform: "web",
        endpoint: "https://fcm.googleapis.com/wp/xxx",
      });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, platform: "web" });
  });

  it("невалідний web-payload без endpoint → 400", async () => {
    getSessionUserMock.mockResolvedValue(user);
    const app = createApp();
    const res = await request(app)
      .post("/api/v1/push/unregister")
      .set("X-Requested-With", "XMLHttpRequest")
      .set("Authorization", "Bearer x")
      .send({ platform: "web", token: "not-a-url" });
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

/**
 * H8 — `Cross-Origin-Resource-Policy` per-route classification.
 *
 * Глобальний `apiHelmetMiddleware` сетить `CORP: cross-origin` на всі
 * відповіді, бо SPA на Vercel мусить fetch-ити Railway-API. Це створює
 * login-state oracle: зловмисний `<img src="…/api/me">` може за `onload`
 * визначити, чи залогінений користувач. Картка
 * `docs/security/hardening/H8-corp-per-route.md` вимагає override-а на
 * `same-origin` для session-protected роутів.
 *
 * Реалізація: `requireSession*` сетить хедер до резолву сесії, тож
 * автоматично покриває весь `/api/me`, `/api/mono/*`, `/api/sync/*`,
 * `/api/push/*`, `/api/coach/*`, `/api/nutrition/*`, `/api/transcribe`,
 * `/api/ai-memory/*` тощо. Публічні endpoint-и без `requireSession`
 * (`/healthz`, `/api/metrics/web-vitals`, `/api/csp-report`,
 * `/api/auth/*`) лишаються `cross-origin`.
 */
describe("H8: Cross-Origin-Resource-Policy per-route", () => {
  const user = {
    id: "user_h8",
    email: "h8@example.com",
    name: "H8",
    image: null,
    emailVerified: true,
  };

  it("session-protected /api/me з валідною сесією → CORP=same-origin", async () => {
    getSessionUserMock.mockResolvedValueOnce(user);
    const app = createApp();
    const res = await request(app)
      .get("/api/me")
      .set("Authorization", "Bearer x");
    expect(res.status).toBe(200);
    expect(res.headers["cross-origin-resource-policy"]).toBe("same-origin");
  });

  it("session-protected /api/me без сесії (401) → теж CORP=same-origin", async () => {
    // Найкритичніший кейс H8: 401 не може лишатися cross-origin, бо
    // тоді стейт-оракул через `<img onload>` все одно працює — браузер
    // дозволив би пікселю завантажитись (status code не приховується від
    // attacker-сторінки). Хедер мусить блокувати тіло до перевірки auth.
    const app = createApp();
    const res = await request(app).get("/api/me");
    expect(res.status).toBe(401);
    expect(res.headers["cross-origin-resource-policy"]).toBe("same-origin");
  });

  it("публічний /healthz → CORP=cross-origin (helmet default)", async () => {
    const app = createApp();
    const res = await request(app).get("/healthz");
    // Health-check мусить лишатись cross-origin — інакше зовнішні
    // моніторинг-чек-апи (UptimeRobot, Pingdom) ламаються.
    expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin");
  });

  it("публічний /api/csp-report → CORP=cross-origin (CSP-репорти прилітають з Vercel-домену)", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/csp-report")
      .set("X-Requested-With", "XMLHttpRequest")
      .set("Content-Type", "application/csp-report")
      .send(
        JSON.stringify({
          "csp-report": {
            "document-uri": "https://sergeant.vercel.app/",
            "violated-directive": "img-src",
            "blocked-uri": "https://attacker.example/x.png",
          },
        }),
      );
    // 204 (legacy) або 202 (Reporting-API) — обидва no-content; нам важливий
    // саме хедер. CSP-report ENDPOINT свідомо cross-origin: браузери шлють
    // звіти з фронта (Vercel) на API (Railway), тож same-origin зламає сам
    // канал збирання даних про CSP-порушення.
    expect([202, 204]).toContain(res.status);
    expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin");
  });

  it("публічний /api/metrics/web-vitals → CORP=cross-origin (анонімна метрика з фронта)", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/metrics/web-vitals")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({
        name: "LCP",
        id: "v1-1234",
        value: 1234,
        rating: "good",
        navigationType: "navigate",
      });
    // Web-vitals навмисно cross-origin (`apps/server/src/modules/observability/web-vitals.ts`):
    // вимірюємо realuser-метрики на anonymous-користувачах теж.
    expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin");
  });
});

/**
 * H6 — sensitive-action gate `/api/mono/connect` мусить вимагати
 * `email_verified=true`. Закриває squat-attack: атакувальник реєструє
 * акаунт на чужий email і одразу під'єднує свій Mono-token, отримуючи
 * картину "хтось бачить мої транзакції" та забруднюючи нашу БД
 * кросс-власницькими записами.
 */
describe("H6: /api/mono/connect gate on email verification", () => {
  // `MONO_WEBHOOK_ENABLED` за замовчуванням false у тест-env, тож для
  // реалістичного gate-кейсу його треба ввімкнути. Без цього handler
  // повертає 404 ще до перевірки email_verified.
  const savedMonoFlags: Record<string, string | undefined> = {};
  const MONO_KEYS = [
    "MONO_WEBHOOK_ENABLED",
    "MONO_TOKEN_ENC_KEY",
    "PUBLIC_API_BASE_URL",
  ];
  for (const k of MONO_KEYS) savedMonoFlags[k] = process.env[k];

  beforeEach(() => {
    process.env.MONO_WEBHOOK_ENABLED = "true";
    process.env.MONO_TOKEN_ENC_KEY = "0".repeat(64);
    process.env.PUBLIC_API_BASE_URL = "https://api.example.com";
  });

  afterAll(() => {
    for (const k of MONO_KEYS) {
      if (savedMonoFlags[k] === undefined) delete process.env[k];
      else process.env[k] = savedMonoFlags[k];
    }
  });

  it("unverified user → 403 EMAIL_VERIFICATION_REQUIRED, без виклику Mono-API", async () => {
    getSessionUserMock.mockResolvedValueOnce({
      id: "u-unverified",
      email: "squat@victim.com",
      name: "Squatter",
      image: null,
      emailVerified: false,
    });
    const app = createApp();
    const res = await request(app)
      .post("/api/mono/connect")
      .set("X-Requested-With", "XMLHttpRequest")
      .set("Authorization", "Bearer x")
      .set("Content-Type", "application/json")
      .send({ token: "would-be-victim-token-12345" });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      code: "EMAIL_VERIFICATION_REQUIRED",
    });
    // CORP-гарантія H8 продовжує діяти і на 403.
    expect(res.headers["cross-origin-resource-policy"]).toBe("same-origin");
    // Жоден запит до БД (encrypt-token, INSERT mono_connection) не мав
    // піти, бо middleware відсікає ДО handler-а.
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("unauthenticated → 401 (gate не downgrades 401 у 403)", async () => {
    // Сесії немає взагалі — `requireSession()` має спрацювати першим.
    const app = createApp();
    const res = await request(app)
      .post("/api/mono/connect")
      .set("X-Requested-With", "XMLHttpRequest")
      .set("Content-Type", "application/json")
      .send({ token: "x".repeat(20) });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "UNAUTHORIZED" });
  });
});
