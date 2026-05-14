import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Module-load testing strategy (P2-1 з 2026-05-13-backend-performance-roast):
 *
 * `push.ts` reads `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_EMAIL` /
 * `NODE_ENV` once at module-load via the zod-validated `env` singleton
 * (а не raw `process.env[...]`-reads). Тому, щоб перевірити різні
 * комбінації (зчитуючи `vapidReady`, `vapidPublic`, `subscribe`,
 * `sendPush`), треба пере-impport-ити обидва модулі (`push.ts` і
 * `env/env.ts`) на свіжих env-значеннях.
 *
 * Canonical pattern — той самий, що в `apps/server/src/auth.test.ts`:
 *   1. `vi.resetModules()` — скинути ESM-кеш.
 *   2. `vi.stubEnv(name, value)` — поставити потрібні env-и (стиль, який
 *      Vitest офіційно підтримує; ефект скасовується `vi.unstubAllEnvs()`).
 *   3. `await import("./push.js")` — динамічний імпорт після стабу.
 *   4. У `finally` / `afterEach` — `vi.unstubAllEnvs()` + `vi.resetModules()`.
 *
 * Без цього паттерну тести проходили б на старому env-cached синглтоні
 * (особливо коли в одному файлі по 5+ комбінацій env-варів).
 */

// Mock logger so we can assert the "vapid_email_missing" log in prod without
// noise, and so the import below does not try to reach pino sinks.
const loggerMock = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  fatal: vi.fn(),
};
vi.mock("../../obs/logger.js", async () => {
  const actual = await vi.importActual("../../obs/logger.js");
  return { ...actual, logger: loggerMock };
});

// `push.ts` imports web-push/pg/etc at module scope. We don't exercise those
// here — just resolveVapidEmail — but the imports still need to succeed.
vi.mock("web-push", () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() },
}));
vi.mock("../../db.js", () => ({ default: { query: vi.fn() } }));
vi.mock("../../lib/webpushSend.js", () => ({ sendWebPush: vi.fn() }));

describe("resolveVapidEmail", () => {
  beforeEach(() => {
    vi.resetModules();
    loggerMock.error.mockReset();
    // Clear any env-state from a previous test in this file.
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns the env value verbatim when it already has a mailto: prefix", async () => {
    vi.stubEnv("VAPID_EMAIL", "mailto:admin@example.org");
    const { resolveVapidEmail } = await import("./push.js");
    expect(resolveVapidEmail()).toBe("mailto:admin@example.org");
    expect(loggerMock.error).not.toHaveBeenCalled();
  });

  it("prepends mailto: when the env value is a bare address", async () => {
    vi.stubEnv("VAPID_EMAIL", "admin@example.org");
    const { resolveVapidEmail } = await import("./push.js");
    expect(resolveVapidEmail()).toBe("mailto:admin@example.org");
  });

  it("trims surrounding whitespace on the env value", async () => {
    vi.stubEnv("VAPID_EMAIL", "  mailto:admin@example.org  ");
    const { resolveVapidEmail } = await import("./push.js");
    expect(resolveVapidEmail()).toBe("mailto:admin@example.org");
  });

  it("returns null and logs an error in production when unset", async () => {
    vi.stubEnv("VAPID_EMAIL", "");
    vi.stubEnv("NODE_ENV", "production");
    const { resolveVapidEmail } = await import("./push.js");
    // `push.ts` calls `resolveVapidEmail()` once at module-load (to derive
    // `vapidReady`), so reset the mock here to isolate the explicit
    // invocation below — pre-P2-1 this implicit call did not exist because
    // module-load read `process.env["NODE_ENV"]` cold and the test stubbed
    // it AFTER. Now the env singleton freezes at import time.
    loggerMock.error.mockReset();
    expect(resolveVapidEmail()).toBeNull();
    expect(loggerMock.error).toHaveBeenCalledTimes(1);
    expect(loggerMock!.error.mock.calls[0]![0]).toMatchObject({
      msg: "vapid_email_missing",
    });
  });

  it("returns null in production when VAPID_EMAIL is blank whitespace", async () => {
    vi.stubEnv("VAPID_EMAIL", "   ");
    vi.stubEnv("NODE_ENV", "production");
    const { resolveVapidEmail } = await import("./push.js");
    expect(resolveVapidEmail()).toBeNull();
    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.objectContaining({ msg: "vapid_email_missing" }),
    );
  });

  it("falls back to the dev placeholder outside production", async () => {
    vi.stubEnv("VAPID_EMAIL", "");
    vi.stubEnv("NODE_ENV", "development");
    const { resolveVapidEmail } = await import("./push.js");
    expect(resolveVapidEmail()).toBe("mailto:admin@example.com");
    expect(loggerMock.error).not.toHaveBeenCalled();
  });

  it("uses the placeholder in test environments too", async () => {
    vi.stubEnv("VAPID_EMAIL", "");
    vi.stubEnv("NODE_ENV", "test");
    const { resolveVapidEmail } = await import("./push.js");
    expect(resolveVapidEmail()).toBe("mailto:admin@example.com");
  });
});

describe("push handler VAPID readiness gating", () => {
  beforeEach(() => {
    vi.resetModules();
    loggerMock.error.mockReset();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  function makeRes() {
    return {
      statusCode: 200,
      body: null as unknown,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(obj: unknown) {
        this.body = obj;
        return this;
      },
    };
  }

  it("vapidPublic returns 503 in production when VAPID_EMAIL is missing", async () => {
    // Regression: before this gate only checked VAPID_PUBLIC, so the
    // endpoint happily returned the public key while `setVapidDetails`
    // was silently skipped — all later sends would throw.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VAPID_PUBLIC_KEY", "BPUB");
    vi.stubEnv("VAPID_PRIVATE_KEY", "BPRIV");
    vi.stubEnv("VAPID_EMAIL", "");

    const { vapidPublic } = await import("./push.js");
    const res = makeRes();
    await vapidPublic({} as never, res as never);

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: "Push not configured" });
  });

  it("subscribe returns 503 in production when VAPID_EMAIL is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VAPID_PUBLIC_KEY", "BPUB");
    vi.stubEnv("VAPID_PRIVATE_KEY", "BPRIV");
    vi.stubEnv("VAPID_EMAIL", "");

    const { subscribe } = await import("./push.js");
    const res = makeRes();
    await subscribe({ body: {} } as never, res as never);
    expect(res.statusCode).toBe(503);
  });

  it("sendPush returns 503 in production when VAPID_EMAIL is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VAPID_PUBLIC_KEY", "BPUB");
    vi.stubEnv("VAPID_PRIVATE_KEY", "BPRIV");
    vi.stubEnv("VAPID_EMAIL", "");

    const { sendPush } = await import("./push.js");
    const res = makeRes();
    await sendPush({ body: {} } as never, res as never);
    expect(res.statusCode).toBe(503);
  });

  it("vapidPublic returns the key when all three VAPID pieces are set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VAPID_PUBLIC_KEY", "BPUB");
    vi.stubEnv("VAPID_PRIVATE_KEY", "BPRIV");
    vi.stubEnv("VAPID_EMAIL", "mailto:admin@example.org");

    const { vapidPublic } = await import("./push.js");
    const res = makeRes();
    await vapidPublic({} as never, res as never);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ publicKey: "BPUB" });
  });

  // Happy path — додано в P2-1 разом із міграцією на `env.ts`. Перевіряє,
  // що `subscribe` пропускає gate-перевірку коли усі VAPID-поля задані
  // (а не падає 503), і що endpoint-handler дочитується до `validateBody`.
  it("subscribe passes the vapid gate when all three keys are set (proceeds to body validation)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VAPID_PUBLIC_KEY", "BPUB");
    vi.stubEnv("VAPID_PRIVATE_KEY", "BPRIV");
    vi.stubEnv("VAPID_EMAIL", "mailto:admin@example.org");

    const { subscribe } = await import("./push.js");
    const res = makeRes();
    // Порожнє body завалить `validateBody` → 400, але ВАЖЛИВО для цього
    // тесту лише те, що gate-503 не виставився: код != 503.
    await subscribe(
      { body: {}, user: { id: "u_test" } } as never,
      res as never,
    );
    expect(res.statusCode).not.toBe(503);
  });

  // Edge case — додано в P2-1: `env.VAPID_EMAIL` отримує whitespace.
  // Без `.trim()` у `resolveVapidEmail()` ми б імпортували `vapidReady=true`
  // (бо рядок truthy), і `setVapidDetails` падав би в run-time на mailto:
  // " ". Перевіряємо, що pipeline зважає whitespace-only як «не задано».
  it("treats whitespace-only VAPID_EMAIL as missing in production (vapidReady=false)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VAPID_PUBLIC_KEY", "BPUB");
    vi.stubEnv("VAPID_PRIVATE_KEY", "BPRIV");
    vi.stubEnv("VAPID_EMAIL", "    ");

    const { vapidPublic } = await import("./push.js");
    const res = makeRes();
    await vapidPublic({} as never, res as never);
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: "Push not configured" });
  });
});

// ── P2-1: env-routed configuration (regression coverage) ──────────────────
//
// Раніше push.ts читав `process.env[...]` напряму при module-load, що
// обходило zod-валідацію в `env.ts`. Тут перевіряємо, що валідовані поля
// `PUSH_SEND_TARGET_LIMIT` / `PUSH_SEND_TARGET_WINDOW_MS` / `VAPID_*`
// доступні з `env`-singleton-у і мають правильні defaults.
describe("env.ts — push-related fields (P2-1 migration)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("PUSH_SEND_TARGET_LIMIT defaults to 10 when env var is unset", async () => {
    vi.stubEnv("PUSH_SEND_TARGET_LIMIT", "");
    const { env } = await import("../../env/env.js");
    expect(env.PUSH_SEND_TARGET_LIMIT).toBe(10);
  });

  it("PUSH_SEND_TARGET_LIMIT accepts a positive integer override", async () => {
    vi.stubEnv("PUSH_SEND_TARGET_LIMIT", "42");
    const { env } = await import("../../env/env.js");
    expect(env.PUSH_SEND_TARGET_LIMIT).toBe(42);
  });

  // Edge: бек-сумісність із legacy-IIFE → silent fallback на default
  // замість fail-fast. CI / Railway інколи отримує `0` як «вимкнути»
  // (помилково) — ми зберігаємо стару поведінку, щоб не зламати ops.
  it("PUSH_SEND_TARGET_LIMIT silently falls back on non-positive / NaN input", async () => {
    for (const bad of ["0", "-5", "abc", "  "]) {
      vi.resetModules();
      vi.stubEnv("PUSH_SEND_TARGET_LIMIT", bad);
      const { env } = await import("../../env/env.js");
      expect(env.PUSH_SEND_TARGET_LIMIT).toBe(10);
    }
  });

  it("PUSH_SEND_TARGET_WINDOW_MS defaults to 60_000 when env var is unset", async () => {
    vi.stubEnv("PUSH_SEND_TARGET_WINDOW_MS", "");
    const { env } = await import("../../env/env.js");
    expect(env.PUSH_SEND_TARGET_WINDOW_MS).toBe(60_000);
  });

  it("PUSH_INTERNAL_ALLOWED_IPS defaults to empty string", async () => {
    vi.stubEnv("PUSH_INTERNAL_ALLOWED_IPS", "");
    const { env } = await import("../../env/env.js");
    expect(env.PUSH_INTERNAL_ALLOWED_IPS).toBe("");
  });

  it("PUSH_INTERNAL_ALLOWED_IPS round-trips a CIDR allowlist verbatim", async () => {
    vi.stubEnv("PUSH_INTERNAL_ALLOWED_IPS", "100.64.0.0/10,10.0.0.5");
    const { env } = await import("../../env/env.js");
    expect(env.PUSH_INTERNAL_ALLOWED_IPS).toBe("100.64.0.0/10,10.0.0.5");
  });
});
