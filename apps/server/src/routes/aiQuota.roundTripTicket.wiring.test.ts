import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

/**
 * Wiring round-trip-квитка чату (sec-03 / logic-02, аудит 2026-10-01): квиток,
 * виданий `/api/chat`, погашається лише на `/api/chat`. `requireAiQuota` тут
 * підмінено заглушкою, яка перелічує опції в заголовки; саму арифметику
 * (форма запиту, одноразовість, прив'язка до userId) тримає
 * `modules/chat/aiQuota.test.ts`.
 */

const { handler } = vi.hoisted(() => ({
  handler: (_req: unknown, res: express.Response) => res.json({ ok: true }),
}));

vi.mock("../modules/chat/chat.js", () => ({ default: handler }));
vi.mock("../modules/chat/usage.js", () => ({ default: handler }));
vi.mock("../modules/chat/coach.js", () => ({
  coachInsight: handler,
  coachMemoryGet: handler,
  coachMemoryPost: handler,
}));

vi.mock("../http/index.js", () => {
  const pass = () => (_req: unknown, _res: unknown, next: () => void) => next();
  return {
    setModule: pass,
    rateLimitExpress: pass,
    requireSession: pass,
    requireLlmUpstream: pass,
    requireChatUpstreamKey: pass,
    requireAiQuota:
      (meter = "ai", options: { allowRoundTripTicket?: boolean } = {}) =>
      (_req: unknown, res: express.Response, next: () => void) => {
        res.append("x-quota-meter", meter);
        res.append(
          "x-quota-ticket",
          options.allowRoundTripTicket === true ? "allowed" : "ignored",
        );
        next();
      },
  };
});

import { createChatRouter } from "./chat.js";
import { createCoachRouter } from "./coach.js";

function app(): express.Express {
  const a = express();
  a.use(express.json());
  a.use(createChatRouter());
  a.use(createCoachRouter());
  return a;
}

describe("round-trip-квиток чату: де його приймає requireAiQuota", () => {
  it("POST /api/chat приймає квиток (єдиний роут, що його видає)", async () => {
    const res = await request(app()).post("/api/chat").send({});
    expect(res.status).toBe(200);
    expect(res.headers["x-quota-meter"]).toBe("ai");
    expect(res.headers["x-quota-ticket"]).toBe("allowed");
  });

  it("POST /api/coach/insight квиток ігнорує", async () => {
    const res = await request(app()).post("/api/coach/insight").send({});
    expect(res.status).toBe(200);
    expect(res.headers["x-quota-meter"]).toBe("ai");
    expect(res.headers["x-quota-ticket"]).toBe("ignored");
  });
});
