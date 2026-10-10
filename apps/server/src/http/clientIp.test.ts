import { createHmac } from "node:crypto";
import express from "express";
import request from "supertest";
import { getIp as betterAuthGetIp } from "better-auth/api";
import { fromNodeHeaders } from "better-auth/node";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Мутабельний env: секрет перемикається між кейсами.
const envMock = vi.hoisted(() => ({
  SERGEANT_CLIENT_IP_SECRET: undefined as string | undefined,
}));
vi.mock("../env.js", () => ({ env: envMock }));

vi.mock("../db.js", () => ({ pool: { query: vi.fn() } }));
vi.mock("../lib/redis.js", () => ({ getRedis: vi.fn(() => null) }));
vi.mock("../obs/logger.js", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import {
  AUTH_IP_ADDRESS_HEADERS,
  CLIENT_IP_HEADER,
  CLIENT_IP_SIG_HEADER,
  RESOLVED_CLIENT_IP_HEADER,
  clientIpMiddleware,
  getClientIp,
  verifySignedClientIp,
} from "./clientIp.js";
import { getIp } from "./rateLimit.js";

const SECRET = "s".repeat(40);
const EGRESS = "76.76.21.1";
const sign = (ip: string, secret = SECRET) =>
  createHmac("sha256", secret).update(ip).digest("base64url");
const signed = (ip: string) => ({
  [CLIENT_IP_HEADER]: ip,
  [CLIENT_IP_SIG_HEADER]: sign(ip),
});

/**
 * Express-апка з `trust proxy=1`, як у проді: `req.ip` — це «egress Vercel»
 * (loopback у supertest), а IP клієнта живе лише в заголовках.
 */
function makeApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(clientIpMiddleware);
  app.get("/ip", (req, res) => {
    res.json({
      rateLimit: getIp(req),
      reqIp: req.ip,
      // Той самий виклик, що робить Better Auth з опціями з auth.ts.
      betterAuth: betterAuthGetIp(fromNodeHeaders(req.headers), {
        advanced: { ipAddress: { ipAddressHeaders: AUTH_IP_ADDRESS_HEADERS } },
      }),
    });
  });
  return app;
}

describe("verifySignedClientIp", () => {
  it("повертає IP лише за збігу підпису", () => {
    expect(verifySignedClientIp(signed("203.0.113.5"), SECRET)).toBe(
      "203.0.113.5",
    );
  });

  it("відхиляє хибний підпис, підпис іншого IP, чужий секрет, відсутній секрет", () => {
    const ip = "203.0.113.5";
    const h = (sig: string) => ({
      [CLIENT_IP_HEADER]: ip,
      [CLIENT_IP_SIG_HEADER]: sig,
    });
    expect(verifySignedClientIp(h("AAAA"), SECRET)).toBeUndefined();
    expect(
      verifySignedClientIp(h(sign("203.0.113.6")), SECRET),
    ).toBeUndefined();
    expect(
      verifySignedClientIp(h(sign(ip, "x".repeat(40))), SECRET),
    ).toBeUndefined();
    expect(verifySignedClientIp(h(sign(ip)), undefined)).toBeUndefined();
    expect(
      verifySignedClientIp({ [CLIENT_IP_HEADER]: ip }, SECRET),
    ).toBeUndefined();
  });

  it("відхиляє не-IP значення навіть з валідним підписом", () => {
    expect(verifySignedClientIp(signed("not-an-ip"), SECRET)).toBeUndefined();
  });
});

describe("getIp / getClientIp (rel-03)", () => {
  beforeEach(() => {
    envMock.SERGEANT_CLIENT_IP_SECRET = SECRET;
  });

  const req = (headers: Record<string, string>) =>
    ({ ip: EGRESS, headers }) as unknown as express.Request;

  it("правильний підпис -> IP із заголовка (різні клієнти за одним egress -> різні ключі)", () => {
    const a = req(signed("203.0.113.5"));
    const b = req(signed("198.51.100.9"));
    expect(getIp(a)).toBe("203.0.113.5");
    expect(getIp(b)).toBe("198.51.100.9");
    expect(getClientIp(a)).toBe("203.0.113.5");
  });

  it("хибний підпис -> req.ip", () => {
    const r = req({
      [CLIENT_IP_HEADER]: "203.0.113.5",
      [CLIENT_IP_SIG_HEADER]: sign("203.0.113.6"),
    });
    expect(getIp(r)).toBe(EGRESS);
  });

  it("відсутній підпис -> req.ip", () => {
    expect(getIp(req({ [CLIENT_IP_HEADER]: "203.0.113.5" }))).toBe(EGRESS);
  });

  it("відсутній секрет у env -> req.ip, навіть із 'валідним' підписом", () => {
    envMock.SERGEANT_CLIENT_IP_SECRET = undefined;
    expect(getIp(req(signed("203.0.113.5")))).toBe(EGRESS);
  });
});

describe("clientIpMiddleware: rate-limit і Better Auth бачать той самий IP (rel-03)", () => {
  beforeEach(() => {
    envMock.SERGEANT_CLIENT_IP_SECRET = SECRET;
  });

  it("валідний підпис: обидва беруть IP із заголовка", async () => {
    const res = await request(makeApp())
      .get("/ip")
      .set(signed("203.0.113.5"))
      .set("x-forwarded-for", "10.9.9.9");
    expect(res.body.rateLimit).toBe("203.0.113.5");
    expect(res.body.betterAuth).toBe("203.0.113.5");
  });

  it("підроблений клієнтом x-sergeant-resolved-client-ip стирається", async () => {
    const res = await request(makeApp())
      .get("/ip")
      .set(RESOLVED_CLIENT_IP_HEADER, "6.6.6.6")
      .set("x-forwarded-for", "9.9.9.9");
    expect(res.body.betterAuth).toBe("9.9.9.9");
  });

  it("хибний підпис: Better Auth лишається на x-forwarded-for, rate-limit на req.ip", async () => {
    const res = await request(makeApp())
      .get("/ip")
      .set(CLIENT_IP_HEADER, "6.6.6.6")
      .set(CLIENT_IP_SIG_HEADER, "forged")
      .set(RESOLVED_CLIENT_IP_HEADER, "6.6.6.6")
      .set("x-forwarded-for", "9.9.9.9");
    expect(res.body.rateLimit).toBe(res.body.reqIp);
    expect(res.body.betterAuth).toBe("9.9.9.9");
  });

  it("без секрету поведінка як раніше: заголовки ігноруються", async () => {
    envMock.SERGEANT_CLIENT_IP_SECRET = undefined;
    const res = await request(makeApp())
      .get("/ip")
      .set(signed("203.0.113.5"))
      .set("x-forwarded-for", "9.9.9.9");
    expect(res.body.rateLimit).toBe(res.body.reqIp);
    expect(res.body.betterAuth).toBe("9.9.9.9");
  });
});
