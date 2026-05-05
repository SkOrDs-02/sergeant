import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createEmailUnsubscribeRouter } from "./email-unsubscribe.js";
import { signUnsubscribeToken } from "../email/ftuxUnsubscribeToken.js";

function makePool() {
  return {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  };
}

function makeApp(pool: ReturnType<typeof makePool>) {
  const app = express();
  app.use(createEmailUnsubscribeRouter({ pool: pool as never }));
  return app;
}

describe("GET /api/email/unsubscribe", () => {
  const ORIGINAL_SECRET = process.env["BETTER_AUTH_SECRET"];

  beforeEach(() => {
    process.env["BETTER_AUTH_SECRET"] = "test-secret-for-unsubscribe-32bytes!";
  });

  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) {
      delete process.env["BETTER_AUTH_SECRET"];
    } else {
      process.env["BETTER_AUTH_SECRET"] = ORIGINAL_SECRET;
    }
  });

  it("happy-path: валідний токен → 200, INSERT з ON CONFLICT, success-сторінка", async () => {
    const pool = makePool();
    pool.query.mockResolvedValueOnce({ rows: [{ id: "1" }] });

    const token = signUnsubscribeToken({ userId: "u-happy" });
    expect(token).not.toBeNull();
    const res = await request(makeApp(pool)).get(
      `/api/email/unsubscribe?u=${encodeURIComponent(token!)}`,
    );

    expect(res.status).toBe(200);
    expect(res.text).toContain("Готово");
    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, values] = pool.query.mock.calls[0]!;
    expect(sql).toContain("INSERT INTO email_unsubscribes");
    expect(sql).toContain("ON CONFLICT");
    expect(values).toEqual(["u-happy", "ftux_drip"]);
  });

  it("repeat click (ON CONFLICT DO NOTHING → 0 rows): 200 + інша copy", async () => {
    const pool = makePool();
    pool.query.mockResolvedValueOnce({ rows: [] });
    const token = signUnsubscribeToken({ userId: "u-repeat" });
    const res = await request(makeApp(pool)).get(
      `/api/email/unsubscribe?u=${encodeURIComponent(token!)}`,
    );

    expect(res.status).toBe(200);
    // Сторінка все одно success-варіант ("Готово"), бо для юзера ефект той самий.
    expect(res.text).toContain("Готово");
  });

  it("bad token (tampered): 200 + invalid-сторінка, БЕЗ INSERT", async () => {
    const pool = makePool();
    const token = signUnsubscribeToken({ userId: "u-bad" });
    const tampered = token!.slice(0, -2) + "00";

    const res = await request(makeApp(pool)).get(
      `/api/email/unsubscribe?u=${encodeURIComponent(tampered)}`,
    );

    expect(res.status).toBe(200);
    expect(res.text.toLowerCase()).toContain("вже не діє");
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("missing token: 200 + invalid-сторінка", async () => {
    const pool = makePool();
    const res = await request(makeApp(pool)).get("/api/email/unsubscribe");
    expect(res.status).toBe(200);
    expect(res.text.toLowerCase()).toContain("вже не діє");
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("без BETTER_AUTH_SECRET: 503 plain text", async () => {
    delete process.env["BETTER_AUTH_SECRET"];
    const pool = makePool();
    const res = await request(makeApp(pool)).get(
      "/api/email/unsubscribe?u=anything",
    );
    expect(res.status).toBe(503);
    expect(res.text).toContain("not configured");
  });
});
