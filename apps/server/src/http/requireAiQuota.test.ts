import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertAiQuota: vi.fn(),
}));

vi.mock("../modules/chat/aiQuota.js", () => ({
  assertAiQuota: mocks.assertAiQuota,
}));

import { requireAiQuota } from "./requireAiQuota.js";

function makeApp() {
  const app = express();
  const nextHandler = vi.fn((_req: express.Request, res: express.Response) => {
    res.status(200).json({ ok: true });
  });
  app.use(requireAiQuota());
  app.get("/ai", nextHandler);
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res.status(500).json({ error: err.message });
    },
  );
  return { app, nextHandler };
}

describe("requireAiQuota", () => {
  beforeEach(() => {
    mocks.assertAiQuota.mockReset();
  });

  it("continues the middleware chain when quota is available", async () => {
    mocks.assertAiQuota.mockResolvedValue(true);
    const { app, nextHandler } = makeApp();

    const res = await request(app).get("/ai");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mocks.assertAiQuota).toHaveBeenCalledTimes(1);
    expect(nextHandler).toHaveBeenCalledTimes(1);
  });

  it("stops the chain when assertAiQuota already sent the quota response", async () => {
    mocks.assertAiQuota.mockImplementation(
      async (_req, res: express.Response) => {
        res.status(429).json({ code: "AI_QUOTA_EXCEEDED" });
        return false;
      },
    );
    const { app, nextHandler } = makeApp();

    const res = await request(app).get("/ai");

    expect(res.status).toBe(429);
    expect(res.body).toEqual({ code: "AI_QUOTA_EXCEEDED" });
    expect(nextHandler).not.toHaveBeenCalled();
  });

  it("passes unexpected quota errors to Express error handling", async () => {
    mocks.assertAiQuota.mockRejectedValue(new Error("quota store unavailable"));
    const { app, nextHandler } = makeApp();

    const res = await request(app).get("/ai");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "quota store unavailable" });
    expect(nextHandler).not.toHaveBeenCalled();
  });

  it("refunds the charged quota when the handler ends with 5xx or a pre-upstream 413", async () => {
    const refund = vi.fn(async () => {});
    mocks.assertAiQuota.mockImplementation(async (req) => {
      (req as { aiQuotaRefund?: () => Promise<void> }).aiQuotaRefund = refund;
      return true;
    });
    const app = express();
    app.use(requireAiQuota());
    app.get("/ok", (_req, res) => {
      res.status(200).json({ ok: true });
    });
    app.get("/upstream", (_req, res) => {
      res.status(502).json({ code: "AI_PROVIDER" });
    });
    app.get("/too-large", (_req, res) => {
      res.status(413).json({ code: "TOO_LARGE" });
    });

    await request(app).get("/ok");
    expect(refund).not.toHaveBeenCalled();

    await request(app).get("/upstream");
    await request(app).get("/too-large");
    await vi.waitFor(() => expect(refund).toHaveBeenCalledTimes(2));
  });
});
