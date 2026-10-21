import { createHash } from "node:crypto";
import type { Request } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { loggerMock, observeMock, incrementMock, securityEventMock } =
  vi.hoisted(() => ({
    loggerMock: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn(),
    },
    observeMock: vi.fn(),
    incrementMock: vi.fn(),
    securityEventMock: vi.fn(),
  }));

vi.mock("./db.js", () => {
  const pool = { query: vi.fn(), connect: vi.fn(), on: vi.fn() };
  return { default: pool, pool, query: pool.query, ensureSchema: vi.fn() };
});
vi.mock("./obs/logger.js", () => ({ logger: loggerMock }));
vi.mock("./obs/metrics.js", () => ({
  authAttemptsTotal: { inc: incrementMock },
  authSessionLookupDurationMs: { observe: observeMock },
}));
vi.mock("./obs/securityEvents.js", () => ({
  emitSecurityEvent: securityEventMock,
}));

const { auth, getSessionUser, getFreshSessionUser } = await import("./auth.js");

function request(headers: Record<string, string> = {}, ip = "203.0.113.10") {
  return { headers, ip } as unknown as Request;
}

describe("session resolution", () => {
  let lookup: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    lookup = vi.spyOn(auth.api, "getSession");
    loggerMock.warn.mockClear();
    observeMock.mockClear();
    incrementMock.mockClear();
    securityEventMock.mockClear();
  });

  afterEach(() => {
    lookup.mockRestore();
  });

  it("returns no user for an absent session and records a miss", async () => {
    lookup.mockResolvedValueOnce(null);

    await expect(
      getSessionUser(request({ cookie: "session=expired" })),
    ).resolves.toBeNull();
    expect(lookup).toHaveBeenCalledWith(
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect(lookup.mock.calls[0]?.[0].headers.get("cookie")).toBe(
      "session=expired",
    );
    expect(incrementMock).toHaveBeenCalledWith({
      op: "session_check",
      outcome: "miss",
    });
    expect(observeMock).toHaveBeenCalledWith(
      { outcome: "miss" },
      expect.any(Number),
    );
  });

  it("returns a user and does not report drift when fingerprint matches", async () => {
    const user = { id: "user-1", email: "user@example.com" };
    lookup.mockResolvedValueOnce({
      user,
      session: {
        id: "session-1",
        userAgent: "browser A",
        ipAddress: "203.0.113.10",
      },
    } as never);

    await expect(
      getSessionUser(request({ "user-agent": "browser A" })),
    ).resolves.toEqual(user);
    expect(loggerMock.warn).not.toHaveBeenCalled();
    expect(securityEventMock).not.toHaveBeenCalled();
    expect(incrementMock).toHaveBeenCalledWith({
      op: "session_check",
      outcome: "hit",
    });
  });

  it("requests fresh session state for security-sensitive actions", async () => {
    lookup.mockResolvedValueOnce(null);

    await expect(getFreshSessionUser(request())).resolves.toBeNull();
    expect(lookup).toHaveBeenCalledWith(
      expect.objectContaining({ query: { disableCookieCache: true } }),
    );
    expect(incrementMock).toHaveBeenCalledWith({
      op: "session_check",
      outcome: "miss",
    });
  });

  it("warns on fingerprint drift without rejecting the session or logging raw identifiers", async () => {
    const user = { id: "private-user-id" };
    lookup.mockResolvedValueOnce({
      user,
      session: {
        id: "private-session-id",
        userAgent: "old browser",
        ipAddress: "203.0.113.10",
      },
    } as never);

    await expect(
      getSessionUser(request({ "user-agent": "new browser" }, "198.51.100.7")),
    ).resolves.toEqual(user);
    const [fields] = loggerMock.warn.mock.calls[0] as [Record<string, unknown>];
    expect(fields).toMatchObject({
      event: "auth.session.ua_drift",
      ua_changed: true,
      ip_changed: true,
      session_id_hash: createHash("sha256")
        .update("private-session-id")
        .digest("hex")
        .slice(0, 16),
    });
    expect(fields).not.toHaveProperty("session_id");
    expect(securityEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "auth_session_ua_drift",
        severity: "medium",
        userIdHash: createHash("sha256")
          .update(user.id)
          .digest("hex")
          .slice(0, 16),
      }),
    );
  });

  it("propagates lookup errors and records an error outcome", async () => {
    const failure = new Error("session store unavailable");
    lookup.mockRejectedValueOnce(failure);

    await expect(getSessionUser(request())).rejects.toBe(failure);
    expect(incrementMock).toHaveBeenCalledWith({
      op: "session_check",
      outcome: "error",
    });
    expect(observeMock).toHaveBeenCalledWith(
      { outcome: "error" },
      expect.any(Number),
    );
  });

  it("continues auth when metrics fail", async () => {
    lookup.mockResolvedValueOnce(null);
    observeMock.mockImplementationOnce(() => {
      throw new Error("metrics unavailable");
    });

    await expect(getSessionUser(request())).resolves.toBeNull();
  });
});
