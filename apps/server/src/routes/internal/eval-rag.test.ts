import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatEventMessage,
  shouldAutoDisableMonoIngest,
  type RagEvalSummary,
} from "./eval-rag.js";

type SentryCaptureArgs = [
  message: string,
  options: {
    level: string;
    tags: Record<string, string>;
    extra: Record<string, unknown>;
  },
];

const { sentryCaptureMessageMock } = vi.hoisted(() => ({
  sentryCaptureMessageMock: vi.fn<(...args: SentryCaptureArgs) => string>(
    () => "sentry-evt-test",
  ),
}));

vi.mock("@sentry/node", async () => {
  const actual = await vi.importActual<object>("@sentry/node");
  return {
    ...actual,
    captureMessage: sentryCaptureMessageMock,
    addBreadcrumb: vi.fn(),
  };
});

function makePool() {
  return {
    query: vi.fn().mockResolvedValue({ rows: [{ id: 42 }] }),
  };
}

async function makeApp(pool = makePool()) {
  vi.resetModules();
  process.env["INTERNAL_API_KEY"] = "test-key";
  const { createInternalRouter } = await import("./index.js");
  const { __resetKillSwitchesForTest } =
    await import("../../lib/featureFlags/runtimeKillSwitch.js");
  __resetKillSwitchesForTest();

  const app = express();
  app.use(express.json());
  app.use(createInternalRouter({ pool: pool as never }));
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      });
    },
  );
  return { app, pool };
}

function buildSummary(overrides: Partial<RagEvalSummary> = {}): RagEvalSummary {
  return {
    version: "2.0",
    mode: "mock",
    ranAt: "2026-05-13T08:00:00.000Z",
    topK: 4,
    thresholds: { warn: 0.5, kill: 0.4 },
    metrics: {
      recallAtK: { count: 50, mean: 1, min: 1, p50: 1 },
      precisionAt1: { count: 50, mean: 1, min: 1, p50: 1 },
      mrr: { count: 50, mean: 1, min: 1, p50: 1 },
    },
    aggregate: { count: 50, mean: 1, min: 1, p50: 1 },
    status: "pass",
    exitCode: 0,
    baselineComparison: null,
    ...overrides,
  };
}

describe("/api/internal/eval/rag-weekly", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sentryCaptureMessageMock.mockClear();
    sentryCaptureMessageMock.mockReturnValue("sentry-evt-test");
  });

  it("rejects unauthorized POST", async () => {
    const { app } = await makeApp();
    const res = await request(app)
      .post("/api/internal/eval/rag-weekly")
      .send(buildSummary());
    expect(res.status).toBe(401);
  });

  it("records a pass result without Sentry alert or kill-switch", async () => {
    const { app, pool } = await makeApp();
    const summary = buildSummary({ status: "pass" });
    const res = await request(app)
      .post("/api/internal/eval/rag-weekly")
      .set("Authorization", "Bearer test-key")
      .send(summary);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      recordId: 42,
      status: "pass",
      killSwitchActivated: false,
      sentryEventId: null,
    });
    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, values] = pool.query.mock.calls[0]!;
    expect(sql).toContain("INSERT INTO n8n_failure_events");
    expect(values[0]).toBe("rag-eval-weekly");
    expect(values[1]).toBe("RAG eval weekly");
    expect(values[2]).toBe("2026-05-13T08:00:00.000Z"); // execution_id = ranAt
    expect(values[3]).toBe("mock"); // last_node = mode
    expect(values[4]).toMatch(
      /^rag-eval-weekly pass mode=mock recall@4=1\.000/,
    );
    expect(sentryCaptureMessageMock).not.toHaveBeenCalled();
  });

  it("captures a Sentry warning on status=warn (no kill-switch)", async () => {
    const { app } = await makeApp();
    const summary = buildSummary({
      status: "warn",
      metrics: {
        recallAtK: { count: 50, mean: 0.45, min: 0, p50: 0.5 },
        precisionAt1: { count: 50, mean: 0.4, min: 0, p50: 0.5 },
        mrr: { count: 50, mean: 0.5, min: 0, p50: 0.5 },
      },
    });
    const res = await request(app)
      .post("/api/internal/eval/rag-weekly")
      .set("Authorization", "Bearer test-key")
      .send(summary);

    expect(res.status).toBe(200);
    expect(res.body.killSwitchActivated).toBe(false);
    expect(res.body.sentryEventId).toBe("sentry-evt-test");
    expect(sentryCaptureMessageMock).toHaveBeenCalledTimes(1);
    const call = sentryCaptureMessageMock.mock.calls[0]!;
    const msg = call[0];
    const opts = call[1];
    expect(msg).toContain("RAG quality gate warn");
    expect(msg).toContain("0.450");
    expect(opts.level).toBe("warning");
    expect(opts.tags["status"]).toBe("warn");
    expect(opts.tags["auto_disable_recommended"]).toBe("false");
  });

  it("captures Sentry error AND activates kill-switch on status=kill", async () => {
    const { app } = await makeApp();
    const { isKillSwitchActive } =
      await import("../../lib/featureFlags/runtimeKillSwitch.js");
    expect(isKillSwitchActive("mono_ai_memory_ingest")).toBe(false);

    const summary = buildSummary({
      status: "kill",
      metrics: {
        recallAtK: { count: 50, mean: 0.32, min: 0, p50: 0.25 },
        precisionAt1: { count: 50, mean: 0.3, min: 0, p50: 0.25 },
        mrr: { count: 50, mean: 0.4, min: 0, p50: 0.4 },
      },
    });
    const res = await request(app)
      .post("/api/internal/eval/rag-weekly")
      .set("Authorization", "Bearer test-key")
      .send(summary);

    expect(res.status).toBe(200);
    expect(res.body.killSwitchActivated).toBe(true);
    expect(res.body.sentryEventId).toBe("sentry-evt-test");

    expect(sentryCaptureMessageMock).toHaveBeenCalledTimes(1);
    const call = sentryCaptureMessageMock.mock.calls[0]!;
    const msg = call[0];
    const opts = call[1];
    expect(msg).toContain("RAG quality gate kill");
    expect(opts.level).toBe("error");
    expect(opts.tags["auto_disable_recommended"]).toBe("true");
    expect(isKillSwitchActive("mono_ai_memory_ingest")).toBe(true);
  });

  it("rejects malformed body (Zod 400)", async () => {
    const { app } = await makeApp();
    const res = await request(app)
      .post("/api/internal/eval/rag-weekly")
      .set("Authorization", "Bearer test-key")
      .send({ version: "2.0" }); // missing required fields
    expect(res.status).toBe(400);
  });

  it("includes baselineComparison in Sentry extras when provided", async () => {
    const { app } = await makeApp();
    const summary = buildSummary({
      status: "warn",
      metrics: {
        recallAtK: { count: 50, mean: 0.48, min: 0, p50: 0.5 },
        precisionAt1: { count: 50, mean: 0.4, min: 0, p50: 0.5 },
        mrr: { count: 50, mean: 0.5, min: 0, p50: 0.5 },
      },
      baselineComparison: {
        baselinePath: "/path/to/baseline.json",
        deltas: { recallAtK: -0.12, precisionAt1: -0.1, mrr: -0.05 },
        regression: true,
      },
    });
    const res = await request(app)
      .post("/api/internal/eval/rag-weekly")
      .set("Authorization", "Bearer test-key")
      .send(summary);
    expect(res.status).toBe(200);
    const call = sentryCaptureMessageMock.mock.calls[0]!;
    const baseline = call[1].extra["baselineComparison"] as {
      regression: boolean;
      deltas: { recallAtK: number };
    };
    expect(baseline.regression).toBe(true);
    expect(baseline.deltas.recallAtK).toBe(-0.12);
  });
});

describe("eval-rag pure helpers", () => {
  it("formatEventMessage produces stable dedup-friendly text", () => {
    const summary = buildSummary({
      status: "warn",
      metrics: {
        recallAtK: { count: 50, mean: 0.45, min: 0, p50: 0.5 },
        precisionAt1: { count: 50, mean: 0.4, min: 0, p50: 0.5 },
        mrr: { count: 50, mean: 0.5, min: 0, p50: 0.5 },
      },
    });
    const msg = formatEventMessage(summary);
    expect(msg).toBe("rag-eval-weekly warn mode=mock recall@4=0.450 count=50");
  });

  it("shouldAutoDisableMonoIngest only triggers on kill", () => {
    expect(shouldAutoDisableMonoIngest(buildSummary({ status: "pass" }))).toBe(
      false,
    );
    expect(shouldAutoDisableMonoIngest(buildSummary({ status: "warn" }))).toBe(
      false,
    );
    expect(shouldAutoDisableMonoIngest(buildSummary({ status: "kill" }))).toBe(
      true,
    );
    expect(shouldAutoDisableMonoIngest(buildSummary({ status: "error" }))).toBe(
      false,
    );
  });
});
