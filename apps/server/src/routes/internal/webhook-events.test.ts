/**
 * PR-29 — `/api/internal/webhook-events/replay` route-level tests.
 *
 * Same pattern as `routes/internal/alerts.test.ts`: mock helpers
 * (not pool.query), so this file stays focused на schema-validation +
 * helper-call wiring. Helper-логіка має власні unit-тести у
 * `modules/webhooks/replayWebhookEvent.test.ts`.
 *
 * Що покриваємо:
 *   * Default `dryRun=true` — повертає plan без виклику replay helper.
 *   * `dryRun=false` без `N8N_WEBHOOK_BASE_URL` → 503 not_configured.
 *   * `dryRun=false` з config-ом → виклик `replayWebhookEvent` для
 *     кожного event-а; fail-soft на per-event помилках.
 *   * 400 на UnknownWorkflowError від `listReplayableEvents`.
 *   * Schema validation reject-ить невалідні bodies.
 */

import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReplayableEvent } from "../../modules/webhooks/replayWebhookEvent.js";
import {
  ReplayHttpError,
  UnknownWorkflowError,
} from "../../modules/webhooks/replayWebhookEvent.js";

const { listReplayableEventsMock, replayWebhookEventMock } = vi.hoisted(() => ({
  listReplayableEventsMock: vi.fn(),
  replayWebhookEventMock: vi.fn(),
}));

vi.mock("../../modules/webhooks/replayWebhookEvent.js", async (origImport) => {
  const actual =
    await origImport<
      typeof import("../../modules/webhooks/replayWebhookEvent.js")
    >();
  return {
    ...actual,
    listReplayableEvents: listReplayableEventsMock,
    replayWebhookEvent: replayWebhookEventMock,
  };
});

// `env` is imported at module-load time; set defaults before any
// `import("./webhook-events.js")` so the route picks up our values.
vi.mock("../../env.js", async () => {
  return {
    env: {
      N8N_WEBHOOK_BASE_URL: "",
      INTERNAL_API_KEY: "test-key",
      // Whatever else the module touches — minimal stub.
    },
  };
});

async function makeApp(): Promise<express.Express> {
  const { createWebhookEventsInternalRouter } =
    await import("./webhook-events.js");
  const app = express();
  app.use(express.json());
  // Bearer-auth lives in routes/internal/index.ts; ми тут mounting
  // тільки сам router щоб тестувати schema + handler wiring.
  app.use(
    createWebhookEventsInternalRouter({
      pool: { query: vi.fn().mockResolvedValue({ rows: [] }) } as never,
    }),
  );
  return app;
}

function sampleEvent(
  overrides: Partial<ReplayableEvent> = {},
): ReplayableEvent {
  return {
    id: 42,
    workflowId: "06-mono-webhook-enrichment",
    source: "mono",
    payload: { type: "StatementItem" },
    receivedAt: new Date("2026-05-13T12:00:00.000Z"),
    processedAt: null,
    replayCount: 0,
    lastReplayedAt: null,
    ...overrides,
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  // Reset env между тестами; конкретний тест sets value-у через прямий
  // mutate-mode (modules завжди read `env.N8N_WEBHOOK_BASE_URL` свіжо).
  const { env } = await import("../../env.js");
  (env as { N8N_WEBHOOK_BASE_URL: string }).N8N_WEBHOOK_BASE_URL = "";
});

describe("POST /api/internal/webhook-events/replay — validation", () => {
  it("400 on missing workflowId", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/webhook-events/replay")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Некоректні");
  });

  it("400 on non-array eventIds", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/webhook-events/replay")
      .send({ workflowId: "06-mono-webhook-enrichment", eventIds: "foo" });
    expect(res.status).toBe(400);
  });

  it("400 on invalid since (not datetime)", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/webhook-events/replay")
      .send({
        workflowId: "06-mono-webhook-enrichment",
        since: "not-a-date",
      });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/internal/webhook-events/replay — dry-run", () => {
  it("default dryRun=true: returns plan without executing", async () => {
    listReplayableEventsMock.mockResolvedValue([
      sampleEvent({ id: 42 }),
      sampleEvent({ id: 43, processedAt: new Date("2026-05-13T13:00:00Z") }),
    ]);
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/webhook-events/replay")
      .send({ workflowId: "06-mono-webhook-enrichment" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      dryRun: true,
      workflowId: "06-mono-webhook-enrichment",
      count: 2,
    });
    expect(res.body.events).toHaveLength(2);
    expect(res.body.events[0]).toMatchObject({
      id: 42,
      replayCount: 0,
      processedAt: null,
    });
    expect(replayWebhookEventMock).not.toHaveBeenCalled();
  });

  it("forwards eventIds/since/limit to listReplayableEvents", async () => {
    listReplayableEventsMock.mockResolvedValue([]);
    const app = await makeApp();
    await request(app)
      .post("/api/internal/webhook-events/replay")
      .send({
        workflowId: "06-mono-webhook-enrichment",
        eventIds: [10, 20],
        limit: 25,
      });
    expect(listReplayableEventsMock).toHaveBeenCalledWith(expect.anything(), {
      workflowId: "06-mono-webhook-enrichment",
      eventIds: [10, 20],
      limit: 25,
    });
  });

  it("400 on UnknownWorkflowError from listReplayableEvents", async () => {
    listReplayableEventsMock.mockRejectedValue(
      new UnknownWorkflowError("99-fake"),
    );
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/webhook-events/replay")
      .send({ workflowId: "99-fake" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("UNKNOWN_WORKFLOW");
    expect(res.body.allowedWorkflowIds).toContain("06-mono-webhook-enrichment");
  });
});

describe("POST /api/internal/webhook-events/replay — execute", () => {
  it("503 not_configured when dryRun=false і N8N_WEBHOOK_BASE_URL пустий", async () => {
    const { env } = await import("../../env.js");
    (env as { N8N_WEBHOOK_BASE_URL: string }).N8N_WEBHOOK_BASE_URL = "";
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/webhook-events/replay")
      .send({ workflowId: "06-mono-webhook-enrichment", dryRun: false });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("not_configured");
    expect(replayWebhookEventMock).not.toHaveBeenCalled();
  });

  it("execute happy-path: calls replayWebhookEvent per event, returns summary", async () => {
    const { env } = await import("../../env.js");
    (env as { N8N_WEBHOOK_BASE_URL: string }).N8N_WEBHOOK_BASE_URL =
      "https://n8n.example.com";

    listReplayableEventsMock.mockResolvedValue([
      sampleEvent({ id: 42 }),
      sampleEvent({ id: 43 }),
    ]);
    replayWebhookEventMock
      .mockResolvedValueOnce({ id: 42, status: 200, replayCount: 1 })
      .mockResolvedValueOnce({ id: 43, status: 202, replayCount: 1 });

    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/webhook-events/replay")
      .send({ workflowId: "06-mono-webhook-enrichment", dryRun: false });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      dryRun: false,
      total: 2,
      successes: 2,
      failures: 0,
    });
    expect(res.body.outcomes).toEqual([
      { id: 42, ok: true, status: 200, replayCount: 1 },
      { id: 43, ok: true, status: 202, replayCount: 1 },
    ]);
    expect(replayWebhookEventMock).toHaveBeenCalledTimes(2);
  });

  it("fail-soft on per-event ReplayHttpError; continues iterating", async () => {
    const { env } = await import("../../env.js");
    (env as { N8N_WEBHOOK_BASE_URL: string }).N8N_WEBHOOK_BASE_URL =
      "https://n8n.example.com";

    listReplayableEventsMock.mockResolvedValue([
      sampleEvent({ id: 42 }),
      sampleEvent({ id: 43 }),
      sampleEvent({ id: 44 }),
    ]);
    replayWebhookEventMock
      .mockResolvedValueOnce({ id: 42, status: 200, replayCount: 1 })
      .mockRejectedValueOnce(new ReplayHttpError(502, '{"message":"boom"}'))
      .mockResolvedValueOnce({ id: 44, status: 200, replayCount: 1 });

    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/webhook-events/replay")
      .send({ workflowId: "06-mono-webhook-enrichment", dryRun: false });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      total: 3,
      successes: 2,
      failures: 1,
    });
    const failed = res.body.outcomes.find(
      (o: { id: number; ok: boolean }) => o.id === 43,
    );
    expect(failed).toMatchObject({
      ok: false,
      code: "REPLAY_HTTP_ERROR",
    });
    expect(failed.message).toContain("HTTP 502");
    expect(replayWebhookEventMock).toHaveBeenCalledTimes(3);
  });

  it("fail-soft on generic Error (network / abort): coerce to REPLAY_FAILED", async () => {
    const { env } = await import("../../env.js");
    (env as { N8N_WEBHOOK_BASE_URL: string }).N8N_WEBHOOK_BASE_URL =
      "https://n8n.example.com";

    listReplayableEventsMock.mockResolvedValue([sampleEvent({ id: 99 })]);
    replayWebhookEventMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/webhook-events/replay")
      .send({ workflowId: "06-mono-webhook-enrichment", dryRun: false });

    expect(res.status).toBe(200);
    expect(res.body.failures).toBe(1);
    expect(res.body.outcomes[0]).toMatchObject({
      id: 99,
      ok: false,
      code: "REPLAY_FAILED",
    });
  });
});
