import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request, Response } from "express";
import type { LogFn } from "pino";

vi.mock("@sentry/node", () => {
  return {
    captureException: vi.fn(),
  };
});

// Замість справжнього pino-логера ставимо мокову copy яку тести можуть
// читати — щоб перевірити, що C1-redaction-хелпер замінив секрет у
// `path`-полі лог-рядка. `vi.hoisted` потрібний бо `vi.mock` factory
// hoisted до top-of-file, а звичайна `const` — ні.
const { loggerMock } = vi.hoisted(() => ({
  loggerMock: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
  },
}));

vi.mock("../obs/logger.js", () => ({
  logger: loggerMock,
  serializeError: (err: unknown) =>
    err && typeof err === "object" && "message" in err
      ? { message: (err as { message: string }).message }
      : { message: String(err) },
}));
type Recorded = Parameters<LogFn>[0];

import * as Sentry from "@sentry/node";
import { errorHandler } from "./errorHandler.js";
import { AppError, ValidationError } from "../obs/errors.js";

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

describe("errorHandler → log path redaction (C1)", () => {
  // `docs/security/hardening/C1-mono-webhook-secret-in-url.md`
  // Якщо запит впав до того, як Express розрезолвив route (404, body-parser
  // помилка), `req.route` undefined → fallback на `req.originalUrl`. Без
  // редакції webhook-secret потрапляв у Pino лог із 30-day retention.
  it("маскує секрет у `path` полі при fallback на req.originalUrl", () => {
    const { req, res } = makeReqRes();
    (req as unknown as { originalUrl: string }).originalUrl =
      "/api/mono/webhook/leaked-secret-abc-123";
    const err = new Error("body parser failed");
    errorHandler(err, req, res, () => {});
    expect(loggerMock.error).toHaveBeenCalledTimes(1);
    const logCall = loggerMock.error.mock.calls[0]![0] as Recorded;
    expect(logCall).toMatchObject({
      msg: "request_failed",
      path: "/api/mono/webhook/[redacted]",
    });
  });

  it("preserves route pattern path (вже безпечно — :secret а не <secret>)", () => {
    const { req, res } = makeReqRes();
    (req as unknown as { route: { path: string } }).route = {
      path: "/api/mono/webhook/:secret",
    };
    const err = new AppError("bad payload", { status: 400, code: "BAD_INPUT" });
    errorHandler(err, req, res, () => {});
    const logCall = loggerMock.warn.mock.calls[0]![0] as Recorded;
    expect(logCall).toMatchObject({
      path: "/api/mono/webhook/:secret",
    });
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

  it("витягує `details` із cause для ValidationError (parseBody/parseQuery)", () => {
    // `parseBody`/`parseQuery` з `http/validate.ts` кидають
    // `ValidationError(msg, { cause: { details } })`. errorHandler має
    // підняти `details` у відповідь клієнту, щоб контракт залишився
    // ідентичним до старого `validateBody`-sentinel response shape.
    const { req, res } = makeReqRes();
    const err = new ValidationError("Некоректні дані запиту", {
      cause: {
        details: [
          { path: "amount", message: "expected number" },
          { path: "currency", message: "required" },
        ],
      },
    });
    errorHandler(err, req, res, () => {});
    expect(res.body).toEqual(
      expect.objectContaining({
        error: "Некоректні дані запиту",
        code: "VALIDATION",
        details: [
          { path: "amount", message: "expected number" },
          { path: "currency", message: "required" },
        ],
      }),
    );
  });

  it("НЕ surfaces cause для 5xx (programmer error → cause може містити PII/stack)", () => {
    const { req, res } = makeReqRes();
    // Симулюємо випадок: внутрішня ExternalServiceError-like з 500
    // статусом і обʼєктом-cause-ом. На 5xx деталі мусять зникнути з
    // body — це програмерська помилка, клієнт побачить лише generic
    // повідомлення.
    const err = new AppError("internal blew up", {
      status: 500,
      code: "INTERNAL",
      cause: { details: [{ path: "secretField", message: "leaked stack" }] },
    });
    // Викидаємо `isOperationalError`-флаг руками — `AppError` сам по собі
    // operational, тому тут треба підкласти простий Error з прокинутими
    // полями, щоб симулювати програмерську помилку зі status=500.
    const programmerErr = Object.assign(new Error("blew up"), {
      status: 500,
      code: "INTERNAL",
      cause: err.cause,
    });
    errorHandler(programmerErr, req, res, () => {});
    expect(res.body).toEqual(
      expect.objectContaining({
        error: "Server error",
        code: "INTERNAL",
      }),
    );
    expect(res.body).not.toHaveProperty("details");
  });
});
