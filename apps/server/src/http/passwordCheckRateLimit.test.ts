import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

/**
 * sec-10, часть `POST /api/auth/change-password`: Better Auth звіряє поточний
 * пароль (scrypt) без app-ліміту. `authPasswordCheckRateLimit` стоїть перед
 * його handler-ом на `/api/auth`, лімітує ЛИШЕ `change-password` і ділить
 * бюджет (per-IP 5, per-user 20 за 15 хв) з `DELETE /api/me`.
 *
 * Бакети емулюються моком `pool.query` (як справжній лічильник по
 * `(rl_key, subject)`), решта — справжній `rateLimitExpress`.
 */

const { buckets, queryMock, getSessionMock, verifyMock } = vi.hoisted(() => ({
  buckets: new Map<string, number>(),
  queryMock: vi.fn(),
  getSessionMock: vi.fn(),
  verifyMock: vi.fn(),
}));

vi.mock("../db.js", () => ({
  default: { query: queryMock },
  pool: { query: queryMock },
}));
vi.mock("../lib/redis.js", () => ({ getRedis: () => null }));
vi.mock("../auth.js", () => ({
  auth: {
    api: { getSession: getSessionMock },
    handler: async () => new Response("{}", { status: 200 }),
  },
}));

// sec-06: change-email у справжньому роутері звіряє пароль через цей модуль.
vi.mock("../modules/me/verifyAccountPassword.js", () => ({
  verifyAccountPassword: verifyMock,
}));

import { authPasswordCheckRateLimit } from "./passwordCheckRateLimit.js";
import { createAuthRouter } from "../routes/auth.js";
import { errorHandler } from "./errorHandler.js";

function makeApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use("/api/auth", authPasswordCheckRateLimit);
  const reached = vi.fn();
  app.all("/api/auth/{*splat}", (_req, res) => {
    reached();
    res.status(200).json({ ok: true });
  });
  return { app, reached };
}

const change = (app: express.Express, ip: string, auth = "Bearer t1") =>
  request(app)
    .post("/api/auth/change-password")
    .set("X-Forwarded-For", ip)
    .set("Authorization", auth)
    .send({ currentPassword: "x", newPassword: "y" });

beforeEach(() => {
  buckets.clear();
  queryMock.mockReset();
  queryMock.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes("INSERT INTO rate_limit_buckets")) {
      const [key, subject] = params as [string, string];
      const k = `${key}|${subject}`;
      const count = (buckets.get(k) ?? 0) + 1;
      buckets.set(k, count);
      return { rows: [{ count, elapsed_ms: "0" }] };
    }
    return { rows: [] };
  });
  getSessionMock.mockReset();
  getSessionMock.mockResolvedValue({ user: { id: "u1" } });
  verifyMock.mockReset();
  verifyMock.mockResolvedValue({ ok: true, method: "password" });
});

describe("authPasswordCheckRateLimit", () => {
  it("6-й change-password з однієї адреси → 429 RATE_LIMIT_IP, handler не викликано", async () => {
    const { app, reached } = makeApp();
    for (let i = 0; i < 5; i += 1) {
      expect((await change(app, "203.0.113.1")).status).toBe(200);
    }
    const res = await change(app, "203.0.113.1");
    expect(res.status).toBe(429);
    expect(res.body.code).toBe("RATE_LIMIT_IP");
    expect(reached).toHaveBeenCalledTimes(5);
  });

  it("власник з іншої адреси не блокується підбором з чужої", async () => {
    const { app } = makeApp();
    for (let i = 0; i < 7; i += 1) await change(app, "198.51.100.7");
    expect((await change(app, "203.0.113.50")).status).toBe(200);
  });

  it("per-user стеля 20 діє на розподілений підбір (Bearer-сесія)", async () => {
    const { app, reached } = makeApp();
    for (let ip = 1; ip <= 8; ip += 1) {
      for (let i = 0; i < 5; i += 1) await change(app, `192.0.2.${ip}`);
    }
    expect(reached).toHaveBeenCalledTimes(20);
    const res = await change(app, "192.0.2.99");
    expect(res.status).toBe(429);
    expect(res.body.code).toBe("RATE_LIMIT_USER");
  });

  it("різні користувачі не ділять per-user бакет", async () => {
    const { app } = makeApp();
    for (let i = 0; i < 4; i += 1) await change(app, "192.0.2.1");
    getSessionMock.mockResolvedValue({ user: { id: "u2" } });
    await change(app, "192.0.2.2");
    expect(buckets.get("api:password-check:user|u:u1")).toBe(4);
    expect(buckets.get("api:password-check:user|u:u2")).toBe(1);
  });

  it("без сесії лімітується лише IP; збій lookup-а запит не ламає", async () => {
    const { app, reached } = makeApp();
    getSessionMock.mockRejectedValue(new Error("db down"));
    expect((await change(app, "203.0.113.1")).status).toBe(200);
    expect(reached).toHaveBeenCalledTimes(1);
    expect([...buckets.keys()].some((k) => k.includes(":user|"))).toBe(false);
  });

  it("sign-in, get-session і GET change-password не лімітуються", async () => {
    const { app, reached } = makeApp();
    for (let i = 0; i < 10; i += 1) {
      await request(app)
        .post("/api/auth/sign-in/email")
        .set("X-Forwarded-For", "203.0.113.1")
        .send({ email: "a@b.com", password: "p" });
      await request(app)
        .get("/api/auth/get-session")
        .set("X-Forwarded-For", "203.0.113.1");
      await request(app)
        .get("/api/auth/change-password")
        .set("X-Forwarded-For", "203.0.113.1");
    }
    expect(reached).toHaveBeenCalledTimes(30);
    expect(buckets.size).toBe(0);
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it("бюджет спільний з DELETE /api/me: ті самі ключі й субʼєкти", async () => {
    const { app } = makeApp();
    await change(app, "203.0.113.1");
    expect([...buckets.keys()].sort()).toEqual([
      "api:password-check:ip|ip:203.0.113.1",
      "api:password-check:user|u:u1",
    ]);
  });
});

describe("проводка в createAuthRouter", () => {
  it("справжній роутер /api/auth: 6-й change-password → 429, sign-in не зачеплено", async () => {
    const app = express();
    app.set("trust proxy", 1);
    app.use(createAuthRouter());

    for (let i = 0; i < 5; i += 1) {
      expect((await change(app, "203.0.113.1")).status).toBe(200);
    }
    expect((await change(app, "203.0.113.1")).status).toBe(429);

    // Інші Better Auth-шляхи за тією ж адресою це не блокує: sign-in
    // має власний бакет, а password-check ключі їх не бачать.
    const signIn = await request(app)
      .post("/api/auth/sign-in/email")
      .set("X-Forwarded-For", "203.0.113.1")
      .send({ email: "a@b.com", password: "p" });
    expect(signIn.status).toBe(200);
    const gs = await request(app)
      .get("/api/auth/get-session")
      .set("X-Forwarded-For", "203.0.113.1");
    expect(gs.status).toBe(200);
  });
});

describe("проводка change-email в createAuthRouter (sec-06)", () => {
  const changeEmail = (app: express.Express) =>
    request(app)
      .post("/api/auth/change-email")
      .set("X-Forwarded-For", "203.0.113.9")
      .set("Authorization", "Bearer t1")
      .send({ newEmail: "new@example.com" });

  it("невірний пароль → 400 INVALID_PASSWORD до Better Auth, у бюджеті спроб", async () => {
    const app = express();
    app.set("trust proxy", 1);
    app.use(createAuthRouter());
    app.use(errorHandler);
    verifyMock.mockResolvedValue({ ok: false, reason: "invalid_password" });

    const res = await changeEmail(app);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_PASSWORD");
    expect(buckets.get("api:password-check:ip|ip:203.0.113.9")).toBe(1);
    expect(buckets.has("api:change-email:user|u:u1")).toBe(false);
  });

  it("4-та зміна email за добу → 429, перші три доходять до Better Auth", async () => {
    const app = express();
    app.set("trust proxy", 1);
    app.use(createAuthRouter());

    for (let i = 0; i < 3; i += 1) {
      expect((await changeEmail(app)).status).toBe(200);
    }
    expect((await changeEmail(app)).status).toBe(429);
    expect(buckets.get("api:change-email:user|u:u1")).toBe(4);
  });
});
