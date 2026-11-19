import { describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

import { BODY_SIZE_POLICY, applyBodySizePolicy } from "./bodySizePolicy.js";
import {
  applyPreParseAuthGuard,
  createPreParseAuthGuard,
  hasSessionCredentials,
} from "./preParseAuthGuard.js";

const passLimiter = (
  _req: express.Request,
  _res: express.Response,
  next: express.NextFunction,
) => next();

function makeApp(limiter = vi.fn(passLimiter)) {
  const app = express();
  const guard = createPreParseAuthGuard(limiter);
  applyPreParseAuthGuard(app, guard);
  // Спостерігач «тіло прочитано»: якщо парсер відпрацював, req.body заповнений.
  app.use((req, _res, next) => {
    (req as { sawStreamBeforeParser?: boolean }).sawStreamBeforeParser =
      !req.readableEnded && !req.complete;
    next();
  });
  applyBodySizePolicy(app);
  app.all(/.*/, (req, res) => {
    res.status(200).json({
      parsed: req.body !== undefined && Object.keys(req.body ?? {}).length > 0,
    });
  });
  return { app, limiter };
}

const fiveMb = JSON.stringify({ data: "x".repeat(5 * 1024 * 1024) });

describe("preParseAuthGuard (B28)", () => {
  it("політика: lише session-роути з лімітом >128kb мають requireCredentials", () => {
    const flagged = BODY_SIZE_POLICY.filter(
      (r) => r.kind !== "urlencoded" && r.requireCredentials,
    ).map((r) => r.pathPrefix);
    expect(flagged).toContain("/api/nutrition/analyze-photo");
    expect(flagged).toContain("/api/transcribe");
    expect(flagged).toContain("/api/v2/sync");
    // HMAC/webhook/публічні роути НЕ під guard-ом.
    for (const p of [
      "/api/mono/webhook",
      "/api/internal",
      "/api/billing/stripe-webhook",
      "/api/billing/liqpay-callback",
      "/api/billing/plata-charge",
      "/api/billing/plata-status",
      "/api/csp-report",
      "/api/metrics/web-vitals",
      "/api/auth",
      "/",
    ]) {
      expect(flagged).not.toContain(p);
    }
  });

  it("5MB POST без облікових даних -> 401 до читання тіла", async () => {
    const { app, limiter } = makeApp();
    const res = await request(app)
      .post("/api/nutrition/analyze-photo")
      .set("Content-Type", "application/json")
      .send(fiveMb);
    // supertest може отримати EPIPE/reset, якщо сервер відповів до кінця
    // аплоаду; 401 з ранньою відповіддю — це і є очікувана поведінка.
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: "Потрібна автентифікація",
      message: "Потрібна автентифікація",
      code: "UNAUTHORIZED",
    });
    expect(limiter).not.toHaveBeenCalled();
  });

  it("парсер не викликається для анонімного запиту", async () => {
    const { app } = makeApp();
    let parserReached = false;
    app.use((_req, _res, next) => {
      parserReached = true;
      next();
    });
    await request(app)
      .post("/api/transcribe")
      .set("Content-Type", "audio/webm")
      .send(Buffer.alloc(5 * 1024 * 1024));
    expect(parserReached).toBe(false);
  });

  it("з cookie сесії -> проходить, ліміт викликано, тіло розпарсено", async () => {
    const { app, limiter } = makeApp();
    const res = await request(app)
      .post("/api/nutrition/analyze-photo")
      .set("Cookie", "__Secure-better-auth.session_token=abc.def")
      .set("Content-Type", "application/json")
      .send(fiveMb);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ parsed: true });
    expect(limiter).toHaveBeenCalledTimes(1);
  });

  it("з Bearer -> проходить", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post("/api/chat")
      .set("Authorization", "Bearer tok")
      .send({ a: 1 });
    expect(res.status).toBe(200);
  });

  it("ліміт відмовляє (429) до парсера", async () => {
    const limiter = vi.fn(
      (_req: express.Request, res: express.Response): void => {
        res.status(429).json({ code: "RATE_LIMITED" });
      },
    );
    const { app } = makeApp(limiter as never);
    const res = await request(app)
      .post("/api/sync/push")
      .set("Authorization", "Bearer tok")
      .send({ a: 1 });
    expect(res.status).toBe(429);
  });

  it("webhook/HMAC-роути без cookie не зачеплені", async () => {
    const { app } = makeApp();
    for (const path of [
      "/api/mono/webhook",
      "/api/internal/x",
      "/api/billing/plata-charge",
    ]) {
      const res = await request(app).post(path).send({ a: 1 });
      expect(res.status).toBe(200);
    }
  });

  it("GET без cookie не відсікається guard-ом", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/api/chat");
    expect(res.status).toBe(200);
  });

  it("hasSessionCredentials: порожні/чужі заголовки -> false", () => {
    const mk = (headers: Record<string, string>) =>
      ({ headers }) as unknown as express.Request;
    expect(hasSessionCredentials(mk({}))).toBe(false);
    expect(hasSessionCredentials(mk({ cookie: "foo=bar" }))).toBe(false);
    expect(hasSessionCredentials(mk({ authorization: "Bearer " }))).toBe(false);
    expect(
      hasSessionCredentials(mk({ cookie: "a=1; better-auth.session_token=x" })),
    ).toBe(true);
  });
});
