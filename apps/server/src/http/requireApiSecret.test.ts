import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { requireApiSecret } from "./requireApiSecret.js";

function makeApp(envVarName = "SERGEANT_TEST_API_SECRET") {
  const app = express();
  const nextHandler = vi.fn((_req: express.Request, res: express.Response) => {
    res.status(200).json({ ok: true });
  });
  app.use(requireApiSecret(envVarName));
  app.get("/internal/job", nextHandler);
  app.post("/internal/job", nextHandler);
  return { app, nextHandler };
}

describe("requireApiSecret", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fails closed with 503 when the expected env secret is missing", async () => {
    const { app, nextHandler } = makeApp();

    const res = await request(app)
      .get("/internal/job")
      .set("X-Api-Secret", "client-secret");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      error: "Ендпоінт не сконфігурований",
      code: "NOT_CONFIGURED",
    });
    expect(nextHandler).not.toHaveBeenCalled();
  });

  it("rejects absent or wrong client secrets", async () => {
    vi.stubEnv("SERGEANT_TEST_API_SECRET", "expected-secret");
    const { app, nextHandler } = makeApp();

    const missing = await request(app).get("/internal/job");
    const wrong = await request(app)
      .get("/internal/job")
      .set("X-Api-Secret", "wrong-secret");

    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(wrong.body).toEqual({
      error: "Невірний секрет",
      code: "UNAUTHORIZED",
    });
    expect(nextHandler).not.toHaveBeenCalled();
  });

  it("accepts a matching secret and supports array-valued headers", async () => {
    vi.stubEnv("SERGEANT_TEST_API_SECRET", "expected-secret");
    const { app, nextHandler } = makeApp();

    const res = await request(app)
      .post("/internal/job")
      .set("X-Api-Secret", "expected-secret");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(nextHandler).toHaveBeenCalledTimes(1);
  });

  it("uses the first value when Express exposes an array-valued secret header", () => {
    vi.stubEnv("SERGEANT_TEST_API_SECRET", "expected-secret");
    const next = vi.fn();
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    requireApiSecret("SERGEANT_TEST_API_SECRET")(
      {
        headers: {
          "x-api-secret": ["expected-secret", "ignored-fallback"],
        },
      } as unknown as express.Request,
      res as unknown as express.Response,
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
