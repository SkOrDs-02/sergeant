// `/api/sync/audit` auth ordering.
// The read-only audit log is the only surviving `/api/sync/*` (v1) route
// after the CloudSync v1 push/pull endpoints were removed (Initiative 0003
// Phase 7). It stays behind `requireSession()` and must return 401 for
// unauthenticated requests.

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
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
  };
});

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

describe("createSyncRouter — /api/sync/audit auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/sync/audit returns 401 for unauthenticated requests (auth-protected)", async () => {
    const res = await request(mkApp()).get("/api/sync/audit");
    expect(res.status).toBe(401);
  });

  // After Phase 7 removed the v1 410-stubs, the old push/pull paths no longer
  // have a dedicated handler. `requireSession()` is mounted as `.use` on the
  // whole `/api/sync` prefix, so unauthenticated hits now get 401 (not the
  // former 410 Gone, and not a raw 404) — no sunset payload is emitted.
  it("POST /api/sync/push no longer returns 410 for unauthenticated requests", async () => {
    const res = await request(mkApp())
      .post("/api/sync/push")
      .send({ payload: "anything" });
    expect(res.status).not.toBe(410);
    expect(res.status).toBe(401);
  });
});
