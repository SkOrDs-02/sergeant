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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  listRecentWriteAuditsMock,
  recordWriteAuditMock,
  listRecentInvocationsMock,
  listN8nWorkflowsMock,
  describeN8nWorkflowMock,
  triggerN8nWorkflowMock,
  activateN8nWorkflowMock,
  refreshBusinessSnapshotMock,
  classifyMessageMock,
} = vi.hoisted(() => ({
  listRecentWriteAuditsMock: vi.fn(),
  recordWriteAuditMock: vi.fn(),
  listRecentInvocationsMock: vi.fn(),
  listN8nWorkflowsMock: vi.fn(),
  describeN8nWorkflowMock: vi.fn(),
  triggerN8nWorkflowMock: vi.fn(),
  activateN8nWorkflowMock: vi.fn(),
  refreshBusinessSnapshotMock: vi.fn(),
  classifyMessageMock: vi.fn(),
}));

vi.mock("../../modules/openclaw/index.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../modules/openclaw/index.js")>();
  return {
    ...actual,
    listRecentWriteAudits: listRecentWriteAuditsMock,
    recordWriteAudit: recordWriteAuditMock,
    listRecentInvocations: listRecentInvocationsMock,
    listN8nWorkflows: listN8nWorkflowsMock,
    describeN8nWorkflow: describeN8nWorkflowMock,
    triggerN8nWorkflow: triggerN8nWorkflowMock,
    activateN8nWorkflow: activateN8nWorkflowMock,
    refreshBusinessSnapshot: refreshBusinessSnapshotMock,
    classifyMessage: classifyMessageMock,
  };
});

async function makeApp(
  queryMock = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
) {
  const { createOpenClawInternalRouter } = await import("./openclaw.js");
  const app = express();
  app.use(express.json());
  // We mount the openclaw router directly (no bearer-token guard) so
  // these tests stay focused on schema + store wiring; the auth middleware
  // is exercised by `routes/internal.test.ts`.
  app.use(
    createOpenClawInternalRouter({
      pool: { query: queryMock } as never,
    }),
  );
  return app;
}

describe("/api/internal/openclaw/query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns rows for a valid allowlisted SELECT", async () => {
    const queryMock = vi.fn().mockResolvedValue({
      rows: [{ id: "u_1" }],
      rowCount: 1,
    });
    const app = await makeApp(queryMock);
    const res = await request(app)
      .post("/api/internal/openclaw/query")
      .send({ sql: "SELECT id FROM users", limit: 20 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      rowCount: 1,
      rows: [{ id: "u_1" }],
      tablesUsed: ["users"],
    });
  });

  it("keeps allowlist failures as 400 allowlist_fail", async () => {
    const queryMock = vi.fn();
    const app = await makeApp(queryMock);
    const res = await request(app)
      .post("/api/internal/openclaw/query")
      .send({ sql: "SELECT * FROM auth_secret" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("allowlist_fail");
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("maps Postgres schema errors to 400 schema_error", async () => {
    const queryMock = vi.fn().mockRejectedValue(
      Object.assign(new Error('column "created_at" does not exist'), {
        code: "42703",
      }),
    );
    const app = await makeApp(queryMock);
    const res = await request(app).post("/api/internal/openclaw/query").send({
      sql: "SELECT * FROM openclaw_invocations ORDER BY created_at DESC",
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: "schema_error",
      message: expect.stringContaining('column "created_at" does not exist'),
    });
  });
});

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

// ─────────────────────────────────────────────────────────────────────────
// PR-C1c — n8n delegation surface + snapshot/refresh meta-tool
// ─────────────────────────────────────────────────────────────────────────

describe("/api/internal/openclaw/n8n/*", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("/list forwards tiers + limit to listN8nWorkflows", async () => {
    listN8nWorkflowsMock.mockResolvedValueOnce({
      workflows: [
        {
          id: "WF_A1",
          name: "63 — Growth Acquisition Snapshot",
          active: true,
          tier: "A",
          category: "growth",
          updatedAt: null,
        },
      ],
    });
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/n8n/list")
      .send({ tiers: ["A", "C"], limit: 50 });

    expect(res.status).toBe(200);
    expect(res.body.workflows).toHaveLength(1);
    expect(listN8nWorkflowsMock).toHaveBeenCalledWith({
      tiers: ["A", "C"],
      limit: 50,
    });
  });

  it("/list rejects unknown tier values with 400 (Zod schema)", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/n8n/list")
      .send({ tiers: ["Z"] });

    expect(res.status).toBe(400);
    expect(listN8nWorkflowsMock).not.toHaveBeenCalled();
  });

  it("/describe forwards workflowId and returns body", async () => {
    describeN8nWorkflowMock.mockResolvedValueOnce({
      workflowId: "WF_A1",
      name: "Growth Acq",
      active: true,
      tier: "A",
      category: "growth",
      approvalRequired: false,
      nodes: [],
      triggers: ["n8n-nodes-base.cronTrigger"],
      updatedAt: null,
    });
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/n8n/describe")
      .send({ workflowId: "WF_A1" });

    expect(res.status).toBe(200);
    expect(res.body.tier).toBe("A");
    expect(describeN8nWorkflowMock).toHaveBeenCalledWith({
      workflowId: "WF_A1",
    });
  });

  it("/trigger returns the trigger payload for an allowlisted workflow", async () => {
    triggerN8nWorkflowMock.mockResolvedValueOnce({
      status: "triggered",
      workflowId: "WF_A1",
      tier: "A",
      approvalRequired: false,
      executionId: "42",
    });
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/n8n/trigger")
      .send({ workflowId: "WF_A1" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: "triggered",
      workflowId: "WF_A1",
      tier: "A",
      approvalRequired: false,
      executionId: "42",
    });
  });

  it("/trigger maps N8nAllowlistError to 400 allowlist_fail", async () => {
    const { N8nAllowlistError } = await import("../../modules/openclaw/n8n.js");
    triggerN8nWorkflowMock.mockRejectedValueOnce(
      new N8nAllowlistError({
        workflowId: "WF_B1",
        tier: "B",
        op: "trigger",
        message: "Tier B not triggerable",
      }),
    );
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/n8n/trigger")
      .send({ workflowId: "WF_B1" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "allowlist_fail",
      op: "trigger",
      workflowId: "WF_B1",
      tier: "B",
      message: "Tier B not triggerable",
    });
  });

  it("/activate forwards active flag and returns payload", async () => {
    activateN8nWorkflowMock.mockResolvedValueOnce({
      status: "deactivated",
      workflowId: "WF_C1",
      tier: "C",
      approvalRequired: true,
    });
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/n8n/activate")
      .send({ workflowId: "WF_C1", active: false });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("deactivated");
    expect(activateN8nWorkflowMock).toHaveBeenCalledWith({
      workflowId: "WF_C1",
      active: false,
    });
  });

  it("/activate maps N8nAllowlistError to 400 allowlist_fail", async () => {
    const { N8nAllowlistError } = await import("../../modules/openclaw/n8n.js");
    activateN8nWorkflowMock.mockRejectedValueOnce(
      new N8nAllowlistError({
        workflowId: "WF_D1",
        tier: "D",
        op: "activate",
        message: "Tier D not eligible",
      }),
    );
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/n8n/activate")
      .send({ workflowId: "WF_D1", active: true });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("allowlist_fail");
    expect(res.body.op).toBe("activate");
  });

  it("/activate rejects missing `active` flag with 400 (Zod schema)", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/n8n/activate")
      .send({ workflowId: "WF_C1" });

    expect(res.status).toBe(400);
    expect(activateN8nWorkflowMock).not.toHaveBeenCalled();
  });
});

describe("/api/internal/openclaw/snapshot/refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fires every Tier A workflow when body is empty", async () => {
    refreshBusinessSnapshotMock.mockResolvedValueOnce({
      triggered: 2,
      failed: 0,
      notConfigured: false,
      durationMs: 12,
      results: [
        { workflowId: "WF_A1", name: "Growth Acq", status: "triggered" },
        { workflowId: "WF_A2", name: "Heartbeat", status: "triggered" },
      ],
    });
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/snapshot/refresh")
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.triggered).toBe(2);
    expect(refreshBusinessSnapshotMock).toHaveBeenCalledWith({
      workflowIds: undefined,
    });
  });

  it("forwards an explicit workflowIds subset", async () => {
    refreshBusinessSnapshotMock.mockResolvedValueOnce({
      triggered: 1,
      failed: 0,
      notConfigured: false,
      durationMs: 4,
      results: [
        { workflowId: "WF_A1", name: "Growth Acq", status: "triggered" },
      ],
    });
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/snapshot/refresh")
      .send({ workflowIds: ["WF_A1"] });

    expect(res.status).toBe(200);
    expect(refreshBusinessSnapshotMock).toHaveBeenCalledWith({
      workflowIds: ["WF_A1"],
    });
  });

  it("rejects unknown fields with 400 (.strict() Zod schema)", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/snapshot/refresh")
      .send({ tier: "A" });

    expect(res.status).toBe(400);
    expect(refreshBusinessSnapshotMock).not.toHaveBeenCalled();
  });
});

// PR-Stage4c: Layer 1 cheap-router classify endpoint. Route отримує
// `{ userMessage, systemPrompt? }`, кличе `classifyMessage()` (mocked тут),
// повертає classification JSON. 503 коли ANTHROPIC_API_KEY відсутній;
// 502 коли Haiku фейлить — щоб plugin escalates до Layer 2 fail-closed.
describe("/api/internal/openclaw/classify", () => {
  const originalKey = process.env["ANTHROPIC_API_KEY"];

  beforeEach(() => {
    vi.clearAllMocks();
    process.env["ANTHROPIC_API_KEY"] = "test-key";
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env["ANTHROPIC_API_KEY"];
    } else {
      process.env["ANTHROPIC_API_KEY"] = originalKey;
    }
  });

  it("returns classification JSON for a routine_metrics question", async () => {
    classifyMessageMock.mockResolvedValueOnce({
      class: "routine_metrics",
      shortcut: "metrics",
      persona: null,
      params: null,
      chat_response: null,
    });
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/classify")
      .send({ userMessage: "Як у нас з MRR?" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      class: "routine_metrics",
      shortcut: "metrics",
      persona: null,
      params: null,
      chat_response: null,
    });
    expect(classifyMessageMock).toHaveBeenCalledWith(
      { userMessage: "Як у нас з MRR?" },
      "test-key",
    );
  });

  it("forwards systemPrompt override when provided by the plugin", async () => {
    classifyMessageMock.mockResolvedValueOnce({ class: "thinking" });
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/classify")
      .send({
        userMessage: "Як спланувати релізи на квартал?",
        systemPrompt: "TEST PROMPT",
      });

    expect(res.status).toBe(200);
    expect(classifyMessageMock).toHaveBeenCalledWith(
      {
        userMessage: "Як спланувати релізи на квартал?",
        systemPrompt: "TEST PROMPT",
      },
      "test-key",
    );
  });

  it("returns 503 when ANTHROPIC_API_KEY is not configured", async () => {
    delete process.env["ANTHROPIC_API_KEY"];
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/classify")
      .send({ userMessage: "Привіт" });

    expect(res.status).toBe(503);
    expect(classifyMessageMock).not.toHaveBeenCalled();
  });

  it("returns 502 when the classifier throws (Haiku upstream error)", async () => {
    classifyMessageMock.mockRejectedValueOnce(new Error("upstream 503"));
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/classify")
      .send({ userMessage: "тест" });

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: "classify_upstream_error" });
  });

  it("rejects empty userMessage with 400 (Zod min(1))", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/classify")
      .send({ userMessage: "" });

    expect(res.status).toBe(400);
    expect(classifyMessageMock).not.toHaveBeenCalled();
  });

  it("rejects unknown fields with 400 (.strict() schema)", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/classify")
      .send({ userMessage: "hi", maxTokens: 200 });

    expect(res.status).toBe(400);
    expect(classifyMessageMock).not.toHaveBeenCalled();
  });
});
