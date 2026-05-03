/**
 * Route-level coverage for `/api/internal/openclaw/*` — focused on the
 * Wave-1 §3.3 follow-up: `write-audit/list` now accepts `recordedAfterIso`
 * and forwards it to the store as a `Date`. The rest of the openclaw
 * router is exercised by the registerRoutes snapshot, so we only need
 * to pin down the schema-validation + store-call wiring here.
 *
 * We deliberately mock the store-layer functions (not pool.query) so the
 * test stays fast and doesn't have to mirror raw SQL — the store layer
 * has its own dedicated unit tests in `modules/openclaw/store.test.ts`.
 */
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  listRecentWriteAuditsMock,
  recordWriteAuditMock,
  listRecentInvocationsMock,
} = vi.hoisted(() => ({
  listRecentWriteAuditsMock: vi.fn(),
  recordWriteAuditMock: vi.fn(),
  listRecentInvocationsMock: vi.fn(),
}));

vi.mock("../../modules/openclaw/index.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../modules/openclaw/index.js")>();
  return {
    ...actual,
    listRecentWriteAudits: listRecentWriteAuditsMock,
    recordWriteAudit: recordWriteAuditMock,
    listRecentInvocations: listRecentInvocationsMock,
  };
});

async function makeApp() {
  const { createOpenClawInternalRouter } = await import("./openclaw.js");
  const app = express();
  app.use(express.json());
  // We mount the openclaw router directly (no bearer-token guard) so
  // these tests stay focused on schema + store wiring; the auth middleware
  // is exercised by `routes/internal.test.ts`.
  app.use(
    createOpenClawInternalRouter({
      pool: { query: vi.fn().mockResolvedValue({ rows: [] }) } as never,
    }),
  );
  return app;
}

describe("/api/internal/openclaw/write-audit/list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listRecentWriteAuditsMock.mockResolvedValue([]);
    recordWriteAuditMock.mockResolvedValue(1);
    listRecentInvocationsMock.mockResolvedValue([]);
  });

  it("forwards filters to the store without a recordedAfter when omitted", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/write-audit/list")
      .send({ founderUserId: "f_1", limit: 20, tool: "pause_workflow" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ audits: [] });
    expect(listRecentWriteAuditsMock).toHaveBeenCalledTimes(1);
    const arg = listRecentWriteAuditsMock.mock.calls[0]?.[1];
    expect(arg).toEqual({
      founderUserId: "f_1",
      limit: 20,
      tool: "pause_workflow",
      action: undefined,
      persona: undefined,
      recordedAfter: undefined,
    });
  });

  it("parses recordedAfterIso into a Date before forwarding to the store", async () => {
    const app = await makeApp();
    const iso = "2026-04-26T12:00:00.000Z";
    const res = await request(app)
      .post("/api/internal/openclaw/write-audit/list")
      .send({ founderUserId: "f_1", limit: 100, recordedAfterIso: iso });

    expect(res.status).toBe(200);
    const arg = listRecentWriteAuditsMock.mock.calls[0]?.[1];
    expect(arg?.recordedAfter).toBeInstanceOf(Date);
    expect((arg?.recordedAfter as Date).toISOString()).toBe(iso);
  });

  it("rejects malformed recordedAfterIso with 400 (Zod schema)", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/write-audit/list")
      .send({ founderUserId: "f_1", recordedAfterIso: "yesterday" });

    expect(res.status).toBe(400);
    expect(listRecentWriteAuditsMock).not.toHaveBeenCalled();
  });

  it("returns audits payload from the store", async () => {
    listRecentWriteAuditsMock.mockResolvedValueOnce([
      {
        id: 7,
        recorded_at: "2026-04-30T10:00:00.000Z",
        approval_id: "ap_42",
        tool: "pause_workflow",
        founder_user_id: "f_1",
        founder_tg_user_id: 999,
        invocation_id: null,
        action: "executed",
        input: {},
        http_status: 200,
        ok: true,
        response_excerpt: null,
        persona: "ops",
        metadata: {},
      },
    ]);
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/write-audit/list")
      .send({ founderUserId: "f_1" });

    expect(res.status).toBe(200);
    expect(res.body.audits).toHaveLength(1);
    expect(res.body.audits[0].approval_id).toBe("ap_42");
  });
});
