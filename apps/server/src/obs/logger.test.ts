import { describe, it, expect } from "vitest";
import pino from "pino";
import { redactKeyNames, redactPaths, serializeError } from "./logger.js";

function makeTestLogger(): {
  logger: pino.Logger;
  chunks: string[];
} {
  const chunks: string[] = [];
  const stream: pino.DestinationStream = {
    write(chunk: string) {
      chunks.push(chunk);
    },
  };
  const logger = pino(
    {
      level: "info",
      redact: { paths: redactPaths, censor: "[redacted]" },
    },
    stream,
  );
  return { logger, chunks };
}

describe("logger", () => {
  describe("redactPaths", () => {
    it("містить обов'язкові шляхи для секретів та PII", () => {
      expect(redactPaths).toContain("req.headers.authorization");
      expect(redactPaths).toContain("req.headers.cookie");
      expect(redactPaths).toContain('req.headers["x-csrf-token"]');
      expect(redactPaths).toContain('res.headers["set-cookie"]');
      expect(redactPaths).toContain("password");
      expect(redactPaths).toContain("token");
      expect(redactPaths).toContain("sessionToken");
      expect(redactPaths).toContain("email");
      expect(redactPaths).toContain("phone");
      expect(redactPaths).toContain("privateKey");
      expect(redactPaths).toContain("signature");
      expect(redactPaths).toContain("connectionString");
      expect(redactPaths).toContain("dsn");
    });

    it("redact працює з pino — маскує секретні поля у root", () => {
      const { logger, chunks } = makeTestLogger();

      logger.info({
        msg: "test_redact",
        password: "super-secret-123",
        token: "jwt-token-abc",
        email: "user@example.com",
        phone: "+380991234567",
        safeField: "this-should-remain",
      });

      expect(chunks).toHaveLength(1);
      const parsed = JSON.parse(chunks[0]!) as Record<string, unknown>;
      expect(parsed.password).toBe("[redacted]");
      expect(parsed.token).toBe("[redacted]");
      expect(parsed.email).toBe("[redacted]");
      expect(parsed.phone).toBe("[redacted]");
      expect(parsed.safeField).toBe("this-should-remain");
    });

    it("redact wildcard ловить вкладені password/token/apiKey", () => {
      const { logger, chunks } = makeTestLogger();

      logger.info({
        msg: "nested_redact",
        body: {
          user: { password: "p1", apiKey: "k1" },
        },
        ctx: { secret: "s1", privateKey: "pk1" },
      });

      const parsed = JSON.parse(chunks[0]!) as Record<string, unknown>;
      const body = parsed.body as { user: Record<string, unknown> };
      expect(body.user.password).toBe("[redacted]");
      expect(body.user.apiKey).toBe("[redacted]");
      const ctx = parsed.ctx as Record<string, unknown>;
      expect(ctx.secret).toBe("[redacted]");
      expect(ctx.privateKey).toBe("[redacted]");
    });

    it("redact ловить sensitive headers у req/res", () => {
      const { logger, chunks } = makeTestLogger();

      logger.info({
        msg: "headers_redact",
        req: {
          headers: {
            authorization: "Bearer abcdef",
            cookie: "session=xxx",
            "x-csrf-token": "csrf-yyy",
            "x-api-key": "key-zzz",
            "user-agent": "Mozilla/5.0",
          },
        },
        res: {
          headers: { "set-cookie": "auth=qqq" },
        },
      });

      const parsed = JSON.parse(chunks[0]!) as {
        req: { headers: Record<string, unknown> };
        res: { headers: Record<string, unknown> };
      };
      expect(parsed.req.headers.authorization).toBe("[redacted]");
      expect(parsed.req.headers.cookie).toBe("[redacted]");
      expect(parsed.req.headers["x-csrf-token"]).toBe("[redacted]");
      expect(parsed.req.headers["x-api-key"]).toBe("[redacted]");
      // Не маскуємо нейтральні headers — sanity check.
      expect(parsed.req.headers["user-agent"]).toBe("Mozilla/5.0");
      expect(parsed.res.headers["set-cookie"]).toBe("[redacted]");
    });

    it("redact маскує session.token (структуроване auth)", () => {
      const { logger, chunks } = makeTestLogger();

      logger.info({
        msg: "session_redact",
        session: {
          token: "session-abc",
          userId: "user-123",
        },
      });

      const parsed = JSON.parse(chunks[0]!) as {
        session: Record<string, unknown>;
      };
      expect(parsed.session.token).toBe("[redacted]");
      // userId — не sensitive, лишається.
      expect(parsed.session.userId).toBe("user-123");
    });
  });

  describe("redactKeyNames (для Sentry-скрабера)", () => {
    it("експортується з обов'язковими ключами", () => {
      // Sentry beforeSend hook використовує цей список для рекурсивного
      // скрабу. Якщо переставив — оновити sentry.ts.
      expect(redactKeyNames).toContain("password");
      expect(redactKeyNames).toContain("token");
      expect(redactKeyNames).toContain("email");
      expect(redactKeyNames).toContain("phone");
      expect(redactKeyNames).toContain("authorization");
      expect(redactKeyNames).toContain("cookie");
      expect(redactKeyNames).toContain("set-cookie");
      expect(redactKeyNames).toContain("privateKey");
      expect(redactKeyNames).toContain("dsn");
    });
  });

  describe("serializeError", () => {
    it("серіалізує звичайний Error", () => {
      const err = new Error("test error");
      err.name = "TestError";
      const result = serializeError(err);
      expect(result).toMatchObject({
        name: "TestError",
        message: "test error",
      });
      expect(result?.stack).toBeUndefined();
    });

    it("включає stack коли includeStack=true", () => {
      const err = new Error("with stack");
      const result = serializeError(err, { includeStack: true });
      expect(result?.stack).toBeDefined();
      expect(result?.stack).toContain("with stack");
    });

    it("розгортає err.cause рекурсивно", () => {
      const root = new Error("root cause");
      const mid = new Error("middle", { cause: root });
      const top = new Error("top", { cause: mid });

      const result = serializeError(top);
      expect(result?.message).toBe("top");
      expect(result?.cause?.message).toBe("middle");
      expect(result?.cause?.cause?.message).toBe("root cause");
    });

    it("обмежує глибину рекурсії (depth)", () => {
      const deep = new Error("deep", {
        cause: new Error("deeper", {
          cause: new Error("deepest"),
        }),
      });
      const result = serializeError(deep, { depth: 1 });
      expect(result?.message).toBe("deep");
      expect(result?.cause?.message).toBe("deeper");
      // depth=1 на рівні cause → cause.cause має depth=0 → undefined
      expect(result?.cause?.cause).toBeUndefined();
    });

    it("повертає undefined для null/undefined", () => {
      expect(serializeError(null)).toBeUndefined();
      expect(serializeError(undefined)).toBeUndefined();
    });

    it("обробляє не-об'єктні значення", () => {
      const result = serializeError("string error");
      expect(result).toEqual({ message: "string error" });
    });

    it("включає code та status", () => {
      const err = Object.assign(new Error("http error"), {
        code: "ECONNREFUSED",
        status: 502,
      });
      const result = serializeError(err);
      expect(result?.code).toBe("ECONNREFUSED");
      expect(result?.status).toBe(502);
    });
  });
});
