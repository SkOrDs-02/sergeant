/**
 * PR-29 — `replayWebhookEvent` + `listReplayableEvents` unit tests.
 *
 * Покриваємо:
 *   * `listReplayableEvents` — SQL-shape для трьох гілок (eventIds,
 *     since, default 24h-fallback) + bigint coercion (Hard Rule #1) +
 *     workflow-allowlist guard (UnknownWorkflowError).
 *   * `replayWebhookEvent` — POST на правильний URL із правильними
 *     headers, success-UPDATE-шлях, ReplayHttpError на non-2xx,
 *     гонка з retention-poller-ом (UPDATE RETURNING 0 рядків).
 *
 * Інтеграційне покриття (real Postgres) — окремо у Testcontainers-
 * тесті 060-n8n-webhook-events.test.ts (PR-28).
 */

import { describe, it, expect, vi } from "vitest";
import type { Pool, QueryResult, QueryResultRow } from "pg";
import {
  listReplayableEvents,
  replayWebhookEvent,
  ReplayHttpError,
  REPLAYABLE_WORKFLOW_IDS,
  UnknownWorkflowError,
  WORKFLOW_ID_TO_WEBHOOK_PATH,
  type ReplayableEvent,
} from "./replayWebhookEvent.js";

function mockPool<R extends QueryResultRow>(rows: R[]): Pool {
  return {
    query: vi.fn().mockResolvedValue({
      rows,
      rowCount: rows.length,
      command: "SELECT",
      oid: 0,
      fields: [],
    } satisfies QueryResult<R>),
  } as unknown as Pool;
}

function mockResponse(opts: {
  ok: boolean;
  status: number;
  body?: string;
}): Response {
  return {
    ok: opts.ok,
    status: opts.status,
    async text() {
      return opts.body ?? "";
    },
  } as unknown as Response;
}

describe("WORKFLOW_ID_TO_WEBHOOK_PATH", () => {
  it("covers the 4 PR-28 replayable workflows", () => {
    expect(REPLAYABLE_WORKFLOW_IDS).toEqual([
      "01-billing-pipeline",
      "02-failed-payment-recovery",
      "06-mono-webhook-enrichment",
      "15-railway-deployment-notify",
    ]);
    expect(WORKFLOW_ID_TO_WEBHOOK_PATH["06-mono-webhook-enrichment"]).toBe(
      "mono-transaction",
    );
  });
});

describe("listReplayableEvents", () => {
  it("rejects unknown workflow_id", async () => {
    const pool = mockPool([]);
    await expect(
      listReplayableEvents(pool, { workflowId: "99-not-real" }),
    ).rejects.toBeInstanceOf(UnknownWorkflowError);
  });

  it("SELECT branch: default — receives last 24h по workflow_id-у", async () => {
    const pool = mockPool([]);
    await listReplayableEvents(pool, {
      workflowId: "06-mono-webhook-enrichment",
    });
    const query = pool.query as unknown as ReturnType<typeof vi.fn>;
    expect(query).toHaveBeenCalledTimes(1);
    const call = query.mock.calls[0]!;
    const [sql, params] = call as [string, unknown[]];
    expect(sql).toContain("interval '24 hours'");
    expect(params).toEqual(["06-mono-webhook-enrichment", 100]);
  });

  it("SELECT branch: since — використовує >= $since з timestamp", async () => {
    const pool = mockPool([]);
    const since = new Date("2026-05-13T12:00:00.000Z");
    await listReplayableEvents(pool, {
      workflowId: "06-mono-webhook-enrichment",
      since,
    });
    const query = pool.query as unknown as ReturnType<typeof vi.fn>;
    const call = query.mock.calls[0]!;
    const [sql, params] = call as [string, unknown[]];
    expect(sql).toContain("received_at >= $2");
    expect(params).toEqual(["06-mono-webhook-enrichment", since, 100]);
  });

  it("SELECT branch: eventIds takes precedence over since", async () => {
    const pool = mockPool([]);
    await listReplayableEvents(pool, {
      workflowId: "06-mono-webhook-enrichment",
      since: new Date("2026-05-13T12:00:00.000Z"),
      eventIds: [101, 102, 103],
    });
    const query = pool.query as unknown as ReturnType<typeof vi.fn>;
    const call = query.mock.calls[0]!;
    const [sql, params] = call as [string, unknown[]];
    expect(sql).toContain("ANY($2::bigint[])");
    expect(params).toEqual([
      "06-mono-webhook-enrichment",
      [101, 102, 103],
      100,
    ]);
  });

  it("respects custom limit; caps at 1000", async () => {
    const pool = mockPool([]);
    await listReplayableEvents(pool, {
      workflowId: "06-mono-webhook-enrichment",
      limit: 5000,
    });
    const query = pool.query as unknown as ReturnType<typeof vi.fn>;
    const call = query.mock.calls[0]!;
    const params = call[1] as unknown[];
    expect(params[params.length - 1]).toBe(1000);
  });

  it("coerces pg bigint id (string) → number (Hard Rule #1)", async () => {
    const pool = mockPool([
      {
        id: "9007199254740993", // 2^53+1 — beyond Number.MAX_SAFE_INTEGER but pg returns string
        workflow_id: "06-mono-webhook-enrichment",
        source: "mono",
        payload: { test: true },
        received_at: new Date("2026-05-13T12:00:00.000Z"),
        processed_at: null,
        replay_count: 0,
        last_replayed_at: null,
      },
    ]);
    const rows = await listReplayableEvents(pool, {
      workflowId: "06-mono-webhook-enrichment",
    });
    expect(rows).toHaveLength(1);
    expect(typeof rows[0]!.id).toBe("number");
    expect(rows[0]!.workflowId).toBe("06-mono-webhook-enrichment");
    expect(rows[0]!.processedAt).toBeNull();
    expect(rows[0]!.replayCount).toBe(0);
  });
});

const SAMPLE_EVENT: ReplayableEvent = {
  id: 42,
  workflowId: "06-mono-webhook-enrichment",
  source: "mono",
  payload: { type: "StatementItem", data: { id: "abc" } },
  receivedAt: new Date("2026-05-13T12:00:00.000Z"),
  processedAt: null,
  replayCount: 0,
  lastReplayedAt: null,
};

describe("replayWebhookEvent", () => {
  it("POST-ить на правильний URL із replay-headers + body", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(mockResponse({ ok: true, status: 200 }));
    const pool = mockPool([{ replay_count: 1 }]);

    await replayWebhookEvent(pool, {
      event: SAMPLE_EVENT,
      n8nWebhookBaseUrl: "https://n8n.example.com/",
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const call = fetchImpl.mock.calls[0]!;
    const [url, init] = call as [
      string,
      RequestInit & { headers: Record<string, string>; body: string },
    ];
    expect(url).toBe("https://n8n.example.com/webhook/mono-transaction");
    expect(init.method).toBe("POST");
    expect(init.headers["content-type"]).toBe("application/json");
    expect(init.headers["x-replay-source"]).toBe("sergeant-replay-cli");
    expect(init.headers["x-replay-event-id"]).toBe("42");
    expect(JSON.parse(init.body)).toEqual(SAMPLE_EVENT.payload);
  });

  it("повертає replayCount з RETURNING після успішного UPDATE", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(mockResponse({ ok: true, status: 202 }));
    const pool = mockPool([{ replay_count: 3 }]);

    const result = await replayWebhookEvent(pool, {
      event: SAMPLE_EVENT,
      n8nWebhookBaseUrl: "https://n8n.example.com",
      fetchImpl,
    });

    expect(result).toEqual({ id: 42, status: 202, replayCount: 3 });
    const query = pool.query as unknown as ReturnType<typeof vi.fn>;
    const call = query.mock.calls[0]!;
    const [sql, params] = call as [string, unknown[]];
    expect(sql).toContain("UPDATE n8n_webhook_events");
    expect(sql).toContain("replay_count = replay_count + 1");
    expect(sql).toContain("last_replayed_at = now()");
    expect(sql).toContain("COALESCE(processed_at, now())");
    expect(params).toEqual([42]);
  });

  it("кидає ReplayHttpError на non-2xx і НЕ робить UPDATE", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockResponse({
        ok: false,
        status: 502,
        body: '{"message":"n8n upstream timeout"}',
      }),
    );
    const pool = mockPool([{ replay_count: 0 }]);

    await expect(
      replayWebhookEvent(pool, {
        event: SAMPLE_EVENT,
        n8nWebhookBaseUrl: "https://n8n.example.com",
        fetchImpl,
      }),
    ).rejects.toMatchObject({
      name: "ReplayHttpError",
      status: 502,
      code: "REPLAY_HTTP_ERROR",
    });
    const query = pool.query as unknown as ReturnType<typeof vi.fn>;
    expect(query).not.toHaveBeenCalled();
  });

  it("ReplayHttpError як Error-instance і має очікувані поля", async () => {
    const err = new ReplayHttpError(500, "boom");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ReplayHttpError");
    expect(err.status).toBe(500);
    expect(err.body).toBe("boom");
    expect(err.code).toBe("REPLAY_HTTP_ERROR");
  });

  it("повертає replayCount=0 коли UPDATE returns 0 рядків (retention-race)", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(mockResponse({ ok: true, status: 200 }));
    const pool = mockPool([]); // 0 rows updated

    const result = await replayWebhookEvent(pool, {
      event: SAMPLE_EVENT,
      n8nWebhookBaseUrl: "https://n8n.example.com",
      fetchImpl,
    });

    expect(result.replayCount).toBe(0);
    expect(result.status).toBe(200);
  });

  it("кидає UnknownWorkflowError якщо workflow_id не у mapping-у", async () => {
    const fetchImpl = vi.fn();
    const pool = mockPool([]);
    const bad: ReplayableEvent = { ...SAMPLE_EVENT, workflowId: "99-fake" };
    await expect(
      replayWebhookEvent(pool, {
        event: bad,
        n8nWebhookBaseUrl: "https://n8n.example.com",
        fetchImpl,
      }),
    ).rejects.toBeInstanceOf(UnknownWorkflowError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("strip-ає trailing slash з baseUrl при формуванні URL", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(mockResponse({ ok: true, status: 200 }));
    const pool = mockPool([{ replay_count: 1 }]);

    await replayWebhookEvent(pool, {
      event: SAMPLE_EVENT,
      n8nWebhookBaseUrl: "https://n8n.example.com///",
      fetchImpl,
    });

    const call = fetchImpl.mock.calls[0]!;
    const url = call[0];
    expect(url).toBe("https://n8n.example.com/webhook/mono-transaction");
  });
});
