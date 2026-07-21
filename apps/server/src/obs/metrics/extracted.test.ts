import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import type { Pool } from "pg";

import {
  dbPoolIdle,
  dbPoolSizeCurrent,
  dbPoolTotal,
  dbPoolWaiting,
  metricsHandler,
  register,
  startPoolSampler,
  statusClass,
} from "./registry.js";
import {
  httpErrorsTotal,
  httpInFlight,
  httpRequestDurationMs,
  httpRequestsTotal,
} from "./http.js";
import {
  dbErrorsTotal,
  dbQueryDurationMs,
  dbSlowQueriesTotal,
  securityRoomUnreachableTotal,
} from "./db-query.js";
import {
  aiCostConsumedTotal,
  barcodeLookupsTotal,
  chatToolInvocationsTotal,
  externalHttpDurationMs,
  pushSendsTotal,
  transcribeUsdCapEventsTotal,
} from "./domain.js";
import {
  syncDurationMs,
  syncOpLogNullOriginDeviceIdTotal,
  syncOperationsTotal,
  syncPayloadBytes,
  syncStreamConnectionsActive,
} from "./sync.js";
import {
  aiMemoryIngestDurationMs,
  aiMemoryIngestEnqueuedTotal,
  aiMemoryIngestProcessedTotal,
  aiMemoryIngestQueueDepth,
  authMailJobDurationMs,
  authMailJobsEnqueuedTotal,
  authMailJobsProcessedTotal,
  authMailQueueDepth,
  ftuxDripJobDurationMs,
  ftuxDripJobsEnqueuedTotal,
  ftuxDripJobsProcessedTotal,
  ftuxDripQueueDepth,
  ftuxDripUnsubscribesTotal,
} from "./jobs.js";
import {
  billingCheckoutTotal,
  billingRecurringChargeTotal,
  billingWebhookTotal,
} from "./billing.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("metrics extracted modules", () => {
  it("classifies HTTP status codes into RED status buckets", () => {
    expect(statusClass(200)).toBe("2xx");
    expect(statusClass("302")).toBe("3xx");
    expect(statusClass(404)).toBe("4xx");
    expect(statusClass(503)).toBe("5xx");
    expect(statusClass(undefined)).toBe("other");
    expect(statusClass("not-a-status")).toBe("other");
  });

  it("samples pg pool gauges into legacy and labeled metric families", async () => {
    const pool = {
      totalCount: 5,
      idleCount: 2,
      waitingCount: 1,
    } as Pool;

    const handle = startPoolSampler(pool, { intervalMs: 60_000 });
    clearInterval(handle);

    expect(register.getSingleMetric("db_pool_total")).toBe(dbPoolTotal);
    expect(register.getSingleMetric("db_pool_idle")).toBe(dbPoolIdle);
    expect(register.getSingleMetric("db_pool_waiting")).toBe(dbPoolWaiting);
    expect(register.getSingleMetric("db_pool_size_current")).toBe(
      dbPoolSizeCurrent,
    );

    const text = await register.metrics();
    expect(text).toMatch(/^db_pool_total 5$/m);
    expect(text).toMatch(/^db_pool_idle 2$/m);
    expect(text).toMatch(/^db_pool_waiting 1$/m);
    expect(text).toMatch(/db_pool_size_current\{state="active"\} 3/);
    expect(text).toMatch(/db_pool_size_current\{state="idle"\} 2/);
    expect(text).toMatch(/db_pool_size_current\{state="waiting"\} 1/);
  });

  it("keeps sampling best-effort when pool counters throw", () => {
    const pool = {
      get totalCount() {
        throw new Error("pool closed");
      },
      idleCount: 0,
      waitingCount: 0,
    } as unknown as Pool;

    const handle = startPoolSampler(pool, { intervalMs: 60_000 });
    clearInterval(handle);
  });

  it("maps register.metrics failures to a plain-text 500 response", async () => {
    vi.spyOn(register, "metrics").mockRejectedValueOnce(new Error("boom"));
    const sendMock = vi.fn();
    const typeMock = vi.fn(() => ({ send: sendMock }));
    const statusMock = vi.fn(() => ({ type: typeMock }));
    const res = {
      status: statusMock,
      type: typeMock,
      send: sendMock,
      setHeader: vi.fn(),
    } as unknown as Response;
    const req = { get: vi.fn() } as unknown as Request;

    metricsHandler(req, res);
    await new Promise((resolve) => setImmediate(resolve));

    expect(statusMock).toHaveBeenCalledWith(500);
    expect(typeMock).toHaveBeenCalledWith("text/plain");
    expect(sendMock).toHaveBeenCalledWith("metrics_error: boom");
  });

  it("exports and updates HTTP, DB, domain, sync, job, and billing metric families", async () => {
    expect(register.getSingleMetric("http_requests_total")).toBe(
      httpRequestsTotal,
    );
    expect(register.getSingleMetric("http_request_duration_ms")).toBe(
      httpRequestDurationMs,
    );
    expect(register.getSingleMetric("http_errors_total")).toBe(httpErrorsTotal);
    expect(register.getSingleMetric("http_in_flight")).toBe(httpInFlight);
    expect(register.getSingleMetric("db_query_duration_ms")).toBe(
      dbQueryDurationMs,
    );
    expect(register.getSingleMetric("db_errors_total")).toBe(dbErrorsTotal);
    expect(register.getSingleMetric("db_slow_queries_total")).toBe(
      dbSlowQueriesTotal,
    );
    expect(register.getSingleMetric("security_room_unreachable_total")).toBe(
      securityRoomUnreachableTotal,
    );

    httpRequestsTotal.inc({
      method: "GET",
      path: "/api/status",
      status: "200",
      module: "status",
    });
    httpRequestDurationMs.observe(
      { method: "GET", path: "/api/status", status_class: "2xx" },
      12,
    );
    httpErrorsTotal.inc({
      method: "POST",
      path: "/api/chat",
      status_class: "5xx",
      module: "chat",
    });
    httpInFlight.set({ method: "POST" }, 1);
    dbQueryDurationMs.observe({ op: "select" }, 3);
    dbErrorsTotal.inc({ code: "23505" });
    dbSlowQueriesTotal.inc({ op: "insert" });
    securityRoomUnreachableTotal.inc({ reason: "fetch_error" });
    chatToolInvocationsTotal.inc({
      tool: "delete_transaction",
      outcome: "proposed",
    });
    aiCostConsumedTotal.inc({ subject_type: "user", bucket_type: "tool" }, 3);
    transcribeUsdCapEventsTotal.inc({ outcome: "cap_hit" });
    pushSendsTotal.inc({ outcome: "ok" });
    barcodeLookupsTotal.inc({ source: "off", outcome: "hit" });
    externalHttpDurationMs.observe(
      { upstream: "anthropic", outcome: "ok" },
      250,
    );
    syncOperationsTotal.inc({ op: "v2_push", module: "v2", outcome: "ok" });
    syncDurationMs.observe({ op: "v2_push", module: "v2" }, 8);
    syncPayloadBytes.observe({ op: "v2_push", module: "v2" }, 2048);
    syncStreamConnectionsActive.set({ module: "v2" }, 2);
    syncOpLogNullOriginDeviceIdTotal.inc({ module: "v2" });

    authMailJobsEnqueuedTotal.inc({ mode: "queued" });
    authMailJobsProcessedTotal.inc({ outcome: "ok" });
    authMailJobDurationMs.observe({ outcome: "ok" }, 75);
    authMailQueueDepth.set({ status: "waiting" }, 4);
    ftuxDripJobsEnqueuedTotal.inc({ mode: "queued", day: "day_1" });
    ftuxDripJobsProcessedTotal.inc({ outcome: "ok", day: "day_1" });
    ftuxDripJobDurationMs.observe({ outcome: "ok", day: "day_1" }, 90);
    ftuxDripQueueDepth.set({ status: "delayed" }, 5);
    ftuxDripUnsubscribesTotal.inc({ outcome: "ok" });
    aiMemoryIngestEnqueuedTotal.inc({ mode: "queued", source: "mono" });
    aiMemoryIngestProcessedTotal.inc({ outcome: "ok", source: "mono" });
    aiMemoryIngestDurationMs.observe({ outcome: "ok", source: "mono" }, 300);
    aiMemoryIngestQueueDepth.set({ status: "active" }, 1);
    billingCheckoutTotal.inc({ provider: "liqpay", result: "ok" });
    billingWebhookTotal.inc({ provider: "plata", status: "verified" });
    billingRecurringChargeTotal.inc({ provider: "liqpay", result: "charged" });

    const text = await register.metrics();
    expect(text).toContain("http_requests_total");
    expect(text).toContain("db_query_duration_ms_bucket");
    expect(text).toContain("chat_tool_invocations_total");
    expect(text).toContain("sync_op_log_null_origin_device_id_total");
    expect(text).toContain("auth_mail_jobs_enqueued_total");
    expect(text).toContain("ai_memory_ingest_duration_ms_bucket");
    expect(text).toContain("billing_recurring_charge_total");
  });
});
