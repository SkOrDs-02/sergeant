// Які бакети rate-limit проходить кожен `/api/coach/*` роут (С-3 (а),
// 2026-11-18). Читання памʼяті коуча — дешевий SELECT без моделі, і хаб
// робить його перед автогенерацією звіту тижня; під `api:coach` 20/год воно
// могло отримати 429 або зʼїсти квоту коуча. Тест збирає лише цей роутер:
// лімітер і сесія замінені записом ключів, тож перевіряється саме проводка.
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

type Hits = { hits: string[] };

vi.mock("../http/index.js", () => {
  const pass = () => (_req: Request, _res: Response, next: NextFunction) =>
    next();
  return {
    setModule: pass,
    requireLlmUpstream: pass,
    requireAiQuota: pass,
    requireSession:
      () => (_req: Request, res: Response, next: NextFunction) => {
        (res.locals as Hits).hits.push("session");
        next();
      },
    rateLimitExpress:
      (opts: { key: string; limit: number; windowMs: number }) =>
      (_req: Request, res: Response, next: NextFunction) => {
        (res.locals as Hits).hits.push(
          `${opts.key}:${opts.limit}/${opts.windowMs}`,
        );
        next();
      },
  };
});

vi.mock("../modules/chat/coach.js", () => {
  const echo = (_req: Request, res: Response) => {
    res.json({ hits: (res.locals as Hits).hits });
  };
  return { coachMemoryGet: echo, coachMemoryPost: echo, coachInsight: echo };
});

const { createCoachRouter } = await import("./coach.js");

function app() {
  const a = express();
  a.use((_req, res, next) => {
    (res.locals as Hits).hits = [];
    next();
  });
  a.use(createCoachRouter());
  return a;
}

const COACH = `api:coach:20/${60 * 60_000}`;
const BROWSE = `api:ai-memory:browse:200/${5 * 60_000}`;
const BROWSE_IP = `api:ai-memory:browse:ip:1000/${5 * 60_000}`;

describe("/api/coach/* · бакети rate-limit", () => {
  it("GET /memory: pre-auth IP-бакет, сесія, бакет дешевих читань; НЕ api:coach", async () => {
    const res = await request(app()).get("/api/coach/memory");
    expect(res.body.hits).toEqual([BROWSE_IP, "session", BROWSE]);
  });

  it("POST /memory: сесія, потім api:coach 20/год", async () => {
    const res = await request(app()).post("/api/coach/memory").send({});
    expect(res.body.hits).toEqual(["session", COACH]);
  });

  it("POST /insight: сесія, потім api:coach 20/год", async () => {
    const res = await request(app()).post("/api/coach/insight").send({});
    expect(res.body.hits).toEqual(["session", COACH]);
  });
});
