import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
  const originalEnv = { ...process.env };

  beforeEach(() => {
    loggerMock.error.mockReset();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns the env value verbatim when it already has a mailto: prefix", async () => {
    process.env["VAPID_EMAIL"] = "mailto:admin@example.org";
    const { resolveVapidEmail } = await import("./push.js");
    expect(resolveVapidEmail()).toBe("mailto:admin@example.org");
    expect(loggerMock.error).not.toHaveBeenCalled();
  });

  it("prepends mailto: when the env value is a bare address", async () => {
    process.env["VAPID_EMAIL"] = "admin@example.org";
    const { resolveVapidEmail } = await import("./push.js");
    expect(resolveVapidEmail()).toBe("mailto:admin@example.org");
  });

  it("trims surrounding whitespace on the env value", async () => {
    process.env["VAPID_EMAIL"] = "  mailto:admin@example.org  ";
    const { resolveVapidEmail } = await import("./push.js");
    expect(resolveVapidEmail()).toBe("mailto:admin@example.org");
  });

  it("returns null and logs an error in production when unset", async () => {
    delete process.env["VAPID_EMAIL"];
    process.env["NODE_ENV"] = "production";
    const { resolveVapidEmail } = await import("./push.js");
    expect(resolveVapidEmail()).toBeNull();
    expect(loggerMock.error).toHaveBeenCalledTimes(1);
    expect(loggerMock!.error.mock.calls[0]![0]).toMatchObject({
      msg: "vapid_email_missing",
    });
  });

  it("returns null in production when VAPID_EMAIL is blank whitespace", async () => {
    process.env["VAPID_EMAIL"] = "   ";
    process.env["NODE_ENV"] = "production";
    const { resolveVapidEmail } = await import("./push.js");
    expect(resolveVapidEmail()).toBeNull();
    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.objectContaining({ msg: "vapid_email_missing" }),
    );
  });

  it("falls back to the dev placeholder outside production", async () => {
    delete process.env["VAPID_EMAIL"];
    process.env["NODE_ENV"] = "development";
    const { resolveVapidEmail } = await import("./push.js");
    expect(resolveVapidEmail()).toBe("mailto:admin@example.com");
    expect(loggerMock.error).not.toHaveBeenCalled();
  });

  it("uses the placeholder in test environments too", async () => {
    delete process.env["VAPID_EMAIL"];
    process.env["NODE_ENV"] = "test";
    const { resolveVapidEmail } = await import("./push.js");
    expect(resolveVapidEmail()).toBe("mailto:admin@example.com");
  });
});

describe("push handler VAPID readiness gating", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    loggerMock.error.mockReset();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
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
    process.env["NODE_ENV"] = "production";
    process.env["VAPID_PUBLIC_KEY"] = "BPUB";
    process.env["VAPID_PRIVATE_KEY"] = "BPRIV";
    delete process.env["VAPID_EMAIL"];

    const { vapidPublic } = await import("./push.js");
    const res = makeRes();
    await vapidPublic({} as never, res as never);

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: "Push not configured" });
  });

  it("subscribe returns 503 in production when VAPID_EMAIL is missing", async () => {
    process.env["NODE_ENV"] = "production";
    process.env["VAPID_PUBLIC_KEY"] = "BPUB";
    process.env["VAPID_PRIVATE_KEY"] = "BPRIV";
    delete process.env["VAPID_EMAIL"];

    const { subscribe } = await import("./push.js");
    const res = makeRes();
    await subscribe({ body: {} } as never, res as never);
    expect(res.statusCode).toBe(503);
  });

  it("sendPush returns 503 in production when VAPID_EMAIL is missing", async () => {
    process.env["NODE_ENV"] = "production";
    process.env["VAPID_PUBLIC_KEY"] = "BPUB";
    process.env["VAPID_PRIVATE_KEY"] = "BPRIV";
    delete process.env["VAPID_EMAIL"];

    const { sendPush } = await import("./push.js");
    const res = makeRes();
    await sendPush({ body: {} } as never, res as never);
    expect(res.statusCode).toBe(503);
  });

  it("vapidPublic returns the key when all three VAPID pieces are set", async () => {
    process.env["NODE_ENV"] = "production";
    process.env["VAPID_PUBLIC_KEY"] = "BPUB";
    process.env["VAPID_PRIVATE_KEY"] = "BPRIV";
    process.env["VAPID_EMAIL"] = "mailto:admin@example.org";

    const { vapidPublic } = await import("./push.js");
    const res = makeRes();
    await vapidPublic({} as never, res as never);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ publicKey: "BPUB" });
  });
});
