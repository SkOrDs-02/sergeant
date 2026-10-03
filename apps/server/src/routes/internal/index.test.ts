import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Rate-limit падає в in-memory бакет: Redis немає, Postgres «без міграції».
vi.mock("../../lib/redis.js", () => ({ getRedis: vi.fn(() => null) }));
vi.mock("../../db.js", () => ({
  pool: {
    query: vi.fn(() => {
      const err = new Error("no table") as Error & { code: string };
      err.code = "42P01";
      return Promise.reject(err);
    }),
  },
}));

const KEY = "test-internal-key";

async function makeApp(allowedIps: string): Promise<express.Express> {
  const { env } = await import("../../env.js");
  (env as { INTERNAL_API_KEY?: string }).INTERNAL_API_KEY = KEY;
  (env as { WEBHOOK_HMAC_SECRET?: string }).WEBHOOK_HMAC_SECRET = "";
  (env as { INTERNAL_ALLOWED_IPS: string }).INTERNAL_ALLOWED_IPS = allowedIps;
  const { createInternalRouter } = await import("./index.js");
  const app = express();
  app.set("trust proxy", true);
  app.use(express.json());
  app.use(createInternalRouter({ pool: { query: vi.fn() } as never }));
  return app;
}

let ipCounter = 0;
function freshIp(): string {
  ipCounter += 1;
  return `203.0.113.${ipCounter}`;
}

describe("createInternalRouter — B27 hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("401 без bearer-токена", async () => {
    const app = await makeApp("");
    const res = await request(app)
      .post("/api/internal/categorize")
      .set("X-Forwarded-For", freshIp())
      .send({ description: "x" });
    expect(res.status).toBe(401);
  });

  it("порожній INTERNAL_ALLOWED_IPS не вмикає IP-перевірку (не ламає викликачів)", async () => {
    const app = await makeApp("");
    const res = await request(app)
      .get("/api/internal/__nope__")
      .set("Authorization", `Bearer ${KEY}`)
      .set("X-Forwarded-For", freshIp());
    expect(res.status).toBe(404); // guard-и пройдені
  });

  it("403 IP_NOT_ALLOWED для адреси поза allowlist, навіть із валідним ключем", async () => {
    const app = await makeApp("10.20.0.0/16");
    const res = await request(app)
      .get("/api/internal/__nope__")
      .set("Authorization", `Bearer ${KEY}`)
      .set("X-Forwarded-For", "198.51.100.7");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("IP_NOT_ALLOWED");
  });

  it("пропускає адресу з allowlist", async () => {
    const app = await makeApp("10.20.0.0/16");
    const res = await request(app)
      .get("/api/internal/__nope__")
      .set("Authorization", `Bearer ${KEY}`)
      .set("X-Forwarded-For", "10.20.3.4");
    expect(res.status).toBe(404);
  });

  it("429 після вичерпання per-IP ліміту (враховує й неавторизовані спроби)", async () => {
    const app = await makeApp("");
    const ip = freshIp();
    let last = 0;
    for (let i = 0; i < 121; i += 1) {
      const res = await request(app)
        .get("/api/internal/__nope__")
        .set("X-Forwarded-For", ip);
      last = res.status;
      if (i < 120) expect(res.status).toBe(401);
    }
    expect(last).toBe(429);
  });
});
