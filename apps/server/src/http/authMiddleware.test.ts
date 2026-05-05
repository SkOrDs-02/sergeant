import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "crypto";
import type { Request, Response } from "express";
import type { Mock } from "vitest";

// Мокаємо logger ДО імпорту модуля, щоб зафіксувати виклики.
vi.mock("../obs/logger.js", async () => {
  const actual = await vi.importActual("../obs/logger.js");
  return {
    ...actual,
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
    },
  };
});

vi.mock("../obs/metrics.js", async () => {
  const actual = await vi.importActual("../obs/metrics.js");
  return {
    ...actual,
    authAttemptsTotal: { inc: vi.fn() },
  };
});

import { logger } from "../obs/logger.js";
import { authAttemptsTotal } from "../obs/metrics.js";
import { authMetricsMiddleware } from "./authMiddleware.js";

describe("authMetricsMiddleware structured auth_event log", () => {
  interface TestRes {
    statusCode: number;
    on(event: string, handler: () => void): TestRes;
    _finish(status: number): void;
  }
  function makeReqRes({
    url = "/api/auth/sign-in/email",
    body = {} as unknown,
    ip = "1.2.3.4",
    ua = "vitest/1.0",
  } = {}) {
    const listeners: Record<string, () => void> = {};
    const req = {
      method: "POST",
      originalUrl: url,
      body,
      ip,
      get: (h: string) => (h.toLowerCase() === "user-agent" ? ua : undefined),
    } as unknown as Request;
    const res: TestRes = {
      statusCode: 200,
      on(event: string, handler: () => void) {
        listeners[event] = handler;
        return this;
      },
      _finish(status: number) {
        this.statusCode = status;
        listeners["finish"]?.();
      },
    };
    return { req, res: res as TestRes & Response };
  }

  function expectedEmailHash(email: string) {
    return createHash("sha256")
      .update(email.toLowerCase())
      .digest("hex")
      .slice(0, 12);
  }

  const loggerMocks = logger as unknown as {
    debug: Mock;
    info: Mock;
    warn: Mock;
    error: Mock;
    fatal: Mock;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits warn-level auth_event with emailHash on bad_credentials (401)", () => {
    const { req, res } = makeReqRes({ body: { email: "User@Example.com" } });
    authMetricsMiddleware(req, res, () => {});
    res._finish(401);

    expect(authAttemptsTotal.inc).toHaveBeenCalledWith({
      op: "sign_in",
      outcome: "bad_credentials",
    });
    expect(logger.warn).toHaveBeenCalledWith({
      msg: "auth_event",
      op: "sign_in",
      outcome: "bad_credentials",
      status: 401,
      emailHash: expectedEmailHash("user@example.com"),
      ip: "1.2.3.4",
      ua: "vitest/1.0",
    });
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("emits info-level auth_event on success (200) without throwing when email absent", () => {
    const { req, res } = makeReqRes({
      url: "/api/auth/sign-out",
      body: undefined,
    });
    authMetricsMiddleware(req, res, () => {});
    res._finish(200);

    expect(authAttemptsTotal.inc).toHaveBeenCalledWith({
      op: "signout",
      outcome: "ok",
    });
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "auth_event",
        op: "signout",
        outcome: "ok",
        status: 200,
        emailHash: undefined,
      }),
    );
  });

  it("maps 429 → rate_limited (warn), 5xx → error; NEVER logs plaintext email", () => {
    const { req, res } = makeReqRes({ body: { email: "victim@example.com" } });
    authMetricsMiddleware(req, res, () => {});
    res._finish(429);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "rate_limited", status: 429 }),
    );
    // Прискіпливий захист: плейн-текст email НЕ має протекти в жоден лог-виклик.
    const allCalls = [
      ...loggerMocks.debug.mock.calls,
      ...loggerMocks.info.mock.calls,
      ...loggerMocks.warn.mock.calls,
      ...loggerMocks.error.mock.calls,
      ...loggerMocks.fatal.mock.calls,
    ];
    for (const [arg] of allCalls) {
      const s = JSON.stringify(arg);
      expect(s).not.toContain("victim@example.com");
      expect(s).not.toContain("VICTIM@EXAMPLE.COM");
    }

    // І окремий кейс 5xx.
    const { req: r2, res: rs2 } = makeReqRes();
    authMetricsMiddleware(r2, rs2, () => {});
    rs2._finish(503);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "error", status: 503 }),
    );
  });

  it("skips (no op match) for non-auth URLs and GET requests", () => {
    const next = vi.fn();
    const { req, res } = makeReqRes({ url: "/api/health" });
    authMetricsMiddleware(req, res, next);
    res._finish(200);
    expect(next).toHaveBeenCalled();
    expect(authAttemptsTotal.inc).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();

    vi.clearAllMocks();
    const getReq = {
      ...req,
      method: "GET",
      originalUrl: "/api/auth/sign-in",
    } as unknown as Request;
    authMetricsMiddleware(getReq, res, next);
    expect(authAttemptsTotal.inc).not.toHaveBeenCalled();
  });
});
