// T2 audit finding #7 — v1 sync 410-stub ordering.
// The whole point of RFC 8594 Sunset / RFC 8288 Link headers is for
// legacy clients (mobile builds with expired sessions, anonymous probes)
// to discover "stop calling permanently" without first authenticating.
// Before the ordering fix, `requireSession()` ran BEFORE the 410-stubs
// and returned 401 to unauth-ed clients — they kept retrying forever.
//
// These tests assert the public-410 contract via supertest. We mock the
// rate-limit + session-survey middleware to no-ops so the assertions
// focus purely on the auth-vs-410 ordering.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../obs/logger.js", async () => {
  const actual = await vi.importActual("../obs/logger.js");
  return {
    ...actual,
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
    },
  };
});

vi.mock("../http/index.js", async () => {
  const actual =
    await vi.importActual<Record<string, unknown>>("../http/index.js");
  return {
    ...actual,
    setModule: () => (_req: unknown, _res: unknown, next: () => void) => next(),
    rateLimitExpress: () => (_req: unknown, _res: unknown, next: () => void) =>
      next(),
    // Default `requireSession()` stub for unauth case — 401 just like
    // the real middleware. Individual tests override per-route as needed.
    requireSession:
      () =>
      (
        _req: unknown,
        res: {
          status: (n: number) => { json: (b: unknown) => void };
        },
        _next: () => void,
      ) =>
        res.status(401).json({ error: "Unauthorized" }),
    asyncHandler: (fn: (...args: unknown[]) => unknown) => fn,
  };
});

vi.mock("../modules/sync/clientSurvey.js", () => ({
  v1ClientSurveyMiddleware:
    () => (_req: unknown, _res: unknown, next: () => void) =>
      next(),
}));

vi.mock("../modules/sync/sunsetHeaders.js", () => ({
  v1SunsetHeadersMiddleware:
    () => (_req: unknown, _res: unknown, next: () => void) =>
      next(),
}));

vi.mock("../modules/sync/syncV2.js", () => ({
  syncV2Push: () => undefined,
  syncV2Pull: () => undefined,
}));

vi.mock("../modules/sync/syncV2Stream.js", () => ({
  syncV2Stream: () => undefined,
}));

vi.mock("../modules/sync/audit.js", () => ({
  listSyncAudit: () => undefined,
}));

import { createSyncRouter } from "./sync.js";

function mkApp() {
  const app = express();
  app.use(express.json());
  app.use(createSyncRouter());
  return app;
}

describe("createSyncRouter — v1 410 ordering (T2 audit #7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("POST /api/sync/push returns 410 for unauthenticated requests (NOT 401)", async () => {
    const res = await request(mkApp())
      .post("/api/sync/push")
      .send({ payload: "anything" });
    expect(res.status).toBe(410);
    expect(res.body).toMatchObject({
      error: "cloudsync_v1_sunset",
      successor: "/api/v2/sync",
    });
  });

  it("POST /api/sync/pull returns 410 for unauthenticated requests", async () => {
    const res = await request(mkApp()).post("/api/sync/pull");
    expect(res.status).toBe(410);
  });

  it("GET /api/sync/pull-all returns 410 for unauthenticated requests", async () => {
    const res = await request(mkApp()).get("/api/sync/pull-all");
    expect(res.status).toBe(410);
  });

  it("POST /api/sync/pull-all returns 410 for unauthenticated requests", async () => {
    const res = await request(mkApp()).post("/api/sync/pull-all");
    expect(res.status).toBe(410);
  });

  it("POST /api/sync/push-all returns 410 for unauthenticated requests", async () => {
    const res = await request(mkApp()).post("/api/sync/push-all");
    expect(res.status).toBe(410);
  });

  it("GET /api/sync/audit STILL returns 401 for unauthenticated requests (auth-protected)", async () => {
    const res = await request(mkApp()).get("/api/sync/audit");
    expect(res.status).toBe(401);
  });
});
