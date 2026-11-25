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
import { z } from "zod";
import {
  AppError,
  ExternalServiceError,
  ValidationError,
} from "../obs/errors.js";
import { shouldReportToSentry } from "./errorClassification.js";

function pgError(code: string, message = "pg failure"): Error {
  return Object.assign(new Error(message), { code, severity: "ERROR" });
}

function zodError(): unknown {
  try {
    z.object({ total: z.number() }).parse({ total: "12" });
  } catch (err) {
    return err;
  }
  throw new Error("zod parse unexpectedly passed");
}

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
    headers,
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

  it("non-operational 4xx (body-parser malformed JSON) → VALIDATION, не INTERNAL", () => {
    // body-parser кидає http-errors SyntaxError зі status=400 + expose=true на
    // невалідний JSON (напр. сирий NUL-байт у body). Це client-помилка, не
    // programmer-bug — має бути чистий 400/VALIDATION, а не 400/INTERNAL з
    // «Server error».
    const { req, res } = makeReqRes();
    const bodyParserErr = Object.assign(
      new SyntaxError("Unexpected non-whitespace character after JSON"),
      { status: 400, type: "entity.parse.failed", expose: true },
    );
    errorHandler(bodyParserErr, req, res, () => {});
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual(
      expect.objectContaining({
        code: "VALIDATION",
        message: "Unexpected non-whitespace character after JSON",
      }),
    );
    expect(Sentry.captureException).not.toHaveBeenCalled();
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

// sec-39: SQLSTATE і системні коди клієнту не віддаємо; pg-помилки вводу
// мапимо на 4xx без Sentry; ZodError поза межею запиту лишається багом.
describe("errorHandler → класифікація non-operational помилок (sec-39)", () => {
  it("non-operational 5xx не віддає SQLSTATE у `code`", () => {
    const { req, res } = makeReqRes();
    const err = pgError("42P01", 'relation "x" does not exist');
    errorHandler(err, req, res, () => {});
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual(
      expect.objectContaining({ code: "INTERNAL", error: "Server error" }),
    );
    expect(Sentry.captureException).toHaveBeenCalledWith(err);
  });

  it("non-operational 5xx не віддає системний код (ECONNREFUSED)", () => {
    const { req, res } = makeReqRes();
    errorHandler(pgError("ECONNREFUSED"), req, res, () => {});
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual(expect.objectContaining({ code: "INTERNAL" }));
  });

  it("pg 22P05 (NUL у тексті) → 400 VALIDATION без Sentry і без SQLSTATE", () => {
    const { req, res } = makeReqRes();
    errorHandler(pgError("22P05"), req, res, () => {});
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual(expect.objectContaining({ code: "VALIDATION" }));
    expect(JSON.stringify(res.body)).not.toContain("22P05");
    expect(res.body).not.toHaveProperty("details");
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("pg 23505 у `cause` обгортки → 409 CONFLICT + Sentry рівня warning", () => {
    // Клас 23 (FK/unique/check) найчастіше наш баг: клієнт бачить 409, але
    // подія мусить бути — інакше такі баги зникають із дашборда (sec-39).
    const { req, res } = makeReqRes();
    const wrapped = new Error("Failed query", { cause: pgError("23505") });
    errorHandler(wrapped, req, res, () => {});
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual(expect.objectContaining({ code: "CONFLICT" }));
    expect(JSON.stringify(res.body)).not.toContain("23505");
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(wrapped, {
      level: "warning",
      tags: { sqlstate: "23505" },
    });
    // Sentry-хендлер (`shouldHandleError`) цю подію НЕ дублює рівнем error.
    expect(shouldReportToSentry(wrapped)).toBe(false);
  });

  it.each(["40P01", "40001"])(
    "pg %s → 503 UNAVAILABLE з Retry-After, без Sentry",
    (sqlState) => {
      const { req, res, headers } = makeReqRes();
      errorHandler(pgError(sqlState), req, res, () => {});
      expect(res.statusCode).toBe(503);
      expect(res.body).toEqual(
        expect.objectContaining({ code: "UNAVAILABLE" }),
      );
      expect(headers["Retry-After"]).toBe("2");
      expect(Sentry.captureException).not.toHaveBeenCalled();
    },
  );

  it("невловлений ZodError (схема відповіді, Hard Rule #3) лишається 500 INTERNAL + Sentry без деталей", () => {
    const { req, res } = makeReqRes();
    const err = zodError();
    errorHandler(err, req, res, () => {});
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual(
      expect.objectContaining({ code: "INTERNAL", error: "Server error" }),
    );
    expect(res.body).not.toHaveProperty("details");
    expect(JSON.stringify(res.body)).not.toContain("total");
    expect(Sentry.captureException).toHaveBeenCalledWith(err);
  });

  it("operational AppError зберігає свій `code` і на 5xx", () => {
    const { req, res } = makeReqRes();
    errorHandler(
      new AppError("no token", { status: 503, code: "DPS_TOKEN_MISSING" }),
      req,
      res,
      () => {},
    );
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual(
      expect.objectContaining({ code: "DPS_TOKEN_MISSING" }),
    );
  });
});

describe("shouldReportToSentry ↔ errorHandler (sec-39)", () => {
  // Sentry-хендлер стоїть ПЕРЕД errorHandler і вирішує сам. Для
  // non-operational помилок його рішення мусить збігатись із тим, чи
  // errorHandler кличе captureException.
  const nonOperational: Array<[string, unknown]> = [
    ["Error", new Error("boom")],
    ["ZodError", zodError()],
    ["pg 42P01", pgError("42P01")],
    ["pg 22P05", pgError("22P05")],
    ["pg 40P01", pgError("40P01")],
    ["body-parser 400", Object.assign(new Error("bad json"), { status: 400 })],
    ["explicit 502", Object.assign(new Error("x"), { status: 502 })],
  ];

  it.each(nonOperational)("%s: збігається з captureException", (_n, err) => {
    const { req, res } = makeReqRes();
    errorHandler(err, req, res, () => {});
    const captured = vi.mocked(Sentry.captureException).mock.calls.length > 0;
    expect(shouldReportToSentry(err)).toBe(captured);
  });

  it("operational 4xx не репортиться, operational 5xx репортиться (як дефолт Sentry)", () => {
    expect(shouldReportToSentry(new ValidationError("bad"))).toBe(false);
    expect(shouldReportToSentry(new ExternalServiceError("down"))).toBe(true);
  });
});
