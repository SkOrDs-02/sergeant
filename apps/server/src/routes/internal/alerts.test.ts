/**
 * Route-level coverage for `/api/internal/alerts/*` (ADR-0040).
 *
 * Same pattern as `routes/internal/openclaw.test.ts`: we mock the store
 * helpers (not pool.query) so this file stays focused on schema-validation
 * + store-call wiring; the store layer has its own dedicated unit tests
 * in `modules/alerts/store.test.ts`.
 */
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  recordAlertPostMock,
  recordAlertAckMock,
  markAlertEscalatedMock,
  listPendingAlertsMock,
} = vi.hoisted(() => ({
  recordAlertPostMock: vi.fn(),
  recordAlertAckMock: vi.fn(),
  markAlertEscalatedMock: vi.fn(),
  listPendingAlertsMock: vi.fn(),
}));

vi.mock("../../modules/alerts/index.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../modules/alerts/index.js")>();
  return {
    ...actual,
    recordAlertPost: recordAlertPostMock,
    recordAlertAck: recordAlertAckMock,
    markAlertEscalated: markAlertEscalatedMock,
    listPendingAlerts: listPendingAlertsMock,
  };
});

async function makeApp() {
  const { createAlertsInternalRouter } = await import("./alerts.js");
  const app = express();
  app.use(express.json());
  // Bearer-auth middleware lives in routes/internal/index.ts; we mount
  // the alerts router directly so these tests stay focused on schema +
  // store wiring.
  app.use(
    createAlertsInternalRouter({
      pool: { query: vi.fn().mockResolvedValue({ rows: [] }) } as never,
    }),
  );
  return app;
}

describe("/api/internal/alerts/post", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordAlertPostMock.mockResolvedValue({ id: 1, alreadyPosted: false });
  });

  it("forwards a P0 incident post and returns id + flag", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/alerts/post")
      .send({
        alertId: "wf-15:42",
        topic: "control_plane",
        severity: "P1",
        summary: "Railway deploy fail",
        metadata: { exec: 42 },
      });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, id: 1, alreadyPosted: false });
    expect(recordAlertPostMock).toHaveBeenCalledTimes(1);
    const arg = recordAlertPostMock.mock.calls[0]?.[1];
    expect(arg).toEqual({
      alertId: "wf-15:42",
      topic: "control_plane",
      severity: "P1",
      summary: "Railway deploy fail",
      metadata: { exec: 42 },
    });
  });

  it("surfaces alreadyPosted=true on retry", async () => {
    recordAlertPostMock.mockResolvedValueOnce({ id: 7, alreadyPosted: true });
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/alerts/post")
      .send({ alertId: "wf-15:42", topic: "control_plane", severity: "P1" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, id: 7, alreadyPosted: true });
  });

  it("rejects unknown severity tier with 400 (Zod schema)", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/alerts/post")
      .send({ alertId: "x", topic: "incidents", severity: "P5" });
    expect(res.status).toBe(400);
    expect(recordAlertPostMock).not.toHaveBeenCalled();
  });

  it("rejects unknown extra field via .strict()", async () => {
    const app = await makeApp();
    const res = await request(app).post("/api/internal/alerts/post").send({
      alertId: "x",
      topic: "incidents",
      severity: "P0",
      weirdField: 1,
    });
    expect(res.status).toBe(400);
  });
});

describe("/api/internal/alerts/ack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordAlertAckMock.mockResolvedValue({
      ok: true,
      alreadyAcked: false,
      notFound: false,
    });
  });

  it("records first ack and returns alreadyAcked=false", async () => {
    const app = await makeApp();
    const res = await request(app).post("/api/internal/alerts/ack").send({
      alertId: "wf-15:42",
      ackByTgUserId: 12345,
      ackAction: "read",
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, alreadyAcked: false });
  });

  it("returns 200 + alreadyAcked=true when row already acked", async () => {
    recordAlertAckMock.mockResolvedValueOnce({
      ok: true,
      alreadyAcked: true,
      notFound: false,
    });
    const app = await makeApp();
    const res = await request(app).post("/api/internal/alerts/ack").send({
      alertId: "wf-15:42",
      ackByTgUserId: 12345,
      ackAction: "read",
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, alreadyAcked: true });
  });

  it("returns 404 for unknown alertId", async () => {
    recordAlertAckMock.mockResolvedValueOnce({
      ok: false,
      alreadyAcked: false,
      notFound: true,
    });
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/alerts/ack")
      .send({ alertId: "ghost", ackByTgUserId: 1, ackAction: "read" });
    expect(res.status).toBe(404);
  });

  it("rejects unknown ack action with 400", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/alerts/ack")
      .send({ alertId: "x", ackByTgUserId: 1, ackAction: "snoozed" });
    expect(res.status).toBe(400);
    expect(recordAlertAckMock).not.toHaveBeenCalled();
  });
});

describe("/api/internal/alerts/pending", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listPendingAlertsMock.mockResolvedValue([]);
  });

  it("forwards WF-103 cron filters to the store", async () => {
    const app = await makeApp();
    const res = await request(app).post("/api/internal/alerts/pending").send({
      severity: "P0",
      olderThanMinutes: 15,
      notYetEscalated: true,
      limit: 50,
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ alerts: [] });
    const arg = listPendingAlertsMock.mock.calls[0]?.[1];
    expect(arg).toEqual({
      topic: undefined,
      severity: "P0",
      olderThanMinutes: 15,
      notYetEscalated: true,
      limit: 50,
    });
  });

  it("returns alerts payload from the store", async () => {
    listPendingAlertsMock.mockResolvedValueOnce([
      {
        id: 7,
        posted_at: "2026-05-03T10:00:00.000Z",
        alert_id: "wf-15:1",
        topic: "control_plane",
        severity: "P1",
        summary: null,
        ack_at: null,
        ack_by_tg_user_id: null,
        ack_action: null,
        escalated_at: null,
        metadata: {},
      },
    ]);
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/alerts/pending")
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.alerts).toHaveLength(1);
    expect(res.body.alerts[0].alert_id).toBe("wf-15:1");
  });
});

describe("/api/internal/alerts/escalate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    markAlertEscalatedMock.mockResolvedValue({
      ok: true,
      alreadyEscalated: false,
      notFound: false,
    });
  });

  it("escalates a fresh alert", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/alerts/escalate")
      .send({ alertId: "wf-15:42" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, alreadyEscalated: false });
  });

  it("returns alreadyEscalated=true on retry", async () => {
    markAlertEscalatedMock.mockResolvedValueOnce({
      ok: true,
      alreadyEscalated: true,
      notFound: false,
    });
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/alerts/escalate")
      .send({ alertId: "wf-15:42" });
    expect(res.status).toBe(200);
    expect(res.body.alreadyEscalated).toBe(true);
  });

  it("returns 404 for unknown alertId", async () => {
    markAlertEscalatedMock.mockResolvedValueOnce({
      ok: false,
      alreadyEscalated: false,
      notFound: true,
    });
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/alerts/escalate")
      .send({ alertId: "ghost" });
    expect(res.status).toBe(404);
  });
});
