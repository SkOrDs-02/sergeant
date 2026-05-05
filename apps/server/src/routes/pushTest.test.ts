import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import request from "supertest";

/**
 * Покриття `POST /api/v1/push/test` (session 5B).
 *
 * Сфокусовані гарантії:
 *   1. без auth → 401;
 *   2. з валідним body + сесією → 200, тіло = `{delivered,cleaned,errors}`
 *      зі stub-а `sendToUser`;
 *   3. rate-limit per-user 1/5с: 2-й виклик у те саме вікно → 429;
 *   4. невалідне body (відсутнє `title`) → 400 (zod);
 *   5. failure path — якщо `sendToUser` кидає, handler повертає 500
 *      (через `asyncHandler` → `errorHandler`), а не 200.
 *
 * Ми мокаємо `push/send.js` точково, щоб не конфліктувати з паралельними
 * тестами, які імпортують цей же модуль, і reset-имо стан `beforeEach`.
 */

const { mockPool, queryMock, getSessionUserMock, sendToUserMock } = vi.hoisted(
  () => {
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
    const sendToUserMock = vi.fn();
    return { mockPool, queryMock, getSessionUserMock, sendToUserMock };
  },
);

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

vi.mock("./../push/send.js", () => ({
  sendToUser: sendToUserMock,
  // Фіктивна `sendToUserQuietly` для coach-ланцюга; сюди вона не тягнеться
  // через цей route, але якщо колись підтягнеться (імпорт) — хай не ламає.
  sendToUserQuietly: vi.fn().mockResolvedValue(undefined),
}));

import { createApp } from "./../app.js";

// Різні userId на кожен тест: rate-limit використовує in-memory Map,
// ключ `api:push:test:u:<userId>` перекривається між тестами у одному
// процесі. Інкрементимо лічильник, щоб тест з валідним сценарієм не
// забруднював бакет для наступних.
let userSeq = 0;
const nextUser = () => ({ id: `user_push_test_${++userSeq}` });

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [] });
  getSessionUserMock.mockReset();
  sendToUserMock.mockReset();
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("POST /api/v1/push/test", () => {
  it("без сесії → 401 і sendToUser не викликався", async () => {
    getSessionUserMock.mockResolvedValue(null);
    const app = createApp();
    const res = await request(app)
      .post("/api/v1/push/test")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ title: "Sergeant", body: "It works" });
    expect(res.status).toBe(401);
    expect(sendToUserMock).not.toHaveBeenCalled();
  });

  it("валідний body + сесія → 200 з {delivered,cleaned,errors} і викликом sendToUser(userId, payload)", async () => {
    const user = nextUser();
    getSessionUserMock.mockResolvedValue(user);
    sendToUserMock.mockResolvedValue({
      delivered: { ios: 1, android: 0, web: 2 },
      cleaned: 0,
      errors: [],
    });

    const app = createApp();
    const res = await request(app)
      .post("/api/v1/push/test")
      .set("Authorization", "Bearer x")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({
        title: "Sergeant",
        body: "It works",
        data: { deeplink: "/routine" },
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      delivered: { ios: 1, android: 0, web: 2 },
      cleaned: 0,
      errors: [],
    });
    expect(sendToUserMock).toHaveBeenCalledTimes(1);
    const [calledUserId, calledPayload] = sendToUserMock.mock.calls[0]!;
    expect(calledUserId).toBe(user.id);
    expect(calledPayload).toEqual({
      title: "Sergeant",
      body: "It works",
      data: { deeplink: "/routine" },
    });
  });

  it("rate-limit per-user: другий виклик за 5 с → 429, а sendToUser — лише раз", async () => {
    const user = nextUser();
    getSessionUserMock.mockResolvedValue(user);
    sendToUserMock.mockResolvedValue({
      delivered: { ios: 0, android: 0, web: 0 },
      cleaned: 0,
      errors: [],
    });

    const app = createApp();
    const first = await request(app)
      .post("/api/v1/push/test")
      .set("Authorization", "Bearer x")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ title: "t", body: "b" });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post("/api/v1/push/test")
      .set("Authorization", "Bearer x")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ title: "t", body: "b" });
    expect(second.status).toBe(429);
    expect(second.body).toMatchObject({ code: "RATE_LIMIT" });
    expect(second.headers["retry-after"]).toBeDefined();
    // sendToUser викликаний рівно один раз — другий запит ріжеться middleware-ом
    expect(sendToUserMock).toHaveBeenCalledTimes(1);
  });

  it("невалідний body (відсутнє title) → 400 від zod, sendToUser не викликається", async () => {
    getSessionUserMock.mockResolvedValue({ id: "user_validation" });

    const app = createApp();
    const res = await request(app)
      .post("/api/v1/push/test")
      .set("Authorization", "Bearer x")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ body: "only body, no title" });

    expect(res.status).toBe(400);
    expect(sendToUserMock).not.toHaveBeenCalled();
  });

  it("failure path: sendToUser кидає → 500 із summary у форматі errorHandler", async () => {
    getSessionUserMock.mockResolvedValue({ id: "user_failure" });
    sendToUserMock.mockRejectedValue(new Error("apns down"));

    const app = createApp();
    const res = await request(app)
      .post("/api/v1/push/test")
      .set("Authorization", "Bearer x")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ title: "t", body: "b" });

    expect(res.status).toBe(500);
    // errorHandler віддає { error, requestId } — точну форму перевіряємо
    // мінімально, щоб не фікситись до internal-log-полів.
    expect(typeof res.body.error).toBe("string");
    expect(sendToUserMock).toHaveBeenCalledTimes(1);
  });
});
