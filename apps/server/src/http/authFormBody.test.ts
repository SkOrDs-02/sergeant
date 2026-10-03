import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { toNodeHandler } from "better-auth/node";

/**
 * sec-11 — per-account ліміт входу не має залежати від `Content-Type`.
 *
 * Better Auth `/sign-in/email` приймає і JSON, і `application/x-www-form-urlencoded`.
 * Колись для `/api/auth` був змонтований лише `express.json`, тож для form-тіла
 * `req.body` лишався порожнім, `authAccountRateLimit` не бачив email і
 * пропускав запит повз бакет (а Better Auth усе одно перевіряв пароль).
 *
 * Тест збирає справжній ланцюжок: `applyBodySizePolicy` → `authAccountRateLimit`
 * → `toNodeHandler` (справжній адаптер better-call), а справжню механіку
 * бакетів (Redis/PG) підміняє лічильником у памʼяті: нас цікавить саме те,
 * чи запит потрапляє в бакет і чи handler Better Auth після парсингу
 * усе ще бачить тіло (OAuth `form_post` callback — Apple).
 */
const counts = new Map<string, number>();
const LIMIT = 2;

vi.mock("./rateLimit.js", () => ({
  rateLimitExpress:
    (opts: { subject?: () => string }) =>
    (
      _req: unknown,
      res: {
        status: (c: number) => { json: (b: unknown) => void };
      },
      next: () => void,
    ) => {
      const subject = opts.subject ? opts.subject() : "ip";
      const n = (counts.get(subject) ?? 0) + 1;
      counts.set(subject, n);
      if (n > LIMIT) {
        res.status(429).json({ error: "rate_limited" });
        return;
      }
      next();
    },
}));

import { applyBodySizePolicy } from "./bodySizePolicy.js";
import { authAccountRateLimit } from "./authMiddleware.js";
import { errorHandler } from "./errorHandler.js";

interface SeenRequest {
  url: string;
  contentType: string | null;
  text: string;
}

function makeApp(seen: SeenRequest[]) {
  const app = express();
  applyBodySizePolicy(app);
  app.use("/api/auth", authAccountRateLimit);
  // Мінімальний «Better Auth»: справжній node-адаптер, фейковий handler.
  const fakeAuth = {
    handler: async (req: Request): Promise<Response> => {
      seen.push({
        url: new URL(req.url).pathname,
        contentType: req.headers.get("content-type"),
        text: await req.text(),
      });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  };
  app.all("/api/auth/{*splat}", toNodeHandler(fakeAuth));
  app.use(errorHandler);
  return app;
}

describe("sec-11 — /api/auth form-urlencoded і per-account ліміт", () => {
  beforeEach(() => counts.clear());

  it("urlencoded sign-in рахується в per-account бакет і отримує 429 після ліміту", async () => {
    const app = makeApp([]);
    const send = () =>
      request(app)
        .post("/api/auth/sign-in/email")
        .type("form")
        .send({ email: "Victim@Example.com", password: "wrong" });

    for (let i = 0; i < LIMIT; i++) {
      expect((await send()).status).toBe(200);
    }
    expect((await send()).status).toBe(429);
    expect(counts.size).toBe(1);
  });

  it("JSON і form з тим самим email діляться ОДНИМ бакетом", async () => {
    const app = makeApp([]);
    await request(app)
      .post("/api/auth/sign-in/email")
      .send({ email: "a@b.com", password: "x" });
    await request(app)
      .post("/api/auth/sign-in/email")
      .type("form")
      .send({ email: "A@B.com", password: "x" });
    expect([...counts.values()]).toEqual([2]);
  });

  it("form-тіло доходить до handler-а Better Auth цілим (OAuth form_post, Apple)", async () => {
    const seen: SeenRequest[] = [];
    const app = makeApp(seen);
    const res = await request(app)
      .post("/api/auth/callback/apple")
      .type("form")
      .send({
        code: "c0de",
        state: "st4te",
        user: JSON.stringify({ name: { firstName: "A" }, email: "a@b.com" }),
      });
    expect(res.status).toBe(200);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.contentType).toContain("application/x-www-form-urlencoded");
    const form = new URLSearchParams(seen[0]?.text);
    expect(form.get("code")).toBe("c0de");
    expect(form.get("state")).toBe("st4te");
    expect(JSON.parse(form.get("user") ?? "{}")).toEqual({
      name: { firstName: "A" },
      email: "a@b.com",
    });
    // Колбек не credential-флоу: у бакет не потрапляє.
    expect(counts.size).toBe(0);
  });

  it("JSON-тіло Better Auth лишається робочим", async () => {
    const seen: SeenRequest[] = [];
    const app = makeApp(seen);
    const res = await request(app)
      .post("/api/auth/sign-in/email")
      .send({ email: "a@b.com", password: "pw" });
    expect(res.status).toBe(200);
    expect(JSON.parse(seen[0]?.text ?? "{}")).toEqual({
      email: "a@b.com",
      password: "pw",
    });
  });

  it("form-тіло понад 16kb відхиляється (413), а не буферизується", async () => {
    const app = makeApp([]);
    const res = await request(app)
      .post("/api/auth/sign-in/email")
      .type("form")
      .send({ email: "a@b.com", password: "x".repeat(20 * 1024) });
    expect(res.status).toBe(413);
  });

  it("повторений ключ email у form-тілі відхиляється 400, а не обходить бакет", async () => {
    const seen: SeenRequest[] = [];
    const app = makeApp(seen);
    const res = await request(app)
      .post("/api/auth/sign-in/email")
      .type("form")
      .send("email=junk&email=victim%40x.com&password=p");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION");
    expect(seen).toHaveLength(0);
  });

  it.each([
    "application/jsonx",
    "application/json-patch+json",
    "application/json-foo",
    "text/plain",
    "multipart/form-data; boundary=x",
  ])("Content-Type %s на credential-роуті відхиляється 415", async (ct) => {
    const seen: SeenRequest[] = [];
    const app = makeApp(seen);
    const res = await request(app)
      .post("/api/auth/sign-in/email")
      .set("Content-Type", ct)
      .send('{"email":"victim@x.com","password":"p"}');
    expect(res.status).toBe(415);
    expect(res.body.code).toBe("UNSUPPORTED_MEDIA_TYPE");
    expect(seen).toHaveLength(0);
    expect(counts.size).toBe(0);
  });

  it("415 і для reset/forget-роутів, але не для OAuth-колбеків", async () => {
    const app = makeApp([]);
    for (const path of [
      "/api/auth/request-password-reset",
      "/api/auth/forget-password",
      "/api/auth/reset-password",
    ]) {
      const res = await request(app)
        .post(path)
        .set("Content-Type", "application/jsonx")
        .send('{"email":"victim@x.com"}');
      expect(res.status).toBe(415);
    }
    const cb = await request(app)
      .post("/api/auth/callback/apple")
      .set("Content-Type", "application/jsonx")
      .send("x");
    expect(cb.status).toBe(200);
  });

  it("Content-Type з charset і в іншому регістрі приймається і рахується", async () => {
    const app = makeApp([]);
    const res = await request(app)
      .post("/api/auth/sign-in/email")
      .set("Content-Type", "Application/JSON; charset=UTF-8")
      .send('{"email":"victim@x.com","password":"p"}');
    expect(res.status).toBe(200);
    expect(counts.size).toBe(1);
  });
});
