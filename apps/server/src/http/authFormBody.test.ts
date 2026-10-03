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
});
