import { describe, it, expect } from "vitest";
import {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  ExternalServiceError,
  isOperationalError,
  makeAiProviderError,
} from "./errors.js";

describe("AppError hierarchy", () => {
  it("AppError має дефолт status=500, code=INTERNAL", () => {
    const e = new AppError("boom");
    expect(e.status).toBe(500);
    expect(e.code).toBe("INTERNAL");
    expect(e).toBeInstanceOf(Error);
  });

  it("підкласи мають коректні status/code", () => {
    expect(new ValidationError("bad").status).toBe(400);
    expect(new ValidationError("bad").code).toBe("VALIDATION");
    expect(new UnauthorizedError().status).toBe(401);
    expect(new ForbiddenError().status).toBe(403);
    expect(new NotFoundError().status).toBe(404);
    expect(new RateLimitError().status).toBe(429);
    expect(new ExternalServiceError("x").status).toBe(502);
  });

  it("isOperationalError розпізнає AppError, але не звичайні Error", () => {
    expect(isOperationalError(new ValidationError("x"))).toBe(true);
    expect(isOperationalError(new NotFoundError())).toBe(true);
    expect(isOperationalError(new Error("x"))).toBe(false);
    expect(isOperationalError(null)).toBe(false);
  });

  it("передає cause", () => {
    const cause = new Error("root");
    const e = new ValidationError("wrap", { cause });
    expect(e.cause).toBe(cause);
  });
});

describe("makeAiProviderError", () => {
  it("ніколи не пробрасывает auth-статуси upstream-у клієнту", () => {
    // Anthropic-401 (наш невалідний ключ) діставався клієнта як HTTP 401 і
    // UI показував «Доступ заборонено» залогіненому користувачу
    // (аудит 2026-08-04, знахідка 6).
    expect(
      makeAiProviderError({ rawProviderMessage: "x", status: 401 }).status,
    ).toBe(502);
    expect(
      makeAiProviderError({ rawProviderMessage: "x", status: 403 }).status,
    ).toBe(502);
    expect(
      makeAiProviderError({ rawProviderMessage: "x", status: 500 }).status,
    ).toBe(502);
    expect(
      makeAiProviderError({ rawProviderMessage: "x", status: undefined })
        .status,
    ).toBe(502);
  });

  it("429 upstream → 503 (спробуй пізніше), не власний rate-limit клієнта", () => {
    expect(
      makeAiProviderError({ rawProviderMessage: "x", status: 429 }).status,
    ).toBe(503);
  });

  it("cause несе message — pino не друкує [object Object]", () => {
    const e = makeAiProviderError({
      rawProviderMessage: "invalid x-api-key",
      status: 401,
    });
    expect((e.cause as { message: string }).message).toContain("401");
    expect((e.cause as { message: string }).message).toContain(
      "invalid x-api-key",
    );
  });
});
