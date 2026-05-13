/**
 * Route-level coverage for `/api/internal/alerts/*` (ADR-0038).
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
  markAlertRepeatedMock,
  markAlertSentryWarnedMock,
  markAlertSnoozedMock,
  listPendingAlertsMock,
  getAlertHistoryStatsMock,
  postOrEditDedupedAlertMock,
  sentryCaptureMessageMock,
  sentryAddBreadcrumbMock,
  isFounderMutedMock,
} = vi.hoisted(() => ({
  recordAlertPostMock: vi.fn(),
  recordAlertAckMock: vi.fn(),
  markAlertEscalatedMock: vi.fn(),
  markAlertRepeatedMock: vi.fn(),
  markAlertSentryWarnedMock: vi.fn(),
  markAlertSnoozedMock: vi.fn(),
  listPendingAlertsMock: vi.fn(),
  getAlertHistoryStatsMock: vi.fn(),
  postOrEditDedupedAlertMock: vi.fn(),
  sentryCaptureMessageMock: vi.fn(),
  sentryAddBreadcrumbMock: vi.fn(),
  isFounderMutedMock: vi.fn().mockResolvedValue({
    muted: false,
    mutedUntilIso: null,
    reason: null,
  }),
}));

vi.mock("../../modules/alerts/index.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../modules/alerts/index.js")>();
  return {
    ...actual,
    recordAlertPost: recordAlertPostMock,
    recordAlertAck: recordAlertAckMock,
    markAlertEscalated: markAlertEscalatedMock,
    markAlertRepeated: markAlertRepeatedMock,
    markAlertSentryWarned: markAlertSentryWarnedMock,
    markAlertSnoozed: markAlertSnoozedMock,
    listPendingAlerts: listPendingAlertsMock,
    getAlertHistoryStats: getAlertHistoryStatsMock,
    postOrEditDedupedAlert: postOrEditDedupedAlertMock,
  };
});

vi.mock("../../sentry.js", () => ({
  Sentry: {
    captureMessage: sentryCaptureMessageMock,
    addBreadcrumb: sentryAddBreadcrumbMock,
  },
}));

vi.mock("../../modules/openclaw/index.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../modules/openclaw/index.js")>();
  return {
    ...actual,
    isFounderMuted: isFounderMutedMock,
  };
});

async function makeApp(options?: {
  telegramClient?: import("../../modules/alerts/index.js").TelegramApiClient;
}) {
  const { createAlertsInternalRouter } = await import("./alerts.js");
  const app = express();
  app.use(express.json());
  // Bearer-auth middleware lives in routes/internal/index.ts; we mount
  // the alerts router directly so these tests stay focused on schema +
  // store wiring.
  app.use(
    createAlertsInternalRouter({
      pool: { query: vi.fn().mockResolvedValue({ rows: [] }) } as never,
      ...(options?.telegramClient !== undefined && {
        telegramClient: options.telegramClient,
      }),
    }),
  );
  return app;
}

function noopTelegramClient(): import("../../modules/alerts/index.js").TelegramApiClient {
  return {
    sendMessage: vi.fn().mockResolvedValue({ ok: true, messageId: 1 }),
    editMessageText: vi.fn().mockResolvedValue({ ok: true }),
  } as unknown as import("../../modules/alerts/index.js").TelegramApiClient;
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

describe("/api/internal/alerts/history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAlertHistoryStatsMock.mockResolvedValue({
      workflows: [],
      summary: {
        daysBack: 7,
        total: 0,
        acked: 0,
        escalated: 0,
        repeated: 0,
        sentryWarned: 0,
        ackRatePct: 0,
        avgTtaMinutes: null,
        workflowCount: 0,
      },
    });
  });

  it("forwards default body (empty) to store with no overrides", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/alerts/history")
      .send({});
    expect(res.status).toBe(200);
    expect(getAlertHistoryStatsMock).toHaveBeenCalledWith(
      expect.anything(),
      {},
    );
  });

  it("forwards days + limit overrides", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/alerts/history")
      .send({ days: 14, limit: 5 });
    expect(res.status).toBe(200);
    expect(getAlertHistoryStatsMock).toHaveBeenCalledWith(expect.anything(), {
      daysBack: 14,
      limit: 5,
    });
  });

  it("returns 400 when days exceeds 30", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/alerts/history")
      .send({ days: 60 });
    expect(res.status).toBe(400);
    expect(getAlertHistoryStatsMock).not.toHaveBeenCalled();
  });

  it("returns 400 when limit exceeds 50", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/alerts/history")
      .send({ limit: 100 });
    expect(res.status).toBe(400);
    expect(getAlertHistoryStatsMock).not.toHaveBeenCalled();
  });

  it("returns the store payload verbatim", async () => {
    getAlertHistoryStatsMock.mockResolvedValueOnce({
      workflows: [
        {
          workflowId: "wf-15",
          total: 3,
          acked: 2,
          escalated: 1,
          repeated: 0,
          sentryWarned: 0,
          ackRatePct: 67,
          avgTtaMinutes: 5.0,
        },
      ],
      summary: {
        daysBack: 7,
        total: 3,
        acked: 2,
        escalated: 1,
        repeated: 0,
        sentryWarned: 0,
        ackRatePct: 67,
        avgTtaMinutes: 5,
        workflowCount: 1,
      },
    });
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/alerts/history")
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.workflows).toHaveLength(1);
    expect(res.body.workflows[0].workflowId).toBe("wf-15");
    expect(res.body.summary.workflowCount).toBe(1);
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

// ─────────────────────────────────────────────────────────────────────
// Sprint 6 / escalation tiers — T2 repeat, T3 sentry-warn, snooze
// ─────────────────────────────────────────────────────────────────────

describe("/api/internal/alerts/repeat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    markAlertRepeatedMock.mockResolvedValue({
      ok: true,
      alreadyRepeated: false,
      notFound: false,
    });
  });

  it("marks a fresh alert as repeated (Tier 2 @ 60min)", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/alerts/repeat")
      .send({ alertId: "wf-15:42" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, alreadyRepeated: false });
    expect(markAlertRepeatedMock).toHaveBeenCalledWith(
      expect.anything(),
      "wf-15:42",
    );
  });

  it("returns alreadyRepeated=true on cron retry", async () => {
    markAlertRepeatedMock.mockResolvedValueOnce({
      ok: true,
      alreadyRepeated: true,
      notFound: false,
    });
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/alerts/repeat")
      .send({ alertId: "wf-15:42" });
    expect(res.status).toBe(200);
    expect(res.body.alreadyRepeated).toBe(true);
  });

  it("returns 404 for unknown alertId", async () => {
    markAlertRepeatedMock.mockResolvedValueOnce({
      ok: false,
      alreadyRepeated: false,
      notFound: true,
    });
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/alerts/repeat")
      .send({ alertId: "ghost" });
    expect(res.status).toBe(404);
  });
});

describe("/api/internal/alerts/sentry-warn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    markAlertSentryWarnedMock.mockResolvedValue({
      ok: true,
      alreadySentryWarned: false,
      notFound: false,
    });
  });

  it("fires Sentry.captureMessage with warning level + tag on first call", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/alerts/sentry-warn")
      .send({ alertId: "wf-15:42" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, alreadySentryWarned: false });
    expect(sentryCaptureMessageMock).toHaveBeenCalledTimes(1);
    const [msg, options] = sentryCaptureMessageMock.mock.calls[0]!;
    expect(msg).toContain("unacked-alert-escalation");
    expect(msg).toContain("wf-15:42");
    expect(options).toEqual({
      level: "warning",
      tags: {
        kind: "unacked-alert-escalation",
        alertId: "wf-15:42",
      },
    });
  });

  it("does NOT re-fire Sentry on cron retry (idempotent)", async () => {
    markAlertSentryWarnedMock.mockResolvedValueOnce({
      ok: true,
      alreadySentryWarned: true,
      notFound: false,
    });
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/alerts/sentry-warn")
      .send({ alertId: "wf-15:42" });
    expect(res.status).toBe(200);
    expect(res.body.alreadySentryWarned).toBe(true);
    expect(sentryCaptureMessageMock).not.toHaveBeenCalled();
  });

  it("absorbs Sentry capture failure (row still stamped — do not fail cron)", async () => {
    sentryCaptureMessageMock.mockImplementationOnce(() => {
      throw new Error("sentry-network-down");
    });
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/alerts/sentry-warn")
      .send({ alertId: "wf-15:42" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, alreadySentryWarned: false });
  });

  it("returns 404 for unknown alertId", async () => {
    markAlertSentryWarnedMock.mockResolvedValueOnce({
      ok: false,
      alreadySentryWarned: false,
      notFound: true,
    });
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/alerts/sentry-warn")
      .send({ alertId: "ghost" });
    expect(res.status).toBe(404);
    expect(sentryCaptureMessageMock).not.toHaveBeenCalled();
  });
});

describe("/api/internal/alerts/snooze", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    markAlertSnoozedMock.mockImplementation(async (_pool, input) => ({
      ok: true,
      notFound: false,
      snoozedUntilAt: input.snoozedUntilAt.toISOString(),
    }));
  });

  it("computes snoozed_until_at = now + duration and returns ISO", async () => {
    const now = new Date("2026-05-13T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      const app = await makeApp();
      const res = await request(app)
        .post("/api/internal/alerts/snooze")
        .send({ alertId: "wf-15:42", durationMinutes: 60 });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        ok: true,
        snoozedUntilAt: "2026-05-13T13:00:00.000Z",
      });
      const arg = markAlertSnoozedMock.mock.calls[0]?.[1];
      expect(arg.alertId).toBe("wf-15:42");
      expect(arg.snoozedUntilAt).toEqual(new Date("2026-05-13T13:00:00.000Z"));
    } finally {
      vi.useRealTimers();
    }
  });

  it("accepts 240-min (4h) snooze", async () => {
    const now = new Date("2026-05-13T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      const app = await makeApp();
      const res = await request(app)
        .post("/api/internal/alerts/snooze")
        .send({ alertId: "wf-15:42", durationMinutes: 240 });
      expect(res.status).toBe(200);
      expect(res.body.snoozedUntilAt).toBe("2026-05-13T16:00:00.000Z");
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects durationMinutes out of [1, 24*60] range with 400", async () => {
    const app = await makeApp();
    const tooLarge = await request(app)
      .post("/api/internal/alerts/snooze")
      .send({ alertId: "wf-15:42", durationMinutes: 60 * 25 });
    expect(tooLarge.status).toBe(400);
    const negative = await request(app)
      .post("/api/internal/alerts/snooze")
      .send({ alertId: "wf-15:42", durationMinutes: -1 });
    expect(negative.status).toBe(400);
  });

  it("returns 404 for unknown alertId", async () => {
    markAlertSnoozedMock.mockResolvedValueOnce({
      ok: false,
      notFound: true,
      snoozedUntilAt: null,
    });
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/alerts/snooze")
      .send({ alertId: "ghost", durationMinutes: 60 });
    expect(res.status).toBe(404);
  });
});

// ──────────────────────────────────────────────────────────────────────
// /api/internal/alerts/send (O4 / B.1 deduped shipper)
// ──────────────────────────────────────────────────────────────────────

describe("/api/internal/alerts/send", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("503 when SERGEANT_ALERT_BOT_TOKEN не виставлений і клієнт не переданий", async () => {
    const prev = process.env["SERGEANT_ALERT_BOT_TOKEN"];
    delete process.env["SERGEANT_ALERT_BOT_TOKEN"];
    try {
      const app = await makeApp();
      const res = await request(app).post("/api/internal/alerts/send").send({
        alertId: "wf-15:42",
        topic: "incidents",
        severity: "P1",
        text: "⚠️ boom",
        chatId: -1001,
      });
      expect(res.status).toBe(503);
      expect(res.body.error).toBe("telegram_not_configured");
    } finally {
      if (prev !== undefined) {
        process.env["SERGEANT_ALERT_BOT_TOKEN"] = prev;
      }
    }
  });

  it("forwards parameters to postOrEditDedupedAlert and returns result", async () => {
    postOrEditDedupedAlertMock.mockResolvedValueOnce({
      action: "sent",
      alertId: "wf-15:42",
      messageId: 99,
      occurrenceCount: 1,
      alreadyPosted: false,
    });

    const app = await makeApp({ telegramClient: noopTelegramClient() });
    const res = await request(app).post("/api/internal/alerts/send").send({
      alertId: "wf-15:42",
      topic: "incidents",
      severity: "P1",
      dedupSignature: "wf-15:boom",
      chatId: -1001,
      messageThreadId: 3,
      text: "⚠️ boom",
      summary: "WF-15 boom",
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      action: "sent",
      alertId: "wf-15:42",
      messageId: 99,
      occurrenceCount: 1,
      alreadyPosted: false,
    });

    const call = postOrEditDedupedAlertMock.mock.calls[0]!;
    const input = call[2] as Record<string, unknown>;
    expect(input).toMatchObject({
      alertId: "wf-15:42",
      topic: "incidents",
      severity: "P1",
      dedupSignature: "wf-15:boom",
      chatId: -1001,
      messageThreadId: 3,
      text: "⚠️ boom",
      windowMs: 600_000,
    });
  });

  it("returns 502 on action=error", async () => {
    postOrEditDedupedAlertMock.mockResolvedValueOnce({
      action: "error",
      reason: "Bad Gateway",
    });
    const app = await makeApp({ telegramClient: noopTelegramClient() });
    const res = await request(app).post("/api/internal/alerts/send").send({
      alertId: "wf-15:42",
      topic: "incidents",
      severity: "P1",
      chatId: -1001,
      text: "⚠️ boom",
    });
    expect(res.status).toBe(502);
    expect(res.body.reason).toBe("Bad Gateway");
  });

  it("rejects missing required fields via Zod (.strict)", async () => {
    const app = await makeApp({ telegramClient: noopTelegramClient() });
    const res = await request(app).post("/api/internal/alerts/send").send({
      alertId: "wf-15:42",
      // missing topic, severity, text, chatId
    });
    expect(res.status).toBe(400);
  });

  it("clamps windowMs to safe range", async () => {
    const app = await makeApp({ telegramClient: noopTelegramClient() });
    const res = await request(app).post("/api/internal/alerts/send").send({
      alertId: "x",
      topic: "incidents",
      severity: "P1",
      chatId: -1,
      text: "x",
      windowMs: 500, // < 60_000 мінімум
    });
    expect(res.status).toBe(400);
  });

  // PR /mute (Phase 5b) — mute-gate integration.

  it("skips non-P0 alerts when founder is muted and emits breadcrumb", async () => {
    isFounderMutedMock.mockResolvedValueOnce({
      muted: true,
      mutedUntilIso: "2026-05-14T06:00:00.000Z",
      reason: "sleep",
    });
    const app = await makeApp({ telegramClient: noopTelegramClient() });
    const res = await request(app).post("/api/internal/alerts/send").send({
      alertId: "wf-15:42",
      topic: "incidents",
      severity: "P1",
      chatId: -1001,
      text: "⚠️ boom",
      founderUserId: "user-1",
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      action: "skipped_muted",
      alertId: "wf-15:42",
      mutedUntilIso: "2026-05-14T06:00:00.000Z",
    });
    expect(postOrEditDedupedAlertMock).not.toHaveBeenCalled();
    expect(sentryAddBreadcrumbMock).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "openclaw.mute",
        message: "openclaw-muted-skip",
      }),
    );
  });

  it("P0 alerts bypass mute and emit override-critical breadcrumb", async () => {
    isFounderMutedMock.mockResolvedValueOnce({
      muted: true,
      mutedUntilIso: "2026-05-14T06:00:00.000Z",
      reason: "sleep",
    });
    postOrEditDedupedAlertMock.mockResolvedValueOnce({
      action: "sent",
      alertId: "wf-15:critical",
      messageId: 42,
      occurrenceCount: 1,
      alreadyPosted: false,
    });
    const app = await makeApp({ telegramClient: noopTelegramClient() });
    const res = await request(app).post("/api/internal/alerts/send").send({
      alertId: "wf-15:critical",
      topic: "incidents",
      severity: "P0",
      chatId: -1001,
      text: "🚨 DB down",
      founderUserId: "user-1",
    });
    expect(res.status).toBe(200);
    expect(res.body.action).toBe("sent");
    expect(postOrEditDedupedAlertMock).toHaveBeenCalledTimes(1);
    expect(sentryAddBreadcrumbMock).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "openclaw.mute",
        message: "openclaw-muted-override-critical",
      }),
    );
  });

  it("does not call isFounderMuted when founderUserId is omitted (topic-channel callers)", async () => {
    postOrEditDedupedAlertMock.mockResolvedValueOnce({
      action: "sent",
      alertId: "wf-15:topic",
      messageId: 7,
      occurrenceCount: 1,
      alreadyPosted: false,
    });
    const app = await makeApp({ telegramClient: noopTelegramClient() });
    const res = await request(app).post("/api/internal/alerts/send").send({
      alertId: "wf-15:topic",
      topic: "ops",
      severity: "P2",
      chatId: -1002,
      text: "ops chatter",
    });
    expect(res.status).toBe(200);
    expect(isFounderMutedMock).not.toHaveBeenCalled();
    expect(postOrEditDedupedAlertMock).toHaveBeenCalledTimes(1);
  });
});
