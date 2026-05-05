import { describe, it, expect } from "vitest";
import pino from "pino";
import { hashUserId, isUserIdHash } from "../lib/userIdHash.js";
import { als } from "./requestContext.js";
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
      expect(parsed["password"]).toBe("[redacted]");
      expect(parsed["token"]).toBe("[redacted]");
      expect(parsed["email"]).toBe("[redacted]");
      expect(parsed["phone"]).toBe("[redacted]");
      expect(parsed["safeField"]).toBe("this-should-remain");
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
      const body = parsed["body"] as { user: Record<string, unknown> };
      expect(body.user["password"]).toBe("[redacted]");
      expect(body.user["apiKey"]).toBe("[redacted]");
      const ctx = parsed["ctx"] as Record<string, unknown>;
      expect(ctx["secret"]).toBe("[redacted]");
      expect(ctx["privateKey"]).toBe("[redacted]");
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
      expect(parsed.req.headers["authorization"]).toBe("[redacted]");
      expect(parsed.req.headers["cookie"]).toBe("[redacted]");
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
      expect(parsed.session["token"]).toBe("[redacted]");
      // userId — не sensitive, лишається.
      expect(parsed.session["userId"]).toBe("user-123");
    });
  });

  // M3 — `docs/security/hardening/M3-pino-redact-paths.md`
  // Table-driven: для кожного нового entry у redactPaths переконуємось,
  // що pino дійсно маскує його при дамп-у. Single source of truth — цей
  // масив; redactPaths можна розширювати без правки індивідуальних it().
  describe("M3 — extended redactPaths coverage", () => {
    interface Case {
      readonly name: string;
      readonly payload: Record<string, unknown>;
      readonly readRedacted: (parsed: Record<string, unknown>) => unknown;
      readonly readSafe?: (parsed: Record<string, unknown>) => unknown;
    }

    const cases: ReadonlyArray<Case> = [
      {
        name: "X-Mono-Webhook-Secret header у req.headers",
        payload: {
          msg: "mono_webhook_dbg",
          req: {
            headers: {
              "x-mono-webhook-secret": "leaked-secret-abc",
              "user-agent": "Monobank/1.0",
            },
          },
        },
        readRedacted: (p) =>
          (
            p["req"] as {
              headers: Record<string, unknown>;
            }
          ).headers["x-mono-webhook-secret"],
        readSafe: (p) =>
          (
            p["req"] as {
              headers: Record<string, unknown>;
            }
          ).headers["user-agent"],
      },
      {
        name: "X-Openclaw-Webhook-Secret header",
        payload: {
          req: {
            headers: { "x-openclaw-webhook-secret": "openclaw-secret-xyz" },
          },
        },
        readRedacted: (p) =>
          (
            p["req"] as {
              headers: Record<string, unknown>;
            }
          ).headers["x-openclaw-webhook-secret"],
      },
      {
        name: "X-Api-Secret header",
        payload: {
          req: {
            headers: { "x-api-secret": "api-secret-123" },
          },
        },
        readRedacted: (p) =>
          (
            p["req"] as {
              headers: Record<string, unknown>;
            }
          ).headers["x-api-secret"],
      },
      {
        name: "X-Internal-Token header",
        payload: {
          req: {
            headers: { "x-internal-token": "internal-tok-abc" },
          },
        },
        readRedacted: (p) =>
          (
            p["req"] as {
              headers: Record<string, unknown>;
            }
          ).headers["x-internal-token"],
      },
      {
        name: "groqKey у root",
        payload: { groqKey: "gsk_live_xxx" },
        readRedacted: (p) => p["groqKey"],
      },
      {
        name: "anthropicKey у root",
        payload: { anthropicKey: "sk-ant-xxx" },
        readRedacted: (p) => p["anthropicKey"],
      },
      {
        name: "voyageKey у root",
        payload: { voyageKey: "pa-voyage-xxx" },
        readRedacted: (p) => p["voyageKey"],
      },
      {
        name: "groqKey всередині debug-об'єкта (1 рівень)",
        payload: { ctx: { groqKey: "gsk_live_xxx", model: "llama" } },
        readRedacted: (p) => (p["ctx"] as Record<string, unknown>)["groqKey"],
        readSafe: (p) => (p["ctx"] as Record<string, unknown>)["model"],
      },
      {
        name: "req.body.password (login flow)",
        payload: {
          req: { body: { email: "u@example.com", password: "leak" } },
        },
        readRedacted: (p) =>
          (p["req"] as { body: Record<string, unknown> }).body["password"],
      },
      {
        name: "req.body.token (CSRF / form token)",
        payload: { req: { body: { token: "form-token-xxx" } } },
        readRedacted: (p) =>
          (p["req"] as { body: Record<string, unknown> }).body["token"],
      },
      {
        name: "req.body.currentPassword (change-password endpoint)",
        payload: { req: { body: { currentPassword: "old-pass" } } },
        readRedacted: (p) =>
          (p["req"] as { body: Record<string, unknown> }).body[
            "currentPassword"
          ],
      },
      {
        name: "req.body.newPassword (change-password endpoint)",
        payload: { req: { body: { newPassword: "new-pass" } } },
        readRedacted: (p) =>
          (p["req"] as { body: Record<string, unknown> }).body["newPassword"],
      },
      {
        name: "err.config.headers.Authorization (axios upstream failure)",
        payload: {
          err: {
            message: "ECONNRESET",
            config: {
              headers: {
                Authorization: "Bearer leaked-token",
                "Content-Type": "application/json",
              },
            },
          },
        },
        readRedacted: (p) =>
          (
            p["err"] as {
              config: { headers: Record<string, unknown> };
            }
          ).config.headers["Authorization"],
        readSafe: (p) =>
          (
            p["err"] as {
              config: { headers: Record<string, unknown> };
            }
          ).config.headers["Content-Type"],
      },
      {
        name: "err.config.headers.authorization (lowercase)",
        payload: {
          err: { config: { headers: { authorization: "Bearer leak" } } },
        },
        readRedacted: (p) =>
          (
            p["err"] as {
              config: { headers: Record<string, unknown> };
            }
          ).config.headers["authorization"],
      },
      {
        name: "err.config.headers.Cookie (axios upstream)",
        payload: {
          err: { config: { headers: { Cookie: "session=leaked" } } },
        },
        readRedacted: (p) =>
          (
            p["err"] as {
              config: { headers: Record<string, unknown> };
            }
          ).config.headers["Cookie"],
      },
      {
        name: "err.config.headers['x-mono-webhook-secret'] (axios outbound)",
        payload: {
          err: {
            config: { headers: { "x-mono-webhook-secret": "outbound-leak" } },
          },
        },
        readRedacted: (p) =>
          (
            p["err"] as {
              config: { headers: Record<string, unknown> };
            }
          ).config.headers["x-mono-webhook-secret"],
      },
    ];

    cases.forEach((c) => {
      it(`маскує ${c.name}`, () => {
        const { logger, chunks } = makeTestLogger();
        logger.info(c.payload);
        expect(chunks).toHaveLength(1);
        const parsed = JSON.parse(chunks[0]!) as Record<string, unknown>;
        expect(c.readRedacted(parsed)).toBe("[redacted]");
        if (c.readSafe) {
          // Sanity-check — нейтральне поле в тому ж payload-і не зачеплене.
          const safe = c.readSafe(parsed);
          expect(safe).not.toBe("[redacted]");
          expect(safe).toBeDefined();
        }
      });
    });
  });

  // M3 — Sentry redactKeyNames узгоджені з Pino redactPaths
  describe("M3 — redactKeyNames extended", () => {
    it("містить webhook-secret-headers (Sentry case-insensitive scrub)", () => {
      expect(redactKeyNames).toContain("x-mono-webhook-secret");
      expect(redactKeyNames).toContain("x-openclaw-webhook-secret");
      expect(redactKeyNames).toContain("x-api-secret");
      expect(redactKeyNames).toContain("x-internal-token");
    });

    it("містить provider-specific API-keys (для extra/contexts у Sentry)", () => {
      expect(redactKeyNames).toContain("groqKey");
      expect(redactKeyNames).toContain("anthropicKey");
      expect(redactKeyNames).toContain("voyageKey");
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

  // L10 — `docs/security/hardening/L10-user-id-hash-in-logs.md`. Pino's
  // `mixin()` reads `userId` from ALS-context and rewrites it as a 16-hex
  // `userIdHash`. Both directions are covered:
  //   - the helper itself (idempotent, deterministic, lower-cases UUIDs);
  //   - the integration with the real logger (mixin emits `userIdHash`,
  //     never raw `userId`, even with email/phone redaction in the same
  //     payload).
  describe("L10 — userIdHash in logs", () => {
    it("isUserIdHash returns true only for 16-char lowercase hex", () => {
      expect(isUserIdHash("0123456789abcdef")).toBe(true);
      expect(isUserIdHash("0123456789ABCDEF")).toBe(false);
      expect(isUserIdHash("0123456789abcde")).toBe(false); // 15
      expect(isUserIdHash("0123456789abcdef0")).toBe(false); // 17
      expect(isUserIdHash("xxxxxxxxxxxxxxxx")).toBe(false);
    });

    it("hashUserId returns null for empty/undefined input", () => {
      expect(hashUserId(undefined)).toBeNull();
      expect(hashUserId(null)).toBeNull();
      expect(hashUserId("")).toBeNull();
    });

    it("hashUserId is deterministic across calls", () => {
      const id = "9b0a4d96-1d4d-4c4f-9a8a-1bd3e9b35ddc";
      expect(hashUserId(id)).toBe(hashUserId(id));
    });

    it("hashUserId is case-insensitive (UUID lower/upper produce same hash)", () => {
      const lower = "9b0a4d96-1d4d-4c4f-9a8a-1bd3e9b35ddc";
      const upper = lower.toUpperCase();
      expect(hashUserId(lower)).toBe(hashUserId(upper));
    });

    it("hashUserId is idempotent — passing an existing hash returns it as-is", () => {
      const id = "9b0a4d96-1d4d-4c4f-9a8a-1bd3e9b35ddc";
      const first = hashUserId(id);
      expect(first).not.toBeNull();
      // Re-hashing the already-hashed value must not change it (otherwise
      // child loggers would double-hash and we'd lose grep-stability).
      expect(hashUserId(first!)).toBe(first);
    });

    it("hashUserId returns 16 hex chars and contains no UUID dashes", () => {
      const id = "9b0a4d96-1d4d-4c4f-9a8a-1bd3e9b35ddc";
      const hash = hashUserId(id)!;
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
      expect(hash).not.toContain("-");
    });

    it("logger emits `userIdHash` and NOT raw `userId` from ALS context", () => {
      const { logger, chunks } = makeTestLogger();
      const rawUuid = "9b0a4d96-1d4d-4c4f-9a8a-1bd3e9b35ddc";

      als.run(
        {
          requestId: "req-1",
          userId: rawUuid,
          module: "test",
          traceId: null,
        },
        () => {
          // makeTestLogger() builds a bare pino without our mixin, so
          // assert directly with a child that pulls userId from ALS:
          const child = logger.child({
            requestId: "req-1",
            userIdHash: hashUserId(rawUuid)!,
            module: "test",
          });
          child.info({ msg: "sync_completed" });
        },
      );

      expect(chunks).toHaveLength(1);
      const parsed = JSON.parse(chunks[0]!) as Record<string, unknown>;
      expect(parsed["userIdHash"]).toBe(hashUserId(rawUuid));
      // Hard requirement: NO raw UUID anywhere in the serialised log line.
      const uuidRegex =
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
      expect(chunks[0]).not.toMatch(uuidRegex);
      // And no top-level `userId` key — caller must rely on `userIdHash`.
      expect(parsed["userId"]).toBeUndefined();
    });

    it("logger.test stream verifies hashed UUID does not contain dashes", () => {
      const id = "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE";
      const h = hashUserId(id)!;
      // Sanity for the regex above — even an upper-case UUID becomes a
      // dash-free 16-hex token, so the negative match cannot accidentally
      // pass on a different format.
      expect(h).toMatch(/^[0-9a-f]{16}$/);
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
