import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request, Response } from "express";

vi.mock("@sentry/node", () => {
  return {
    captureException: vi.fn(),
  };
});

import * as Sentry from "@sentry/node";
import { errorHandler } from "./errorHandler.js";
import { AppError } from "../obs/errors.js";

function makeReqRes() {
  const headers: Record<string, string> = {};
  return {
    req: {
      method: "POST",
      originalUrl: "/api/x",
      requestId: "req_1",
    } as unknown as Request,
    res: Object.assign(
      {
        statusCode: 200,
        body: undefined as unknown,
        headersSent: false,
        setHeader(name: string, value: string) {
          headers[name] = value;
        },
      },
      {
        status(this: { statusCode: number }, code: number) {
          this.statusCode = code;
          return this;
        },
        json(this: { body: unknown }, payload: unknown) {
          this.body = payload;
          return this;
        },
      },
    ) as unknown as Response & { statusCode: number; body: unknown },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("errorHandler → Sentry.captureException", () => {
  it("капсулує неочікувану помилку (500) у Sentry.captureException", () => {
    const { req, res } = makeReqRes();
    const err = new Error("boom");
    errorHandler(err, req, res, () => {});
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual(
      expect.objectContaining({ code: "INTERNAL", requestId: "req_1" }),
    );
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(err);
  });

  it("operational AppError (4xx) НЕ йде в Sentry.captureException", () => {
    const { req, res } = makeReqRes();
    const err = new AppError("bad input", { status: 400, code: "BAD_INPUT" });
    errorHandler(err, req, res, () => {});
    expect(res.statusCode).toBe(400);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("429 rate-limit теж НЕ йде у Sentry (це operational)", () => {
    const { req, res } = makeReqRes();
    const err = new AppError("rate limited", {
      status: 429,
      code: "RATE_LIMIT",
    });
    errorHandler(err, req, res, () => {});
    expect(res.statusCode).toBe(429);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});

describe("errorHandler → response body shape", () => {
  it("дублює `error` як `message` для бібліотек на зразок better-fetch", () => {
    // Better Auth client (better-fetch) читає `message` при
    // десеріалізації не-2xx body. Якщо там тільки `error` — фронт ловить
    // `undefined` і показує generic fallback. Цей тест замикає контракт:
    // обидва поля присутні і збігаються.
    const { req, res } = makeReqRes();
    const err = new AppError("bad input", { status: 400, code: "BAD_INPUT" });
    errorHandler(err, req, res, () => {});
    expect(res.body).toEqual(
      expect.objectContaining({
        error: "bad input",
        message: "bad input",
        code: "BAD_INPUT",
      }),
    );
  });

  it("для не-operational 500 повертає generic `Server error` у обидвох полях", () => {
    // На programmer-помилки витікати `e.message` не можна — там можуть
    // бути SQL-фрагменти, токени тощо. `message` має містити те саме
    // безпечне рядкове значення, що й `error`.
    const { req, res } = makeReqRes();
    errorHandler(
      new Error("connection terminated unexpectedly"),
      req,
      res,
      () => {},
    );
    expect(res.body).toEqual(
      expect.objectContaining({
        error: "Server error",
        message: "Server error",
        code: "INTERNAL",
      }),
    );
  });
});
