import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  enableDebugWindowMock,
  disableDebugWindowMock,
  debugWindowRemainingMsMock,
  currentLogLevelMock,
} = vi.hoisted(() => ({
  enableDebugWindowMock: vi.fn(),
  disableDebugWindowMock: vi.fn(),
  debugWindowRemainingMsMock: vi.fn(),
  currentLogLevelMock: vi.fn(),
}));

vi.mock("../../obs/logger.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../obs/logger.js")>();
  return {
    ...actual,
    enableDebugWindow: enableDebugWindowMock,
    disableDebugWindow: disableDebugWindowMock,
    debugWindowRemainingMs: debugWindowRemainingMsMock,
    currentLogLevel: currentLogLevelMock,
  };
});

async function makeApp(): Promise<express.Express> {
  const { createDebugWindowInternalRouter } = await import("./debug-window.js");
  const app = express();
  app.use(express.json());
  app.use(createDebugWindowInternalRouter());
  return app;
}

describe("createDebugWindowInternalRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    debugWindowRemainingMsMock.mockReturnValue(123_000);
    currentLogLevelMock.mockReturnValue("info");
  });

  it("enables the default 15-minute window for invalid body values", async () => {
    const app = await makeApp();

    const res = await request(app)
      .post("/api/internal/debug-window/enable")
      .send({ durationMs: -1, requestedBy: "" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, remainingMs: 123_000 });
    expect(enableDebugWindowMock).toHaveBeenCalledWith(15 * 60_000, "openclaw");
  });

  it("enables a caller-specified positive window", async () => {
    const app = await makeApp();

    const res = await request(app)
      .post("/api/internal/debug-window/enable")
      .send({ durationMs: 60_000, requestedBy: "ops" });

    expect(res.status).toBe(200);
    expect(enableDebugWindowMock).toHaveBeenCalledWith(60_000, "ops");
  });

  it("disables the active window", async () => {
    const app = await makeApp();

    const res = await request(app)
      .post("/api/internal/debug-window/disable")
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(disableDebugWindowMock).toHaveBeenCalledTimes(1);
  });

  it("reports current log level and remaining duration", async () => {
    currentLogLevelMock.mockReturnValueOnce("debug");
    debugWindowRemainingMsMock.mockReturnValueOnce(59_000);
    const app = await makeApp();

    const res = await request(app).get("/api/internal/debug-window/status");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ level: "debug", remainingMs: 59_000 });
  });
});
